// Runs the real `claude` CLI against a fake Anthropic API and checks that the permission
// protocol the Claude tab speaks (control_request / control_response over stream-json) works.
// Skipped when `claude` is not installed. No network, no account and no real model are used.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import ChatModel from "lib/claude/chatModel";
import ClaudeProcess from "lib/claude/claudeProcess";
import {
	allowResponse,
	DENIAL,
	denyResponse,
	parsePermissionRequest,
	planApproval,
	planText,
	sessionPermissions,
} from "lib/claude/permissions";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const hasClaude = spawnSync("claude", ["--version"]).status === 0;

/** A Messages API that answers with the given tool calls, one per turn, then with text. */
function startFakeApi(steps) {
	const server = http.createServer((req, res) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			if (!req.url.startsWith("/v1/messages")) {
				res.writeHead(404, { "content-type": "application/json" });
				res.end(
					JSON.stringify({ error: { type: "not_found_error", message: "x" } }),
				);
				return;
			}
			const json = JSON.parse(body || "{}");
			const results = (json.messages || []).reduce(
				(count, message) =>
					count +
					(Array.isArray(message.content)
						? message.content.filter((part) => part.type === "tool_result")
								.length
						: 0),
				0,
			);
			let step = steps[results] || null;
			if (step) {
				// The plan file path is only known to Claude Code: it is in the system prompt.
				const prompt =
					JSON.stringify(json.system || "") +
					JSON.stringify(json.messages || "");
				const planFile = (prompt.match(/[^"\\ ]*plans\/[^"\\ ]*\.md/) || [
					"",
				])[0];
				step = {
					tool: step.tool,
					input: JSON.parse(
						JSON.stringify(step.input).replaceAll("__PLAN_FILE__", planFile),
					),
				};
			}
			const send = (event, data) =>
				res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
			res.writeHead(200, { "content-type": "text/event-stream" });
			send("message_start", {
				type: "message_start",
				message: {
					id: `msg_${results}`,
					type: "message",
					role: "assistant",
					model: json.model || "m",
					content: [],
					stop_reason: null,
					usage: { input_tokens: 1, output_tokens: 1 },
				},
			});
			const start = step
				? {
						type: "tool_use",
						id: `toolu_${results + 1}`,
						name: step.tool,
						input: {},
					}
				: { type: "text", text: "" };
			send("content_block_start", {
				type: "content_block_start",
				index: 0,
				content_block: start,
			});
			send("content_block_delta", {
				type: "content_block_delta",
				index: 0,
				delta: step
					? {
							type: "input_json_delta",
							partial_json: JSON.stringify(step.input),
						}
					: { type: "text_delta", text: "feito" },
			});
			send("content_block_stop", { type: "content_block_stop", index: 0 });
			send("message_delta", {
				type: "message_delta",
				delta: { stop_reason: step ? "tool_use" : "end_turn" },
				usage: { output_tokens: 1 },
			});
			send("message_stop", { type: "message_stop" });
			res.end();
		});
	});
	return new Promise((resolve) =>
		server.listen(0, "127.0.0.1", () =>
			resolve({ server, port: server.address().port }),
		),
	);
}

/** Runs the command ClaudeProcess builds as a local process instead of inside the Ubuntu sandbox. */
function localExecutor(env) {
	const children = new Map();
	return {
		async start(command, onData) {
			// A process group of its own, so stop() reaches claude behind the shells.
			const child = spawn("/bin/sh", ["-c", command], { env, detached: true });
			const uuid = `u${children.size + 1}`;
			children.set(uuid, child);
			let buffer = "";
			child.stdout.on("data", (chunk) => {
				buffer += chunk;
				for (
					let end = buffer.indexOf("\n");
					end >= 0;
					end = buffer.indexOf("\n")
				) {
					onData("stdout", buffer.slice(0, end));
					buffer = buffer.slice(end + 1);
				}
			});
			child.stderr.on("data", (chunk) => onData("stderr", String(chunk)));
			child.on("exit", (code) => onData("exit", String(code ?? 1)));
			return uuid;
		},
		async write(uuid, line) {
			children.get(uuid).stdin.write(`${line}\n`);
		},
		async stop(uuid) {
			const child = children.get(uuid);
			if (!child || child.exitCode !== null) return;
			const exited = new Promise((resolve) => child.once("exit", resolve));
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				child.kill("SIGKILL");
			}
			await exited;
		},
	};
}

