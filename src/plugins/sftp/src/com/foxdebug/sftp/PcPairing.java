package com.foxdebug.sftp;

import com.sshtools.client.SessionChannelNG;
import com.sshtools.client.SshClient;
import com.sshtools.client.SshClient.OnConfiguration;
import com.sshtools.client.SshClient.SshClientBuilder;
import com.sshtools.client.sftp.SftpClient;
import com.sshtools.client.sftp.SftpClient.SftpClientBuilder;
import com.sshtools.common.publickey.SshKeyPairGenerator;
import com.sshtools.common.publickey.SshKeyUtils;
import com.sshtools.common.ssh.components.SshKeyPair;
import com.sshtools.common.ssh.components.SshPublicKey;
import java.util.List;

/**
 * Pareia este celular com um PC que roda o codev-remote-desktop.
 *
 * O celular cria uma chave nova, conecta com o usuário "pair-CODIGO" (o código
 * vem do QR code) e fica esperando o dono do PC aprovar. Só depois da aprovação
 * o PC grava a chave; daí em diante o celular entra com ela, sem código.
 *
 * Esta classe só usa Maverick e a JVM (nada de Android), para poder ser testada
 * contra o servidor Go de verdade fora do celular.
 */
final class PcPairing {

  static final String USERNAME_PREFIX = "pair-";
  /** O PC ignora o nome de usuário depois do pareamento; este é só um rótulo. */
  static final String PAIRED_USERNAME = "codev";

  enum Failure {
    /** Nenhum endereço do convite respondeu. */
    UNREACHABLE,
    /** Um endereço respondeu, mas com outra impressão digital (outro PC). */
    HOST_KEY_MISMATCH,
    /** O PC recusou o código (errado, vencido, já usado ou tentativas esgotadas). */
    CODE_REFUSED,
    /** O código valeu, mas o dono não aprovou (ou não respondeu a tempo). */
    NOT_APPROVED,
    /** O dono aprovou, mas o PC não abriu o SFTP. */
    SFTP_FAILED,
    CANCELLED,
  }

  static final class PairingException extends Exception {

    final Failure failure;

    PairingException(Failure failure, String detail, Throwable cause) {
      super(failure + (detail.isEmpty() ? "" : ": " + detail), cause);
      this.failure = failure;
    }
  }

  static final class Endpoint {

    final String host;
    final int port;

    Endpoint(String host, int port) {
      this.host = host;
      this.port = port;
    }

    @Override
    public String toString() {
      return host + ":" + port;
    }
  }

  /** O que o pareamento entrega a quem vai guardar o perfil. */
  static final class Paired {

    final Endpoint endpoint;
    /** Chave privada no formato OpenSSH, sem senha. */
    final String privateKey;
    /** Chave do PC, já conferida com o convite. */
    final SshPublicKey hostKey;

    Paired(Endpoint endpoint, String privateKey, SshPublicKey hostKey) {
      this.endpoint = endpoint;
      this.privateKey = privateKey;
      this.hostKey = hostKey;
    }
  }

  interface Cancellation {
    boolean isCancelled();
  }

  private PcPairing() {}

  /**
   * Tenta cada endereço, na ordem, até um deles parear.
   *
   * @param connectTimeoutMillis tempo para cada endereço responder
   * @param approvalTimeoutMillis tempo que o dono do PC tem para aprovar
   * @param configureClient ajustes que Sftp.java aplica a todas as conexões
   */
  static Paired pair(
    List<Endpoint> endpoints,
    String expectedFingerprint,
    String code,
    long connectTimeoutMillis,
    long approvalTimeoutMillis,
    OnConfiguration configureClient,
    Cancellation cancellation
  ) throws PairingException {
    SshKeyPair keyPair;
    String privateKey;
    try {
      keyPair = SshKeyPairGenerator.generateKeyPair(SshKeyPairGenerator.ED25519);
      privateKey = SshKeyUtils.getFormattedKey(keyPair, "");
    } catch (Exception e) {
      throw new PairingException(
        Failure.UNREACHABLE,
        "could not create the phone key",
        e
      );
    }

    PairingException worstFailure = null;
    for (Endpoint endpoint : endpoints) {
      if (cancellation.isCancelled()) {
        throw new PairingException(Failure.CANCELLED, "", null);
      }
      try {
        SshPublicKey hostKey = pairWithEndpoint(
          endpoint,
          expectedFingerprint,
          code,
          connectTimeoutMillis,
          approvalTimeoutMillis,
          keyPair,
          configureClient
        );
        return new Paired(endpoint, privateKey, hostKey);
      } catch (PairingException failure) {
        if (isFinal(failure.failure)) throw failure;
        worstFailure = moreInformative(worstFailure, failure);
      }
    }
    if (worstFailure == null) {
      throw new PairingException(Failure.UNREACHABLE, "no address", null);
    }
    throw worstFailure;
  }

