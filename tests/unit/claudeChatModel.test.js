import ChatModel, { summarizeToolUse } from "lib/claude/chatModel";
import { describe, expect, it } from "vitest";

const SESSION = "11111111-2222-3333-4444-555555555555";

const stream = (event, extra = {}) => ({
	type: "stream_event",
	event,
	session_id: SESSION,
	parent_tool_use_id: null,
	...extra,
});

function textTurn(model, pieces) {
	model.apply(stream({ type: "message_start", message: { id: "msg_1" } }));
	model.apply(
		stream({
			type: "content_block_start",
			index: 0,
			content_block: { type: "text", text: "" },
		}),
	);
	for (const piece of pieces) {
		model.apply(
			stream({
				type: "content_block_delta",
				index: 0,
				delta: { type: "text_delta", text: piece },
			}),
		);
	}
	model.apply(stream({ type: "content_block_stop", index: 0 }));
	model.apply(stream({ type: "message_stop" }));
}

describe("ChatModel", () => {
	it("records the session id and model from the init event", () => {
		const model = new ChatModel();
		const changed = model.apply({
			type: "system",
			subtype: "init",
			session_id: SESSION,
			model: "claude-sonnet-5-5",
		});
		expect(changed).toBe(true);
		expect(model.sessionId).toBe(SESSION);
		expect(model.model).toBe("claude-sonnet-5-5");
	});

	it("ignores events it does not know", () => {
		const model = new ChatModel();
		expect(model.apply({ type: "active_goal", value: null })).toBe(false);
		expect(model.apply({ type: "autocompact_state", value: {} })).toBe(false);
		expect(model.apply(null)).toBe(false);
		expect(model.messages).toEqual([]);
	});

	it("builds streamed text from deltas", () => {
		const model = new ChatModel();
		model.addUserMessage("oi");
		textTurn(model, ["Oi, Cé", "sar!"]);

		expect(model.messages).toHaveLength(2);
		const [user, assistant] = model.messages;
		expect(user.role).toBe("user");
		expect(user.blocks[0].text).toBe("oi");
		expect(assistant.blocks[0]).toEqual({ type: "text", text: "Oi, César!" });
		expect(assistant.streaming).toBe(false);
	});

	it("does not duplicate text when the final assistant event follows the stream", () => {
		const model = new ChatModel();
		textTurn(model, ["Olá"]);
		model.apply({
			type: "assistant",
			message: { id: "msg_1", content: [{ type: "text", text: "Olá" }] },
		});
		expect(model.messages).toHaveLength(1);
		expect(model.messages[0].blocks).toHaveLength(1);
	});

	it("shows an assistant message that never streamed", () => {
		const model = new ChatModel();
		model.apply({
			type: "assistant",
			message: { id: "msg_9", content: [{ type: "text", text: "pronto" }] },
		});
		model.apply({
			type: "assistant",
			message: {
				id: "msg_9",
				content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }],
			},
		});
		expect(model.messages).toHaveLength(1);
		expect(model.messages[0].blocks.map((block) => block.type)).toEqual([
			"text",
			"tool_use",
		]);
	});

	it("assembles a tool call and attaches its result", () => {
		const model = new ChatModel();
		model.apply(stream({ type: "message_start", message: { id: "msg_2" } }));
		model.apply(
			stream({
				type: "content_block_start",
				index: 0,
				content_block: {
					type: "tool_use",
					id: "toolu_1",
					name: "Bash",
					input: {},
				},
			}),
		);
		for (const part of ['{"command":', '"ls -la"}']) {
			model.apply(
				stream({
					type: "content_block_delta",
					index: 0,
					delta: { type: "input_json_delta", partial_json: part },
				}),
			);
		}
		model.apply(stream({ type: "content_block_stop", index: 0 }));

		const block = model.messages[0].blocks[0];
		expect(block.input).toEqual({ command: "ls -la" });
		expect(block.result).toBeNull();

		model.apply({
			type: "user",
			message: {
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "toolu_1",
						content: [{ type: "text", text: "total 0" }],
						is_error: false,
					},
				],
			},
		});
		expect(block.result).toEqual({ text: "total 0", isError: false });
	});

	it("keeps a partial tool input readable when the JSON is cut off", () => {
		const model = new ChatModel();
		model.apply(stream({ type: "message_start", message: { id: "msg_3" } }));
		model.apply(
			stream({
				type: "content_block_start",
				index: 0,
				content_block: {
					type: "tool_use",
					id: "toolu_2",
					name: "Edit",
					input: {},
				},
			}),
		);
		model.apply(
			stream({
				type: "content_block_delta",
				index: 0,
				delta: { type: "input_json_delta", partial_json: '{"file_pa' },
			}),
		);
		model.apply(stream({ type: "content_block_stop", index: 0 }));
		const block = model.messages[0].blocks[0];
		expect(block.input).toEqual({});
		expect(block.inputJson).toBe('{"file_pa');
	});

	it("ignores sub-agent traffic", () => {
		const model = new ChatModel();
		const changed = model.apply(
			stream(
				{ type: "message_start", message: { id: "msg_sub" } },
				{ parent_tool_use_id: "toolu_parent" },
			),
		);
		expect(changed).toBe(false);
		expect(model.messages).toEqual([]);
	});

	it("goes idle on a successful result", () => {
		const model = new ChatModel();
		model.addUserMessage("oi");
		expect(model.busy).toBe(true);
		textTurn(model, ["ok"]);
		model.apply({
			type: "result",
			subtype: "success",
			is_error: false,
			result: "ok",
			session_id: SESSION,
			total_cost_usd: 0.01,
		});
		expect(model.busy).toBe(false);
		expect(model.sessionId).toBe(SESSION);
		expect(model.lastResult).toEqual({ ok: true, text: "ok", cost: 0.01 });
		expect(model.messages.at(-1).role).toBe("assistant");
	});

	it("shows an error result as a notice", () => {
		const model = new ChatModel();
		model.addUserMessage("oi");
		model.apply({
			type: "result",
			subtype: "error_during_execution",
			is_error: true,
			result: "Falha de autenticação",
			session_id: SESSION,
		});
		const last = model.messages.at(-1);
		expect(model.busy).toBe(false);
		expect(last.role).toBe("notice");
		expect(last.kind).toBe("error");
		expect(last.blocks[0].text).toBe("Falha de autenticação");
	});

	it("shows an interrupted turn as information, not as an error", () => {
		const model = new ChatModel();
		model.addUserMessage("faça algo longo");
		model.markInterrupted();
		model.apply({
			type: "result",
			subtype: "error_during_execution",
			is_error: true,
			result: "",
			session_id: SESSION,
		});
		const last = model.messages.at(-1);
		expect(last.role).toBe("notice");
		expect(last.kind).toBe("info");
		expect(last.blocks[0].text).toBe("Interrompido.");
	});

	it("notifies listeners when something changes", () => {
		const model = new ChatModel();
		let calls = 0;
		const off = model.onChange(() => calls++);
		model.addUserMessage("oi");
		expect(calls).toBe(1);
		off();
		model.addNotice("x");
		expect(calls).toBe(1);
	});
});

describe("summarizeToolUse", () => {
	it("prefers the field that best describes the call", () => {
		expect(summarizeToolUse({ input: { command: "ls   -la\n/tmp" } })).toBe(
			"ls -la /tmp",
		);
		expect(
			summarizeToolUse({ input: { file_path: "/a/b.js", old: "x" } }),
		).toBe("/a/b.js");
	});

	it("falls back to the first string and truncates long values", () => {
		expect(summarizeToolUse({ input: { n: 1, other: "valor" } })).toBe("valor");
		const long = "x".repeat(300);
		const summary = summarizeToolUse({ input: { command: long } }, 20);
		expect(summary).toHaveLength(20);
		expect(summary.endsWith("…")).toBe(true);
	});

	it("returns an empty string without usable input", () => {
		expect(summarizeToolUse({})).toBe("");
		expect(summarizeToolUse({ input: { n: 1 } })).toBe("");
	});
});
