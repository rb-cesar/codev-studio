// Liga a sequência do pareamento (pairingFlow.js) à tela e ao plugin nativo.

import Sftp from "fileSystem/sftp";
import loader from "dialogs/loader";
import multiPrompt from "dialogs/multiPrompt";
import { createSftpProfileUrl } from "lib/sftpProfiles";
import helpers from "utils/helpers";
import { messageKeyFor } from "./failures";
import { runPairing } from "./pairingFlow";
import scanQrText from "./scanQr";

function askInvitation(previous) {
	return multiPrompt(
		strings["pair pc"],
		[
			{
				id: "alias",
				placeholder: strings.name,
				type: "text",
				value: previous.alias || strings["pair pc default name"],
				required: true,
			},
			{
				id: "scan",
				placeholder: strings["pair pc scan qr"],
				type: "text",
				readOnly: true,
				async onclick() {
					try {
						const text = await scanQrText();
						if (text) this.prompt.$body.get("#invitation").value = text;
					} catch (error) {
						const messageKey = messageKeyFor(error);
						await helpers.error(
							messageKey ? strings[messageKey] : (error?.message ?? error),
						);
					}
				},
			},
			{
				id: "invitation",
				placeholder: strings["pair pc invitation"],
				type: "text",
				value: previous.invitation,
				required: true,
			},
		],
		strings["pair pc help"],
	);
}

function pairNative(requestId, { addresses, fingerprint, code }) {
	return new Promise((resolve, reject) => {
		sftp.pairWithPc(requestId, addresses, fingerprint, code, resolve, reject);
	});
}

function cancelNative(requestId) {
	return new Promise((resolve) => {
		sftp.cancelConnection(requestId, resolve, resolve);
	});
}

function testConnection(profileId, requestId) {
	return Sftp(null, 22, null, { profileID: profileId }).testConnection(
		requestId,
	);
}

function showWaiting(onCancel) {
	const waiting = loader.create(
		strings["pair pc"],
		strings["pair pc waiting"],
		{ timeout: 0, oncancel: onCancel },
	);
	return { close: () => waiting.destroy() };
}

/** Abre o pareamento e devolve a pasta do PC para o menu de pastas (ou null). */
export default function pairWithPc() {
	return runPairing({
		askInvitation,
		pairNative,
		cancelNative,
		testConnection,
		profileUrl: createSftpProfileUrl,
		showWaiting,
		showError: (message) => helpers.error(message),
		translate: (key) => strings[key],
		newRequestId: () => `pair-pc-${helpers.uuid()}`,
	});
}
