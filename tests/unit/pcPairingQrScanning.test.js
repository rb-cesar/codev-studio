import fs from "node:fs";
import { parseInvitation } from "lib/pcPairing/invitation";
import {
	decodeQrText,
	findInvitationInFrames,
	looksLikeInvitation,
} from "lib/pcPairing/qrScanning";
import { describe, expect, it } from "vitest";

// A primeira linha é o convite; as demais, o QR code que o codev-remote-desktop
// desenha (# = módulo escuro), gerado pela mesma biblioteca e no mesmo nível
// de correção de erros que o programa Go usa.
const [INVITATION_URI, ...QR_ROWS] = fs
	.readFileSync(
		new URL("./fixtures/pcInvitationQr.txt", import.meta.url),
		"utf8",
	)
	.split("\n")
	.filter(Boolean);

/** Desenha o QR como imagem RGBA, como a câmera entregaria (módulos de `scale` pixels). */
function renderQr(rows, scale) {
	const size = rows.length * scale;
	const data = new Uint8ClampedArray(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const dark = rows[Math.floor(y / scale)][Math.floor(x / scale)] === "#";
			const offset = (y * size + x) * 4;
			const shade = dark ? 20 : 235;
			data[offset] = shade;
			data[offset + 1] = shade;
			data[offset + 2] = shade;
			data[offset + 3] = 255;
		}
	}
	return { data, width: size, height: size };
}

describe("decodeQrText", () => {
	it("lê o QR code que o codev-remote-desktop desenha", () => {
		const text = decodeQrText(renderQr(QR_ROWS, 8));

		expect(text).toBe(INVITATION_URI);
		expect(parseInvitation(text).code).toBe("004217");
	});

	it("lê também numa imagem pequena, como um quadro reduzido da câmera", () => {
		expect(decodeQrText(renderQr(QR_ROWS, 4))).toBe(INVITATION_URI);
	});

	it("devolve null quando não há QR code", () => {
		const blank = {
			data: new Uint8ClampedArray(200 * 200 * 4).fill(200),
			width: 200,
			height: 200,
		};

		expect(decodeQrText(blank)).toBeNull();
	});
});

describe("looksLikeInvitation", () => {
	it("reconhece o convite e recusa outros QR codes", () => {
		expect(looksLikeInvitation(INVITATION_URI)).toBe(true);
		expect(looksLikeInvitation("CODEV-PAIR://v1?x=1")).toBe(true);
		expect(looksLikeInvitation("https://example.com")).toBe(false);
	});
});

describe("findInvitationInFrames", () => {
	function scenario(
		frames,
		{ cancelAfterFrames = Number.POSITIVE_INFINITY } = {},
	) {
		const waits = [];
		let framesRequested = 0;
		return {
			waits,
			options: {
				nextFrame: () => frames[framesRequested++] ?? null,
				decode: (frame) => frame.text,
				isCancelled: () => framesRequested >= cancelAfterFrames,
				wait: async (milliseconds) => {
					waits.push(milliseconds);
				},
			},
		};
	}

	it("espera a câmera ficar pronta e devolve o convite quando aparece", async () => {
		const { options, waits } = scenario([null, null, { text: INVITATION_URI }]);

		expect(await findInvitationInFrames(options)).toBe(INVITATION_URI);
		expect(waits).toHaveLength(2);
	});

	it("ignora quadros sem QR e QR de outras coisas", async () => {
		const { options } = scenario([
			{ text: null },
			{ text: "https://example.com" },
			{ text: INVITATION_URI },
		]);

		expect(await findInvitationInFrames(options)).toBe(INVITATION_URI);
	});

	it("devolve null quando cancelam antes de aparecer um convite", async () => {
		const { options } = scenario(
			[{ text: null }, { text: "https://example.com" }, { text: null }],
			{ cancelAfterFrames: 3 },
		);

		expect(await findInvitationInFrames(options)).toBeNull();
	});

	it("não olha nenhum quadro se já começou cancelado", async () => {
		let framesRequested = 0;

		const found = await findInvitationInFrames({
			nextFrame: () => {
				framesRequested++;
				return { text: INVITATION_URI };
			},
			decode: (frame) => frame.text,
			isCancelled: () => true,
			wait: async () => {},
		});

		expect(found).toBeNull();
		expect(framesRequested).toBe(0);
	});

	it("respeita o intervalo entre quadros", async () => {
		const { options, waits } = scenario([null, { text: INVITATION_URI }]);

		await findInvitationInFrames({ ...options, frameIntervalMs: 40 });

		expect(waits).toEqual([40]);
	});
});
