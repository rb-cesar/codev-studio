import ClaudeProcess, { buildClaudeCommand } from "lib/claude/claudeProcess";
import { describe, expect, it, vi } from "vitest";

function fakeExecutor() {
	const executor = {
		onData: null,
		command: null,
		alpine: null,
		start: vi.fn(async (command, onData, alpine) => {
			executor.command = command;
			executor.onData = onData;
			executor.alpine = alpine;
			return "uuid-1";
		}),
		write: vi.fn(async () => {}),
		stop: vi.fn(async () => {}),
	};
	return executor;
}

describe("buildClaudeCommand", () => {
	it("runs claude in stream-json mode inside the project folder", () => {
		const command = buildClaudeCommand({ cwd: "/public/projetos/rea" });
		expect(command).toContain("'/bin/bash' '-c'");
		expect(command).toContain("'/public/projetos/rea'");
		expect(command).toContain("'--input-format' 'stream-json'");
		expect(command).toContain("'--output-format' 'stream-json'");
		expect(command).toContain("'--include-partial-messages'");
		expect(command).toContain("'--permission-prompts' 'none'");
		expect(command).not.toContain("--resume");
	});

	it("resumes a session when given its id", () => {
		const command = buildClaudeCommand({ resumeId: "abc-123" });
		expect(command).toContain("'--resume' 'abc-123'");
	});

	it("quotes folder names so they cannot inject shell syntax", () => {
		const command = buildClaudeCommand({ cwd: "/public/a'; rm -rf /; echo '" });
		expect(command).toContain(`'/public/a'"'"'; rm -rf /; echo '"'"''`);
	});

	it("refuses folder names with line breaks", () => {
		expect(() => buildClaudeCommand({ cwd: "/public/a\nb" })).toThrow();
	});
});

describe("ClaudeProcess", () => {
	function setup() {
		const executor = fakeExecutor();
		const events = [];
		const logs = [];
		const exits = [];
		const proc = new ClaudeProcess(
			{
				onEvent: (event) => events.push(event),
				onLog: (line) => logs.push(line),
				onExit: (code) => exits.push(code),
			},
			executor,
		);
		return { executor, proc, events, logs, exits };
	}

	it("starts inside the sandbox and parses stdout lines as JSON", async () => {
		const { executor, proc, events, logs } = setup();
		await proc.start({ cwd: "/public" });
		expect(executor.alpine).toBe(true);
		expect(proc.alive).toBe(true);

		executor.onData("stdout", '{"type":"system","subtype":"init"}');
		executor.onData("stdout", "not json");
		executor.onData("stdout", "");
		executor.onData("stderr", "warning");

		expect(events).toEqual([{ type: "system", subtype: "init" }]);
		expect(logs).toEqual(["not json", "warning"]);
	});

	it("sends a user turn as one JSON line", async () => {
		const { executor, proc } = setup();
		await proc.start({});
		await proc.send('linha 1\nlinha "2"');

		const [uuid, line] = executor.write.mock.calls[0];
		expect(uuid).toBe("uuid-1");
		expect(line).not.toContain("\n");
		expect(JSON.parse(line)).toEqual({
			type: "user",
			message: {
				role: "user",
				content: [{ type: "text", text: 'linha 1\nlinha "2"' }],
			},
		});
	});

	it("asks Claude to interrupt with a control request", async () => {
		const { executor, proc } = setup();
		await proc.start({});
		await proc.interrupt();
		const message = JSON.parse(executor.write.mock.calls[0][1]);
		expect(message.type).toBe("control_request");
		expect(message.request).toEqual({ subtype: "interrupt" });
		expect(message.request_id).toMatch(/^req_/);
	});

	it("reports the exit code and refuses to write afterwards", async () => {
		const { executor, proc, exits } = setup();
		await proc.start({});
		executor.onData("exit", "1");
		expect(exits).toEqual([1]);
		expect(proc.alive).toBe(false);
		expect(() => proc.send("oi")).toThrow("not running");
	});

	it("stops the process once", async () => {
		const { executor, proc } = setup();
		await proc.start({});
		await proc.stop();
		await proc.stop();
		expect(executor.stop).toHaveBeenCalledTimes(1);
		expect(executor.stop).toHaveBeenCalledWith("uuid-1");
	});

	it("is not left half-started when the executor fails", async () => {
		const { executor, proc } = setup();
		executor.start.mockRejectedValueOnce(new Error("sem serviço"));
		await expect(proc.start({})).rejects.toThrow("sem serviço");
		expect(proc.alive).toBe(false);
	});
});
