// Tela da câmera para ler o QR code do convite. Só mexe com a câmera e a tela;
// a decisão de quando um quadro serve fica em qrScanning.js.

import actionStack from "lib/actionStack";
import { findInvitationInFrames } from "./qrScanning";

const SCANNER_ACTION_ID = "pc-qr-scanner";
// Quadros de câmera são grandes; reduzi-los deixa a leitura leve sem perder o QR.
const ANALYSIS_WIDTH = 640;

const sleep = (milliseconds) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Abre a câmera e devolve o texto do QR code do convite, ou null se o usuário
 * cancelar. Se a câmera não abrir (permissão negada, sem câmera), rejeita com o
 * erro do navegador (`NotAllowedError`, `NotFoundError`...).
 * O Android pede a permissão da câmera na primeira vez (o Cordova trata isso).
 * @returns {Promise<string | null>}
 */
export default async function scanQrText() {
	const stream = await navigator.mediaDevices.getUserMedia({
		video: { facingMode: { ideal: "environment" } },
		audio: false,
	});

	let cancelled = false;
	const cancel = () => {
		cancelled = true;
	};

	const $video = tag("video", {
		autoplay: true,
		muted: true,
		style: {
			position: "absolute",
			inset: "0",
			width: "100%",
			height: "100%",
			objectFit: "cover",
		},
	});
	$video.setAttribute("playsinline", "");
	$video.srcObject = stream;

	const $overlay = tag("div", {
		style: {
			position: "fixed",
			inset: "0",
			zIndex: "100000",
			background: "#000",
			display: "flex",
			flexDirection: "column",
			justifyContent: "space-between",
			alignItems: "center",
			padding: "1.5rem",
			color: "#fff",
		},
		children: [
			$video,
			tag("div", {
				textContent: strings["pair pc scanning"],
				style: {
					position: "relative",
					textAlign: "center",
					textShadow: "0 0 4px #000",
				},
			}),
			tag("button", {
				type: "button",
				textContent: strings.cancel,
				onclick: () => {
					actionStack.remove(SCANNER_ACTION_ID);
					cancel();
				},
				style: { position: "relative", padding: "0.75rem 2rem" },
			}),
		],
	});
	document.body.append($overlay);
	actionStack.push({ id: SCANNER_ACTION_ID, action: cancel });

	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d", { willReadFrequently: true });

	function nextFrame() {
		const hasPicture = $video.readyState >= 2 && $video.videoWidth > 0;
		if (!hasPicture) return null;
		const scale = Math.min(1, ANALYSIS_WIDTH / $video.videoWidth);
		canvas.width = Math.round($video.videoWidth * scale);
		canvas.height = Math.round($video.videoHeight * scale);
		context.drawImage($video, 0, 0, canvas.width, canvas.height);
		return context.getImageData(0, 0, canvas.width, canvas.height);
	}

	try {
		return await findInvitationInFrames({
			nextFrame,
			isCancelled: () => cancelled,
			wait: sleep,
		});
	} finally {
		actionStack.remove(SCANNER_ACTION_ID);
		for (const track of stream.getTracks()) track.stop();
		$overlay.remove();
	}
}
