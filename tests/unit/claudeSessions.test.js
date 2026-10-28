import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	LIST_SESSIONS_SCRIPT,
	LOAD_SESSION_SCRIPT,
	RENAME_SESSION_SCRIPT,
} from "lib/claude/sessionScripts";
import SessionStore, {
	buildNodeCommand,
	folderLabel,
	formatRelativeTime,
	parseScriptOutput,
	sessionTitle,
} from "lib/claude/sessionStore";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const line = (value) => `${JSON.stringify(value)}\n`;

let home;
let projects;

function writeSession(dir, id, lines) {
	const folder = path.join(projects, dir);
	fs.mkdirSync(folder, { recursive: true });
	const file = path.join(folder, `${id}.jsonl`);
	fs.writeFileSync(file, lines.join(""));
	return file;
}

function runScript(script, args = []) {
	const output = execFileSync(process.execPath, ["-e", script, ...args], {
		env: { ...process.env, HOME: home },
		encoding: "utf8",
	});
	return parseScriptOutput(output);
}

beforeEach(() => {
	home = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sessions-"));
	projects = path.join(home, ".claude", "projects");
});

afterEach(() => {
	fs.rmSync(home, { recursive: true, force: true });
});

describe("list sessions script", () => {
	it("finds sessions of every folder, newest first, with their folder and title", () => {
		const older = writeSession("-public-rea-docs", "aaa-1", [
			line({ type: "queue-operation", operation: "enqueue" }),
			line({
				type: "user",
				cwd: "/public/projetos/rea/docs",
				message: { role: "user", content: "como   faço  o deploy?" },
			}),
			line({ type: "ai-title", aiTitle: "Deploy do site", sessionId: "aaa-1" }),
		]);
		writeSession("-public", "bbb-2", [
			line({
				type: "user",
				cwd: "/public",
				message: { role: "user", content: [{ type: "text", text: "oi" }] },
			}),
		]);
		fs.utimesSync(older, new Date(1000), new Date(1000));

		const sessions = runScript(LIST_SESSIONS_SCRIPT);
		expect(sessions.map((session) => session.id)).toEqual(["bbb-2", "aaa-1"]);
		expect(sessions[1]).toMatchObject({
			cwd: "/public/projetos/rea/docs",
			ai: "Deploy do site",
			prompt: "como faço o deploy?",
			custom: null,
		});
	});

	it("skips empty sessions, sub-agent and system prompts", () => {
		writeSession("-public", "empty-1", [
			line({ type: "attachment", cwd: "/public" }),
		]);
		writeSession("-public", "sys-2", [
			line({
				type: "user",
				cwd: "/public",
				message: {
					role: "user",
					content: "<command-name>/clear</command-name>",
				},
			}),
			line({
				type: "user",
				isSidechain: true,
				message: { role: "user", content: "tarefa do subagente" },
			}),
		]);
		writeSession("-public", "ok-3", [
			line({
				type: "user",
				isSidechain: true,
				message: { role: "user", content: "tarefa do subagente" },
			}),
			line({ type: "user", cwd: "/public", message: { content: "pergunta" } }),
		]);

		const sessions = runScript(LIST_SESSIONS_SCRIPT);
		expect(sessions.map((session) => session.id)).toEqual(["ok-3"]);
		expect(sessions[0].prompt).toBe("pergunta");
	});

	it("still finds the title written at the end of a large session", () => {
		const padding = line({ type: "attachment", note: "x".repeat(1000) });
		writeSession("-public-big", "big-1", [
			line({
				type: "user",
				cwd: "/public/big",
				message: { content: "início" },
			}),
			padding.repeat(400),
			line({
				type: "custom-title",
				customTitle: "Título final",
				sessionId: "big-1",
			}),
		]);
		const [session] = runScript(LIST_SESSIONS_SCRIPT);
		expect(session).toMatchObject({
			id: "big-1",
			cwd: "/public/big",
			prompt: "início",
			custom: "Título final",
		});
	});

	it("returns an empty list when Claude has never run", () => {
		expect(runScript(LIST_SESSIONS_SCRIPT)).toEqual([]);
	});
});

