import { isCancellation, messageKeyFor } from "lib/pcPairing/failures";
import {
	InvalidInvitationError,
	InvitationProblem,
} from "lib/pcPairing/invitation";
import { runPairing } from "lib/pcPairing/pairingFlow";
import { describe, expect, it } from "vitest";

const FINGERPRINT = "SHA256:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN012";
const VALID_INVITATION = `codev-pair://v1?addr=192.168.0.10:2222&fp=${FINGERPRINT}&code=004217`;

const TEXTS = {
	"pair pc invalid invitation": "convite invalido",
	"pair pc unreachable": "PC fora do alcance",
	"pair pc wrong host": "PC diferente",
	"pair pc code refused": "codigo recusado",
	"pair pc not approved": "nao aprovado",
	"pair pc sftp failed": "sftp falhou",
};

/** Dependências de mentira: guardam o que aconteceu em `calls`. */
function fakeDependencies(overrides = {}) {
	const calls = [];
	let cancelHandler = null;
	let requestCount = 0;
	const dependencies = {
		calls,
		askInvitation: async (previous) => {
			calls.push(["ask", previous]);
			return { invitation: VALID_INVITATION, alias: "Meu PC" };
		},
		pairNative: async (requestId, invitation) => {
			calls.push(["pair", requestId, invitation]);
			return { profileId: "profile-abc" };
		},
		cancelNative: async (requestId) => {
			calls.push(["cancel", requestId]);
		},
		testConnection: async (profileId, requestId) => {
			calls.push(["test", profileId, requestId]);
			return "/";
		},
		profileUrl: (profileId) => `sftp://${profileId}/`,
		showWaiting: (onCancel) => {
			cancelHandler = onCancel;
			calls.push(["waiting-open"]);
			return { close: () => calls.push(["waiting-close"]) };
		},
		showError: async (message) => {
			calls.push(["error", message]);
		},
		translate: (key) => TEXTS[key] ?? `?${key}`,
		newRequestId: () => `req-${++requestCount}`,
		pressCancel: () => cancelHandler(),
		...overrides,
	};
	return dependencies;
}

const names = (calls) => calls.map(([name]) => name);

describe("failures", () => {
	it("mapeia cada código nativo para uma chave de texto", () => {
		expect(messageKeyFor({ code: "PC_PAIRING_UNREACHABLE" })).toBe(
			"pair pc unreachable",
		);
		expect(messageKeyFor({ code: "PC_PAIRING_HOST_KEY_MISMATCH" })).toBe(
			"pair pc wrong host",
		);
		expect(messageKeyFor({ code: "PC_PAIRING_CODE_REFUSED" })).toBe(
			"pair pc code refused",
		);
		expect(messageKeyFor({ code: "PC_PAIRING_NOT_APPROVED" })).toBe(
			"pair pc not approved",
		);
		expect(messageKeyFor({ code: "PC_PAIRING_SFTP_FAILED" })).toBe(
			"pair pc sftp failed",
		);
	});

	it("convite inválido tem a sua mensagem; erro desconhecido não tem", () => {
		const invalid = new InvalidInvitationError(InvitationProblem.INVALID_CODE);
		expect(messageKeyFor(invalid)).toBe("pair pc invalid invitation");
		expect(messageKeyFor(new Error("outro"))).toBeNull();
		expect(messageKeyFor(undefined)).toBeNull();
	});

	it("reconhece o cancelamento do plugin", () => {
		expect(
			isCancellation({ code: "SFTP_CONNECT_CANCELLED", cancelled: true }),
		).toBe(true);
		expect(isCancellation({ code: "PC_PAIRING_UNREACHABLE" })).toBe(false);
		expect(isCancellation(undefined)).toBe(false);
	});
});

