import { execFileSync, spawnSync } from "node:child_process";
import { buildClaudeCommand } from "lib/claude/claudeProcess";
import { sandboxPathFor } from "lib/claude/folderPath";
import Uri from "utils/Uri";
import { describe, expect, it } from "vitest";

const packageName = "dev.codev.studio";
const toProotPath = (url) => {
	if (url.startsWith(`content://${packageName}.documents/`)) {
		return "/public/projetos/rea";
	}
	const clean = url.replace(/^file:\/\//, "");
	return clean.startsWith(`/data/user/0/${packageName}/files/public`)
		? clean.replace(`/data/user/0/${packageName}/files/public`, "/public")
		: clean;
};
const deps = { parseUri: (url) => Uri.parse(url), toProotPath, packageName };
const pathFor = (url) => sandboxPathFor(url, deps);

describe("sandboxPathFor", () => {
	it("maps internal storage folders opened through the file picker", () => {
		expect(
			pathFor(
				"content://com.android.externalstorage.documents/tree/primary%3ADev",
			),
		).toBe("/storage/emulated/0/Dev");
		expect(
			pathFor(
				"content://com.android.externalstorage.documents/tree/primary%3ADev::primary:Dev/app/src",
			),
		).toBe("/storage/emulated/0/Dev/app/src");
		expect(
			pathFor(
				"content://com.android.externalstorage.documents/tree/primary%3A",
			),
		).toBe("/storage/emulated/0");
	});

	it("maps SD card volumes", () => {
		expect(
			pathFor(
				"content://com.android.externalstorage.documents/tree/AA98-181D%3Aprojetos::AA98-181D:projetos/site/index.html",
			),
		).toBe("/storage/AA98-181D/projetos/site/index.html");
	});

	it("keeps plain storage paths", () => {
		expect(pathFor("file:///storage/emulated/0/Dev/")).toBe(
			"/storage/emulated/0/Dev",
		);
		expect(pathFor("/sdcard/Documents")).toBe("/sdcard/Documents");
		expect(pathFor("file:///storage/emulated/0/Meus%20Projetos")).toBe(
			"/storage/emulated/0/Meus Projetos",
		);
	});

	it("delegates the app's own folders to the terminal path conversion", () => {
		expect(
			pathFor(`content://${packageName}.documents/tree/%2Fpublic%2Fprojetos`),
		).toBe("/public/projetos/rea");
		expect(pathFor(`file:///data/user/0/${packageName}/files/public/rea`)).toBe(
			"/public/rea",
		);
	});

	it("gives up on folders the sandbox cannot see", () => {
		for (const url of [
			"content://com.termux.documents/tree/%2Fdata%2Fdata%2Fcom.termux%2Ffiles%2Fhome",
			"content://com.android.providers.downloads.documents/tree/downloads",
			"content://com.google.android.apps.docs.storage/tree/abc",
			"",
			null,
			undefined,
		]) {
			expect(pathFor(url)).toBeNull();
		}
	});

	it("refuses a path that climbs out of its volume", () => {
		expect(
			pathFor(
				"content://com.android.externalstorage.documents/tree/primary%3ADev::primary:Dev/../../data",
			),
		).toBeNull();
	});
});

describe("buildClaudeCommand folder handling", () => {
	it("fails loudly instead of falling back to another folder", () => {
		const command = buildClaudeCommand({ cwd: "/nao/existe" });
		const result = spawnSync("/bin/sh", ["-c", command], { encoding: "utf8" });
		expect(result.status).toBe(97);
		expect(result.stderr).toContain("/nao/existe");
	});

	it("starts the program in the requested folder", () => {
		const command = buildClaudeCommand({ cwd: "/tmp" }).replace(
			/'claude'.*$/s,
			"'pwd'",
		);
		expect(
			execFileSync("/bin/sh", ["-c", command], { encoding: "utf8" }).trim(),
		).toBe("/tmp");
	});
});