describe("load session script", () => {
	it("rebuilds the conversation with tool calls and results", () => {
		writeSession("-public-rea", "s-1", [
			line({
				type: "user",
				cwd: "/public/rea",
				message: { role: "user", content: "leia o README" },
			}),
			// One assistant message arrives as one transcript line per content block.
			line({
				type: "assistant",
				message: {
					id: "msg_1",
					content: [{ type: "thinking", thinking: "preciso ler" }],
				},
			}),
			line({
				type: "assistant",
				message: {
					id: "msg_1",
					content: [
						{
							type: "tool_use",
							id: "toolu_1",
							name: "Read",
							input: { file_path: "/public/rea/README.md" },
						},
					],
				},
			}),
			line({
				type: "user",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_1",
							content: [{ type: "text", text: "# Rea" }],
						},
					],
				},
			}),
			line({
				type: "assistant",
				message: {
					id: "msg_2",
					content: [{ type: "text", text: "É um projeto." }],
				},
			}),
			line({
				type: "assistant",
				message: {
					id: "msg_3",
					model: "<synthetic>",
					content: [{ type: "text", text: "No response requested." }],
				},
			}),
		]);

		const { cwd, entries } = runScript(LOAD_SESSION_SCRIPT, ["s-1", "300"]);
		expect(cwd).toBe("/public/rea");
		expect(entries).toEqual([
			{ k: "user", text: "leia o README" },
			{
				k: "assistant",
				id: "msg_1",
				blocks: [
					{ type: "thinking", text: "preciso ler" },
					{
						type: "tool_use",
						id: "toolu_1",
						name: "Read",
						input: { file_path: "/public/rea/README.md" },
					},
				],
			},
			{ k: "result", toolUseId: "toolu_1", text: "# Rea", isError: false },
			{
				k: "assistant",
				id: "msg_2",
				blocks: [{ type: "text", text: "É um projeto." }],
			},
		]);
	});

	it("shortens huge tool inputs and keeps only the last entries", () => {
		const lines = [];
		for (let i = 0; i < 5; i++) {
			lines.push(
				line({
					type: "user",
					message: { role: "user", content: `pergunta ${i}` },
				}),
			);
		}
		lines.push(
			line({
				type: "assistant",
				message: {
					id: "msg_big",
					content: [
						{
							type: "tool_use",
							id: "toolu_9",
							name: "Write",
							input: { content: "y".repeat(10000) },
						},
					],
				},
			}),
		);
		writeSession("-public", "s-2", lines);

		const { entries } = runScript(LOAD_SESSION_SCRIPT, ["s-2", "2"]);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toEqual({ k: "user", text: "pergunta 4" });
		const input = entries[1].blocks[0].input;
		expect(input._truncated).toBe(true);
		expect(input.preview.length).toBeLessThan(2000);
	});

	it("reports a session that does not exist", () => {
		expect(runScript(LOAD_SESSION_SCRIPT, ["nope", "10"])).toEqual({
			error: "not-found",
		});
	});

	it("does not follow a path in the session id", () => {
		expect(runScript(LOAD_SESSION_SCRIPT, ["../../etc/passwd", "10"])).toEqual({
			error: "not-found",
		});
	});
});

