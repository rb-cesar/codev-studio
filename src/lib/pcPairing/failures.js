// Traduz o que deu errado no pareamento para a chave de texto da tela.
// Não mostra nada: só decide qual mensagem usar.

import { InvalidInvitationError } from "./invitation";

const MESSAGE_KEY_BY_NATIVE_CODE = Object.freeze({
	PC_PAIRING_UNREACHABLE: "pair pc unreachable",
	PC_PAIRING_HOST_KEY_MISMATCH: "pair pc wrong host",
	PC_PAIRING_CODE_REFUSED: "pair pc code refused",
	PC_PAIRING_NOT_APPROVED: "pair pc not approved",
	PC_PAIRING_SFTP_FAILED: "pair pc sftp failed",
});

/**
 * Chave de texto (em src/lang) que explica o erro, ou null se não for um erro
 * conhecido (quem chama mostra a mensagem original).
 * @param {unknown} error
 * @returns {string | null}
 */
export function messageKeyFor(error) {
	if (error instanceof InvalidInvitationError) {
		return "pair pc invalid invitation";
	}
	return MESSAGE_KEY_BY_NATIVE_CODE[error?.code] ?? null;
}

/** O usuário cancelou a espera; não há erro para mostrar. */
export function isCancellation(error) {
	return error?.cancelled === true || error?.code === "SFTP_CONNECT_CANCELLED";
}
