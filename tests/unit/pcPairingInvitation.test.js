import {
	InvalidInvitationError,
	InvitationProblem,
	parseInvitation,
} from "lib/pcPairing/invitation";
import { describe, expect, it } from "vitest";

const FINGERPRINT = "SHA256:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN012";
// Mesmo formato que o codev-remote-desktop produz (url.Values.Encode):
// ":" vira %3A, "/" vira %2F e "+" vira %2B.
const ENCODED_FINGERPRINT =
	"SHA256%3AabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN012";

function problemOf(text) {
	try {
		parseInvitation(text);
	} catch (error) {
		expect(error).toBeInstanceOf(InvalidInvitationError);
		return error.problem;
	}
	throw new Error("o convite invalido foi aceito");
}

describe("parseInvitation", () => {
	it("lê endereços, impressão digital e código", () => {
		const invitation = parseInvitation(
			`codev-pair://v1?addr=192.168.0.10%3A2222&addr=10.0.0.5%3A2222&code=004217&fp=${ENCODED_FINGERPRINT}`,
		);

		expect(invitation).toEqual({
			addresses: [
				{ host: "192.168.0.10", port: 2222 },
				{ host: "10.0.0.5", port: 2222 },
			],
			fingerprint: FINGERPRINT,
			code: "004217",
		});
	});

	it("aceita os dois pontos sem codificação e espaços em volta", () => {
		const invitation = parseInvitation(
			`  codev-pair://v1?addr=192.168.0.10:2222&fp=${FINGERPRINT}&code=000001\n`,
		);

		expect(invitation.addresses).toEqual([
			{ host: "192.168.0.10", port: 2222 },
		]);
		expect(invitation.code).toBe("000001");
	});

	it("aceita a linha inteira copiada do PC, com o rótulo 'Convite:'", () => {
		const invitation = parseInvitation(
			`Convite: codev-pair://v1?addr=192.168.0.10:2222&fp=${FINGERPRINT}&code=004217\r\nCodigo: 004217`,
		);

		expect(invitation.addresses).toEqual([
			{ host: "192.168.0.10", port: 2222 },
		]);
		expect(invitation.code).toBe("004217");
	});

	it("preserva '+' e '/' da impressão digital codificados", () => {
		const fingerprint = "SHA256:ab+cdefghijklmnopqrstuvwxyzABCDEFGHIJKL/012";
		const encoded = fingerprint.replace("+", "%2B").replace("/", "%2F");

		const invitation = parseInvitation(
			`codev-pair://v1?addr=192.168.0.10:2222&fp=${encoded}&code=123456`,
		);

		expect(invitation.fingerprint).toBe(fingerprint);
	});

	it("recusa texto que não é convite", () => {
		expect(problemOf("https://exemplo.com")).toBe(
			InvitationProblem.NOT_AN_INVITATION,
		);
		expect(problemOf("")).toBe(InvitationProblem.NOT_AN_INVITATION);
		expect(problemOf(undefined)).toBe(InvitationProblem.NOT_AN_INVITATION);
	});

	it("recusa versão desconhecida", () => {
		expect(
			problemOf(
				`codev-pair://v2?addr=10.0.0.5:2222&fp=${FINGERPRINT}&code=123456`,
			),
		).toBe(InvitationProblem.UNSUPPORTED_VERSION);
	});

	it("recusa convite sem endereço", () => {
		expect(problemOf(`codev-pair://v1?fp=${FINGERPRINT}&code=123456`)).toBe(
			InvitationProblem.NO_ADDRESS,
		);
		expect(problemOf("codev-pair://v1")).toBe(InvitationProblem.NO_ADDRESS);
	});

	it.each([
		"10.0.0.5",
		"10.0.0.5:",
		"10.0.0.5:0",
		"10.0.0.5:70000",
		"10.0.0.5:22ab",
		":2222",
		"-evil.com:2222",
		"a b:2222",
	])("recusa o endereço %j", (address) => {
		expect(
			problemOf(
				`codev-pair://v1?addr=${encodeURIComponent(address)}&fp=${FINGERPRINT}&code=123456`,
			),
		).toBe(InvitationProblem.INVALID_ADDRESS);
	});

	it("um endereço ruim invalida o convite inteiro", () => {
		expect(
			problemOf(
				`codev-pair://v1?addr=10.0.0.5:2222&addr=ruim&fp=${FINGERPRINT}&code=123456`,
			),
		).toBe(InvitationProblem.INVALID_ADDRESS);
	});

	it.each([
		"",
		"SHA256:curta",
		"MD5:aa:bb:cc",
		`${FINGERPRINT}=`,
		FINGERPRINT.replace("SHA256", "sha256"),
	])("recusa a impressão digital %j", (fingerprint) => {
		expect(
			problemOf(
				`codev-pair://v1?addr=10.0.0.5:2222&fp=${encodeURIComponent(fingerprint)}&code=123456`,
			),
		).toBe(InvitationProblem.INVALID_FINGERPRINT);
	});

	it.each([
		"",
		"12345",
		"1234567",
		"12345a",
		"abcdef",
	])("recusa o código %j", (code) => {
		expect(
			problemOf(
				`codev-pair://v1?addr=10.0.0.5:2222&fp=${FINGERPRINT}&code=${code}`,
			),
		).toBe(InvitationProblem.INVALID_CODE);
	});
});
