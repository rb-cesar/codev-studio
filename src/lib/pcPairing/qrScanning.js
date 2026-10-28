// Leitura do QR code do convite a partir de quadros da câmera.
// A câmera e a tela ficam em scanQr.js; aqui só há decodificação e a decisão
// de quando um quadro serve, com tudo de fora recebido por parâmetro.

import jsQR from "jsqr";

const DEFAULT_FRAME_INTERVAL_MS = 150;

/**
 * Procura um QR code na imagem de um quadro.
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} frame Pixels RGBA
 * @returns {string | null} O texto do QR code, ou null se não houver nenhum legível
 */
export function decodeQrText(frame) {
	const found = jsQR(frame.data, frame.width, frame.height, {
		// O QR do terminal é escuro sobre claro; tentar o inverso dobra o custo por quadro.
		inversionAttempts: "dontInvert",
	});
	return found ? found.data : null;
}

/** Outros QR codes (um cartaz, um site) são ignorados enquanto a câmera procura. */
export function looksLikeInvitation(text) {
	return /codev-pair:\/\//i.test(text);
}

/**
 * Olha quadro a quadro até aparecer o QR do convite. Devolve o texto dele, ou
 * null se `isCancelled` passar a valer antes disso.
 *
 * @param {object} options
 * @param {() => ({ data: Uint8ClampedArray, width: number, height: number } | null)} options.nextFrame null enquanto a câmera ainda não tem imagem
 * @param {(frame: object) => string | null} [options.decode]
 * @param {() => boolean} options.isCancelled
 * @param {(milliseconds: number) => Promise<void>} options.wait
 * @param {number} [options.frameIntervalMs]
 * @returns {Promise<string | null>}
 */
export async function findInvitationInFrames({
	nextFrame,
	decode = decodeQrText,
	isCancelled,
	wait,
	frameIntervalMs = DEFAULT_FRAME_INTERVAL_MS,
}) {
	while (!isCancelled()) {
		const frame = nextFrame();
		const text = frame ? decode(frame) : null;
		if (text && looksLikeInvitation(text)) return text;
		await wait(frameIntervalMs);
	}
	return null;
}