describe.skipIf(!hasClaude)("permission protocol with the real claude", () => {
	let api;
	let dirs;

	beforeEach(() => {
		dirs = [];
	});

	afterEach(() => {
		api?.server.close();
		for (const dir of dirs)
			fs.rmSync(dir, {
				recursive: true,
				force: true,
				maxRetries: 5,
				retryDelay: 100,
			});
	});

	/**
	 * Runs one turn. `decide(request, process, model)` answers each permission request.
	 * @returns {Promise<{ model: ChatModel, requests: object[], work: string }>}
	 */
	async function runTurn({ steps, mode = "default", decide, before }) {
		api = await startFakeApi(steps);
		const config = fs.mkdtempSync(path.join(os.tmpdir(), "claude-cfg-"));
		const work = fs.mkdtempSync(path.join(os.tmpdir(), "claude-work-"));
		dirs.push(config, work);
		const executor = localExecutor({
			PATH: process.env.PATH,
			HOME: config,
			CLAUDE_CONFIG_DIR: config,
			ANTHROPIC_BASE_URL: `http://127.0.0.1:${api.port}`,
			ANTHROPIC_API_KEY: "sk-ant-test",
			TERM: "dumb",
		});
		const model = new ChatModel();
		const requests = [];
		let claude;
		const finished = new Promise((resolve, reject) => {
			claude = new ClaudeProcess(
				{
					onEvent: (event) => {
						model.apply(event);
						if (event.type === "result") resolve();
					},
					onLog: () => {},
					onExit: (code) => reject(new Error(`claude exited with ${code}`)),
					onPermission: async (event) => {
						const request = parsePermissionRequest(event);
						requests.push(request);
						model.requestPermission(request);
						const { response, outcome } = decide(request);
						await claude.respond(request.requestId, response);
						model.resolvePermission(request.requestId, outcome);
					},
				},
				executor,
			);
		});
		await claude.start({ cwd: work, permissionMode: mode });
		if (before) await before(claude);
		model.addUserMessage("faça");
		await claude.send("faça");
		await finished;
		await claude.stop();
		return { model, requests, work };
	}

	it("asks before a command and runs it once allowed", async () => {
		const { model, requests, work } = await runTurn({
			steps: [
				{
					tool: "Bash",
					input: { command: "touch feito.txt", description: "cria" },
				},
			],
			decide: (request) => ({
				response: allowResponse(request),
				outcome: "allowed",
			}),
		});
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({ tool: "Bash", toolUseId: "toolu_1" });
		expect(model.findToolUse("toolu_1").result.isError).toBe(false);
		expect(fs.existsSync(path.join(work, "feito.txt"))).toBe(true);
		expect(model.pending).toEqual([]);
	}, 30000);

	it("does not run a command that was denied and tells Claude why", async () => {
		const { model, work } = await runTurn({
			steps: [
				{
					tool: "Bash",
					input: { command: "touch feito.txt", description: "cria" },
				},
			],
			decide: () => ({ response: denyResponse(), outcome: "denied" }),
		});
		const block = model.findToolUse("toolu_1");
		expect(block.result).toEqual({ text: DENIAL, isError: true });
		expect(block.permission).toBe("denied");
		expect(fs.existsSync(path.join(work, "feito.txt"))).toBe(false);
	}, 30000);

	it("accepts the session-only permissions it suggested", async () => {
		const { model, requests } = await runTurn({
			steps: [
				{
					tool: "Bash",
					input: { command: "touch feito.txt", description: "cria" },
				},
			],
			decide: (request) => ({
				response: allowResponse(request, sessionPermissions(request)),
				outcome: "allowed",
			}),
		});
		expect(requests[0].suggestions.length).toBeGreaterThan(0);
		expect(model.findToolUse("toolu_1").result.isError).toBe(false);
	}, 30000);

	it("shows the plan and leaves plan mode once approved", async () => {
		const { model, requests } = await runTurn({
			mode: "plan",
			steps: [
				{
					tool: "Write",
					input: { file_path: "__PLAN_FILE__", content: "# Meu plano\n- um" },
				},
				{ tool: "ExitPlanMode", input: {} },
			],
			decide: (request) => ({
				response: planApproval(request, "acceptEdits"),
				outcome: "allowed",
			}),
		});
		expect(requests.map((request) => request.tool)).toEqual(["ExitPlanMode"]);
		expect(planText(requests[0])).toBe("# Meu plano\n- um");
		expect(model.findToolUse("toolu_2").result.isError).toBe(false);
		expect(model.permissionMode).toBe("plan");
	}, 30000);

	it("applies a mode switch sent before the turn", async () => {
		const { requests, model, work } = await runTurn({
			steps: [{ tool: "Write", input: { file_path: "x.txt", content: "a" } }],
			before: (claude) => claude.setPermissionMode("acceptEdits"),
			decide: (request) => ({ response: denyResponse(), outcome: "denied" }),
		});
		expect(requests).toEqual([]);
		expect(model.findToolUse("toolu_1").result.isError).toBe(false);
		expect(fs.existsSync(path.join(work, "x.txt"))).toBe(true);
	}, 30000);
});