describe("runPairing", () => {
	it("parea e devolve a pasta do PC para o menu de pastas", async () => {
		const dependencies = fakeDependencies();

		const entry = await runPairing(dependencies);

		expect(entry).toEqual({
			alias: "Meu PC",
			name: "Meu PC",
			url: "sftp://profile-abc/",
			type: "sftp",
			home: "/",
		});
		expect(names(dependencies.calls)).toEqual([
			"ask",
			"waiting-open",
			"pair",
			"test",
			"waiting-close",
		]);
		const pairCall = dependencies.calls.find(([name]) => name === "pair");
		expect(pairCall[2]).toEqual({
			addresses: [{ host: "192.168.0.10", port: 2222 }],
			fingerprint: FINGERPRINT,
			code: "004217",
		});
	});

	it("o teste de conexão usa um pedido diferente do pareamento", async () => {
		const dependencies = fakeDependencies();

		await runPairing(dependencies);

		const pairId = dependencies.calls.find(([name]) => name === "pair")[1];
		const testId = dependencies.calls.find(([name]) => name === "test")[2];
		expect(testId).not.toBe(pairId);
	});

	it("devolve null, sem fazer mais nada, se o usuário fecha a tela", async () => {
		const dependencies = fakeDependencies({
			askInvitation: async () => {
				throw undefined;
			},
		});

		expect(await runPairing(dependencies)).toBeNull();
		expect(names(dependencies.calls)).toEqual([]);
	});

	it("convite inválido mostra o erro e pergunta de novo com o que foi digitado", async () => {
		const answers = [
			{ invitation: "texto qualquer", alias: "Casa" },
			{ invitation: VALID_INVITATION, alias: "Casa" },
		];
		const dependencies = fakeDependencies({
			askInvitation: async (previous) => {
				dependencies.calls.push(["ask", previous]);
				return answers.shift();
			},
		});

		const entry = await runPairing(dependencies);

		expect(entry.alias).toBe("Casa");
		const asks = dependencies.calls.filter(([name]) => name === "ask");
		expect(asks[0][1]).toEqual({ invitation: "", alias: "" });
		expect(asks[1][1]).toEqual({ invitation: "texto qualquer", alias: "Casa" });
		expect(dependencies.calls).toContainEqual(["error", "convite invalido"]);
		expect(
			names(dependencies.calls).filter((name) => name === "pair"),
		).toHaveLength(1);
	});

	it.each([
		["PC_PAIRING_UNREACHABLE", "PC fora do alcance"],
		["PC_PAIRING_HOST_KEY_MISMATCH", "PC diferente"],
		["PC_PAIRING_CODE_REFUSED", "codigo recusado"],
		["PC_PAIRING_NOT_APPROVED", "nao aprovado"],
		["PC_PAIRING_SFTP_FAILED", "sftp falhou"],
	])("falha %s mostra a mensagem certa e fecha a espera", async (code, message) => {
		const dependencies = fakeDependencies({
			pairNative: async () => {
				throw { code, message: "texto tecnico" };
			},
		});

		expect(await runPairing(dependencies)).toBeNull();
		expect(dependencies.calls).toContainEqual(["error", message]);
		expect(names(dependencies.calls)).toEqual([
			"ask",
			"waiting-open",
			"waiting-close",
			"error",
		]);
	});

	it("erro desconhecido mostra a mensagem original", async () => {
		const dependencies = fakeDependencies({
			pairNative: async () => {
				throw new Error("falha estranha");
			},
		});

		await runPairing(dependencies);

		expect(dependencies.calls).toContainEqual(["error", "falha estranha"]);
	});

	it("cancelar durante a espera avisa o plugin e não mostra erro", async () => {
		let rejectPairing;
		const dependencies = fakeDependencies({
			pairNative: (requestId) => {
				dependencies.calls.push(["pair", requestId]);
				return new Promise((_, reject) => {
					rejectPairing = reject;
				});
			},
		});

		const pending = runPairing(dependencies);
		await new Promise((resolve) => setTimeout(resolve, 0));
		dependencies.pressCancel();
		rejectPairing({ code: "SFTP_CONNECT_CANCELLED", cancelled: true });

		expect(await pending).toBeNull();
		expect(dependencies.calls).toContainEqual(["cancel", "req-1"]);
		expect(names(dependencies.calls)).not.toContain("error");
		expect(names(dependencies.calls)).not.toContain("test");
		expect(
			names(dependencies.calls).filter((name) => name === "waiting-close"),
		).toHaveLength(1);
	});

	it("se o teste de conexão falha, avisa mas mantém a pasta do PC", async () => {
		const dependencies = fakeDependencies({
			testConnection: async () => {
				throw new Error("sem rede agora");
			},
		});

		const entry = await runPairing(dependencies);

		expect(entry.url).toBe("sftp://profile-abc/");
		expect(entry.home).toBe("/");
		expect(dependencies.calls).toContainEqual(["error", "sem rede agora"]);
		expect(
			names(dependencies.calls).filter((name) => name === "waiting-close"),
		).toHaveLength(1);
	});
});
