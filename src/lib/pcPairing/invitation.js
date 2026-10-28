// Convite de pareamento com o PC (o texto do QR code mostrado pelo
// codev-remote-desktop). Formato:
//
//   codev-pair://v1?addr=192.168.0.10:2222&addr=...&fp=SHA256:...&code=004217
//
// Este arquivo só interpreta texto: não usa rede, câmera nem o plugin nativo.

export const InvitationProblem = Object.freeze({
	NOT_AN_INVITATION: "not-an-invitation",
	UNSUPPORTED_VERSION: "unsupported-version",
	NO_ADDRESS: "no-address",
	INVALID_ADDRESS: "invalid-address",
	INVALID_FINGERPRINT: "invalid-fingerprint",
	INVALID_CODE: "invalid-code",
});

export class InvalidInvitationError extends Error {
	constructor(problem, detail = "") {
		super(detail ? `${problem}: ${detail}` : problem);
		this.name = "InvalidInvitationError";
		this.problem = problem;
	}
}

const INVITATION_PREFIX = "codev-pair://";
const INVITATION_PATTERN = /codev-pair:\/\/\S*/i;
const SUPPORTED_VERSION = "v1";
// SHA-256 tem 32 bytes: 43 caracteres em base64 sem o "=" do final.
const FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{43}$/;
const CODE_PATTERN = /^\d{6}$/;
const HOST_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const MAX_PORT = 65535;

/**
 * @typedef {{ host: string, port: number }} PcAddress
 * @typedef {{ addresses: PcAddress[], fingerprint: string, code: string }} PcInvitation
 */

/**
 * Lê o texto de um convite. Qualquer defeito vira InvalidInvitationError com
 * o motivo em `problem`; a tela é quem traduz o motivo em mensagem.
 * @param {string} text
 * @returns {PcInvitation}
 */
export function parseInvitation(text) {
	// Quem copia a linha inteira do PC leva junto o rótulo "Convite:" e as
	// linhas seguintes; só interessa o trecho que começa em codev-pair://.
	const invitationText = INVITATION_PATTERN.exec(String(text ?? ""))?.[0];
	if (!invitationText) {
		throw new InvalidInvitationError(InvitationProblem.NOT_AN_INVITATION);
	}

	const afterPrefix = invitationText.slice(INVITATION_PREFIX.length);
	const queryStart = afterPrefix.indexOf("?");
	const version =
		queryStart === -1 ? afterPrefix : afterPrefix.slice(0, queryStart);
	if (version !== SUPPORTED_VERSION) {
		throw new InvalidInvitationError(
			InvitationProblem.UNSUPPORTED_VERSION,
			version,
		);
	}

	const query = new URLSearchParams(
		queryStart === -1 ? "" : afterPrefix.slice(queryStart + 1),
	);
	const addresses = query.getAll("addr").map(parseAddress);
	if (addresses.length === 0) {
		throw new InvalidInvitationError(InvitationProblem.NO_ADDRESS);
	}

	const fingerprint = query.get("fp") ?? "";
	if (!FINGERPRINT_PATTERN.test(fingerprint)) {
		throw new InvalidInvitationError(InvitationProblem.INVALID_FINGERPRINT);
	}

	const code = query.get("code") ?? "";
	if (!CODE_PATTERN.test(code)) {
		throw new InvalidInvitationError(InvitationProblem.INVALID_CODE);
	}

	return { addresses, fingerprint, code };
}

function parseAddress(text) {
	const separator = text.lastIndexOf(":");
	const host = separator === -1 ? "" : text.slice(0, separator);
	const portText = separator === -1 ? "" : text.slice(separator + 1);
	const port = /^\d{1,5}$/.test(portText) ? Number(portText) : 0;

	const hasValidHost = HOST_PATTERN.test(host);
	const hasValidPort = port >= 1 && port <= MAX_PORT;
	if (!hasValidHost || !hasValidPort) {
		throw new InvalidInvitationError(InvitationProblem.INVALID_ADDRESS, text);
	}
	return { host, port };
}
