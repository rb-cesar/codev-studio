// Sequência do pareamento com o PC: pedir o convite, conferir, parear, testar
// e devolver a pasta do PC para o menu de pastas.
//
// Tudo que toca o mundo (tela, plugin nativo, texto) chega por `dependencies`;
// assim a sequência pode ser testada sem celular (ver pcPairingFlow.test.js).

import { isCancellation, messageKeyFor } from "./failures";
import { InvalidInvitationError, parseInvitation } from "./invitation";

/**
 * @typedef {import("./invitation").PcInvitation} PcInvitation
 *
 * @typedef {object} PairingForm
 * @property {string} invitation Texto do convite (o que o QR code contém)
 * @property {string} alias Nome que o usuário dá ao PC
 *
 * @typedef {object} PairingDependencies
 * @property {(previous: PairingForm) => Promise<PairingForm>} askInvitation Rejeita quando o usuário fecha a tela
 * @property {(requestId: string, invitation: PcInvitation) => Promise<{profileId: string}>} pairNative
 * @property {(requestId: string) => Promise<void>} cancelNative
 * @property {(profileId: string, requestId: string) => Promise<string>} testConnection Devolve a pasta inicial
 * @property {(profileId: string) => string} profileUrl
 * @property {(onCancel: () => void) => { close: () => void }} showWaiting
 * @property {(message: string) => Promise<void>} showError
 * @property {(key: string) => string} translate
 * @property {() => string} newRequestId
 */

/**
 * Devolve a entrada de armazenamento para o menu de pastas, ou null se o
 * usuário desistiu ou o pareamento não deu certo (o erro já foi mostrado).
 * @param {PairingDependencies} dependencies
 */
export async function runPairing(dependencies) {
	const { askInvitation, showError, translate } = dependencies;
	let form = { invitation: "", alias: "" };

	for (;;) {
		try {
			form = await askInvitation(form);
		} catch {
			return null;
		}

		let invitation;
		try {
			invitation = parseInvitation(form.invitation);
		} catch (error) {
			if (!(error instanceof InvalidInvitationError)) throw error;
			await showError(translate(messageKeyFor(error)));
			continue;
		}
		return pairAndConnect(dependencies, invitation, form.alias);
	}
}

async function pairAndConnect(dependencies, invitation, alias) {
	const { pairNative, cancelNative, testConnection, profileUrl } = dependencies;
	const requestId = dependencies.newRequestId();
	let cancelled = false;
	const waiting = dependencies.showWaiting(() => {
		cancelled = true;
		cancelNative(requestId);
	});

	let profile;
	try {
		profile = await pairNative(requestId, invitation);
	} catch (error) {
		waiting.close();
		if (!cancelled && !isCancellation(error)) {
			await reportFailure(dependencies, error);
		}
		return null;
	}
	if (cancelled) {
		waiting.close();
		return null;
	}

	// O pareamento já deu certo (a chave está autorizada no PC). Se o teste de
	// conexão falhar, avisa mas mantém a pasta: abrir de novo tenta outra vez.
	let home = "/";
	let connectionError = null;
	try {
		home = await testConnection(profile.profileId, `${requestId}-test`);
	} catch (error) {
		connectionError = error;
	}
	waiting.close();
	if (connectionError && !isCancellation(connectionError)) {
		await reportFailure(dependencies, connectionError);
	}

	return {
		alias,
		name: alias,
		url: profileUrl(profile.profileId),
		type: "sftp",
		home,
	};
}

async function reportFailure({ showError, translate }, error) {
	const messageKey = messageKeyFor(error);
	const message = messageKey ? translate(messageKey) : describe(error);
	await showError(message);
}

function describe(error) {
	return error?.message ?? String(error);
}