describe("rename session script", () => {
	it("appends a custom title that wins over the earlier ones", () => {
		const file = writeSession("-public", "r-1", [
			line({ type: "user", cwd: "/public", message: { content: "primeira" } }),
			line({ type: "ai-title", aiTitle: "Título da IA", sessionId: "r-1" }),
		]);
		expect(
			runScript(RENAME_SESSION_SCRIPT, ["r-1", "  Meu\ntítulo  "]),
		).toEqual({
			ok: true,
		});
		const last = fs.readFileSync(file, "utf8").trim().split("\n").pop();
		expect(JSON.parse(last)).toEqual({
			type: "custom-title",
			customTitle: "Meu título",
			sessionId: "r-1",
		});

		const [session] = runScript(LIST_SESSIONS_SCRIPT);
		expect(sessionTitle(session)).toBe("Meu título");
	});

	it("refuses unknown sessions and empty titles", () => {
		writeSession("-public", "r-2", [
			line({ type: "user", message: { content: "x" } }),
		]);
		expect(runScript(RENAME_SESSION_SCRIPT, ["missing", "a"])).toEqual({
			ok: false,
		});
		expect(runScript(RENAME_SESSION_SCRIPT, ["r-2", "   "])).toEqual({
			ok: false,
		});
	});
});

describe("buildNodeCommand and parseScriptOutput", () => {
	it("quotes the script and the arguments", () => {
		const command = buildNodeCommand("console.log('a b')\nx", ["it's"]);
		expect(
			command.startsWith("'node' '-e' 'console.log('\"'\"'a b'\"'\"')\nx'"),
		).toBe(true);
		expect(command.endsWith(`'it'"'"'s'`)).toBe(true);
	});

	it("reads the JSON after the marker and ignores shell noise", () => {
		expect(
			parseScriptOutput('groups: cannot find name\n@@JSON@@{"ok":true}\n'),
		).toEqual({ ok: true });
		expect(() => parseScriptOutput("nada")).toThrow();
	});
});

describe("SessionStore", () => {
	it("runs the scripts through the executor inside the sandbox", async () => {
		const calls = [];
		const executor = {
			execute: async (command, alpine) => {
				calls.push({ command, alpine });
				return '@@JSON@@[{"id":"a","mtime":1,"cwd":"/public","prompt":"oi"}]';
			},
		};
		const store = new SessionStore(executor);
		const sessions = await store.list();
		expect(sessions).toHaveLength(1);
		expect(calls[0].alpine).toBe(true);
		expect(calls[0].command.startsWith("'node' '-e'")).toBe(true);
	});

	it("rejects ids that are not plain identifiers", async () => {
		const store = new SessionStore({ execute: async () => "" });
		await expect(store.load("../x")).rejects.toThrow();
		await expect(store.rename("a b", "t")).rejects.toThrow();
		await expect(store.rename("ok", "  ")).rejects.toThrow();
	});
});

describe("display helpers", () => {
	it("names the folder of a session", () => {
		expect(folderLabel("/public")).toBe("Pasta pessoal");
		expect(folderLabel(null)).toBe("Pasta pessoal");
		expect(folderLabel("/public/projetos/rea/docs")).toBe("rea/docs");
		expect(folderLabel("/public/rea")).toBe("rea");
		expect(folderLabel("/storage/emulated/0/Dev")).toBe("0/Dev");
	});

	it("shortens titles and falls back through custom, ai and prompt", () => {
		expect(sessionTitle({ custom: "A", ai: "B", prompt: "C" })).toBe("A");
		expect(sessionTitle({ ai: "B", prompt: "C" })).toBe("B");
		expect(sessionTitle({ prompt: "C" })).toBe("C");
		expect(sessionTitle({})).toBe("Sem título");
		expect(sessionTitle({ prompt: "x".repeat(100) }, 10)).toHaveLength(10);
	});

	it("describes elapsed time in Portuguese", () => {
		const now = 10_000_000_000;
		expect(formatRelativeTime(now - 5_000, now)).toBe("agora");
		expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("há 5 min");
		expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("há 3 h");
		expect(formatRelativeTime(now - 25 * 3_600_000, now)).toBe("ontem");
		expect(formatRelativeTime(now - 4 * 86_400_000, now)).toBe("há 4 d");
	});
});
