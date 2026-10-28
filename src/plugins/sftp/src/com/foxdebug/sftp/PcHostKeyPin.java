package com.foxdebug.sftp;

import com.sshtools.common.knownhosts.HostKeyVerification;
import com.sshtools.common.ssh.SshException;
import com.sshtools.common.ssh.components.SshPublicKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/**
 * Aceita somente o PC cuja impressão digital veio no convite (QR code).
 * Como a verificação acontece antes do login, o código de pareamento nunca é
 * enviado a um PC diferente do esperado.
 */
final class PcHostKeyPin implements HostKeyVerification {

  private final String expectedFingerprint;
  private volatile SshPublicKey acceptedKey;
  private volatile String rejectedFingerprint;

  PcHostKeyPin(String expectedFingerprint) {
    this.expectedFingerprint = expectedFingerprint;
  }

  /** Mesmo formato do ssh-keygen e do Go: "SHA256:" + base64 sem "=" do SHA-256 da chave. */
  static String fingerprintOf(byte[] encodedPublicKey) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(encodedPublicKey);
      return "SHA256:" + Base64.getEncoder().withoutPadding().encodeToString(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is required on every Java runtime", e);
    }
  }

  @Override
  public boolean verifyHost(String host, SshPublicKey publicKey)
    throws SshException {
    String actualFingerprint = fingerprintOf(publicKey.getEncoded());
    boolean isExpectedHost = MessageDigest.isEqual(
      actualFingerprint.getBytes(StandardCharsets.UTF_8),
      expectedFingerprint.getBytes(StandardCharsets.UTF_8)
    );
    if (!isExpectedHost) {
      rejectedFingerprint = actualFingerprint;
      return false;
    }
    acceptedKey = publicKey;
    return true;
  }

  /** A chave do PC, se ela bateu com o convite; senão null. */
  SshPublicKey acceptedKey() {
    return acceptedKey;
  }

  /** A impressão digital que o endereço apresentou, se ela não bateu; senão null. */
  String rejectedFingerprint() {
    return rejectedFingerprint;
  }
}