  /**
   * O código só pode ser gasto uma vez e tem poucas tentativas: depois que um
   * PC o recebeu, não adianta tentar os outros endereços.
   */
  static boolean isFinal(Failure failure) {
    return (
      failure == Failure.CODE_REFUSED ||
      failure == Failure.NOT_APPROVED ||
      failure == Failure.SFTP_FAILED ||
      failure == Failure.CANCELLED
    );
  }

  /** Entre "ninguém respondeu" e "respondeu o PC errado", a segunda ajuda mais. */
  static PairingException moreInformative(
    PairingException current,
    PairingException candidate
  ) {
    boolean candidateIsMismatch = candidate.failure == Failure.HOST_KEY_MISMATCH;
    return current == null || candidateIsMismatch ? candidate : current;
  }

  private static SshPublicKey pairWithEndpoint(
    Endpoint endpoint,
    String expectedFingerprint,
    String code,
    long connectTimeoutMillis,
    long approvalTimeoutMillis,
    SshKeyPair keyPair,
    OnConfiguration configureClient
  ) throws PairingException {
    PcHostKeyPin hostKeyPin = new PcHostKeyPin(expectedFingerprint);
    SshClient client = null;
    try {
      try {
        client = SshClientBuilder.create()
          .withHostname(endpoint.host)
          .withPort(endpoint.port)
          .withConnectTimeout(connectTimeoutMillis)
          .withUsername(USERNAME_PREFIX + code)
          .withIdentities(keyPair)
          .onConfigure(
            context -> {
              configureClient.accept(context);
              context.setHostKeyVerification(hostKeyPin);
            }
          )
          .build();
      } catch (Exception e) {
        throw describeConnectionFailure(endpoint, hostKeyPin, e);
      }
      if (!client.isConnected()) {
        throw describeConnectionFailure(endpoint, hostKeyPin, null);
      }
      if (!client.isAuthenticated()) {
        throw new PairingException(Failure.CODE_REFUSED, endpoint.toString(), null);
      }

      awaitOwnerApproval(client, endpoint, approvalTimeoutMillis);

      try (
        SftpClient sftp = SftpClientBuilder.create().withClient(client).build()
      ) {
        sftp.pwd();
      } catch (Exception e) {
        throw new PairingException(Failure.SFTP_FAILED, endpoint.toString(), e);
      }
      return hostKeyPin.acceptedKey();
    } finally {
      closeQuietly(client);
    }
  }

  /**
   * O PC só atende pedidos de canal depois que o dono aprova. Abrir (e fechar
   * em seguida) um canal de sessão é, portanto, a forma de esperar a resposta
   * dele com um prazo nosso, que o do SFTP (cerca de 1 minuto) não permite.
   */
  private static void awaitOwnerApproval(
    SshClient client,
    Endpoint endpoint,
    long approvalTimeoutMillis
  ) throws PairingException {
    try {
      SessionChannelNG approvalProbe = client.openSessionChannel(
        approvalTimeoutMillis
      );
      approvalProbe.close();
    } catch (Exception e) {
      throw new PairingException(Failure.NOT_APPROVED, endpoint.toString(), e);
    }
  }

  /**
   * Por que a conexão não chegou a ficar autenticada? A ordem do SSH ajuda:
   * a impressão digital é conferida antes do login.
   */
  private static PairingException describeConnectionFailure(
    Endpoint endpoint,
    PcHostKeyPin hostKeyPin,
    Exception cause
  ) {
    if (hostKeyPin.rejectedFingerprint() != null) {
      return new PairingException(
        Failure.HOST_KEY_MISMATCH,
        endpoint + " presented " + hostKeyPin.rejectedFingerprint(),
        cause
      );
    }
    boolean hostWasTrusted = hostKeyPin.acceptedKey() != null;
    return new PairingException(
      hostWasTrusted ? Failure.CODE_REFUSED : Failure.UNREACHABLE,
      endpoint.toString(),
      cause
    );
  }

  private static void closeQuietly(SshClient client) {
    if (client == null) return;
    try {
      client.close();
    } catch (Exception ignored) {
      // já estava fechado
    }
  }
}
