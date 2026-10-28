/**
 * Chat state for the Claude tab.
 *
 * It consumes the JSON lines that `claude -p --output-format stream-json
 * --include-partial-messages` prints and keeps a list of messages the view can
 * render. It knows nothing about the DOM or about how the process is started.
 *
 * Message: { id, role: "user" | "assistant" | "notice", blocks: Block[], streaming, kind? }
 * Block:   { type: "text" | "thinking", text }
 *        | { type: "tool_use", id, name, input, inputJson, result: { text, isError } | null,
 *            permission?: "pending" | "allowed" | "denied" }
 *
 * `pending` holds the permission requests (see lib/claude/permissions) Claude is waiting on,
 * oldest first; `permissionMode` is the mode the session runs in.
 */

const SUMMARY_KEYS = [
	"command",
	"file_path",
	"path",
	"pattern",
	"url",
	"query",
	"description",
	"prompt",
];

/**
 * One-line description of a tool call, shown next to the tool name.
 * @param {{ name?: string, input?: Record<string, unknown> }} block
 * @param {number} [max]
 * @returns {string}
 */
export function summarizeToolUse(block, max = 120) {
	const input = block?.input;
	if (!input || typeof input !== "object") return "";

	let value = SUMMARY_KEYS.map((key) => input[key]).find(
		(candidate) => typeof candidate === "string" && candidate,
	);
	if (value === undefined) {
		value = Object.values(input).find(
			(candidate) => typeof candidate === "string" && candidate,
		);
	}
	if (typeof value !== "string") return "";

	const oneLine = value.replace(/\s+/g, " ").trim();
	return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function textOf(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => (part && typeof part.text === "string" ? part.text : ""))
		.filter(Boolean)
		.join("\n");
}

function blockFromApi(block) {
	switch (block?.type) {
		case "text":
			return { type: "text", text: block.text || "" };
		case "thinking":
			return { type: "thinking", text: block.thinking || "" };
		case "tool_use":
			return {
				type: "tool_use",
				id: block.id,
				name: block.name,
				input: block.input || {},
				inputJson: "",
				result: null,
			};
		default:
			// Keep the slot so block indexes from stream events stay aligned.
			return { type: "unknown" };
	}
}

export default class ChatModel {
	constructor() {
		/** @type {Array<object>} */
		this.messages = [];
		this.sessionId = null;
		this.model = null;
		this.busy = false;
		/** @type {{ ok: boolean, text: string, cost: number | null } | null} */
		this.lastResult = null;
		this.interrupted = false;
		this.permissionMode = "default";
		/** @type {Array<object>} */
		this.pending = [];
		this.listeners = new Set();
		this.current = null;
		this.byApiId = new Map();
		this.nextId = 1;
	}

	onChange(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit() {
		for (const listener of this.listeners) listener(this);
	}

	newId() {
		return `m${this.nextId++}`;
	}

	/** Forgets the whole conversation (a new session, or another one is being opened). */
	reset() {
		this.messages = [];
		this.sessionId = null;
		this.model = null;
		this.busy = false;
		this.lastResult = null;
		this.interrupted = false;
		this.pending = [];
		this.current = null;
		this.byApiId = new Map();
		this.emit();
	}

	/** A permission request arrived; the tool call it belongs to is marked as waiting. */
	requestPermission(request) {
		if (this.pending.some((item) => item.requestId === request.requestId)) {
			return;
		}
		this.pending.push(request);
		const block = this.findToolUse(request.toolUseId);
		if (block) block.permission = "pending";
		this.emit();
	}

	/**
	 * The user answered a request.
	 * @param {string} requestId
	 * @param {"allowed" | "denied"} outcome
	 */
	resolvePermission(requestId, outcome) {
		const request = this.pending.find((item) => item.requestId === requestId);
		if (!request) return;
		this.pending = this.pending.filter((item) => item !== request);
		const block = this.findToolUse(request.toolUseId);
		if (block) block.permission = outcome;
		this.emit();
	}

	/** Claude withdrew a request (a turn was interrupted, or another client answered). */
	cancelPermission(requestId) {
		const request = this.pending.find((item) => item.requestId === requestId);
		if (!request) return;
		this.pending = this.pending.filter((item) => item !== request);
		const block = this.findToolUse(request.toolUseId);
		if (block?.permission === "pending") block.permission = undefined;
		this.emit();
	}

	/** Drops every waiting request (the turn ended or the process is gone). */
	clearPermissions() {
		if (!this.pending.length) return;
		for (const request of this.pending) {
			const block = this.findToolUse(request.toolUseId);
			if (block?.permission === "pending") block.permission = undefined;
		}
		this.pending = [];
		this.emit();
	}

	setPermissionMode(mode) {
		if (this.permissionMode === mode) return;
		this.permissionMode = mode;
		this.emit();
	}

	/**
	 * Fills the conversation from a stored session.
	 * @param {Array<{ k: string }>} entries as returned by SessionStore.load()
	 */
	loadHistory(entries) {
		this.messages = [];
		this.current = null;
		this.byApiId = new Map();

		for (const entry of entries || []) {
			if (entry.k === "user") {
				this.messages.push({
					id: this.newId(),
					role: "user",
					blocks: [{ type: "text", text: entry.text }],
					streaming: false,
				});
			} else if (entry.k === "assistant") {
				this.messages.push({
					id: this.newId(),
					role: "assistant",
					blocks: entry.blocks.map((block) =>
						block.type === "tool_use"
							? {
									type: "tool_use",
									id: block.id,
									name: block.name,
									input: block.input || {},
									inputJson: "",
									result: null,
								}
							: { type: block.type, text: block.text },
					),
					streaming: false,
				});
			} else if (entry.k === "result") {
				const block = this.findToolUse(entry.toolUseId);
				if (block) {
					block.result = { text: entry.text || "", isError: !!entry.isError };
				}
			}
		}
		this.emit();
	}

	addUserMessage(text) {
		this.messages.push({
			id: this.newId(),
			role: "user",
			blocks: [{ type: "text", text }],
			streaming: false,
		});
		this.busy = true;
		this.interrupted = false;
		this.current = null;
		this.emit();
	}

	/**
	 * Adds a line that is not part of the conversation (errors, status).
	 * @param {string} text
	 * @param {"info" | "error"} [kind]
	 */
	addNotice(text, kind = "info") {
		this.messages.push({
			id: this.newId(),
			role: "notice",
			kind,
			blocks: [{ type: "text", text }],
			streaming: false,
		});
		this.emit();
	}

	/** The user asked to stop: the error result that follows is expected, not a failure. */
	markInterrupted() {
		this.interrupted = true;
	}

	setBusy(busy) {
		if (this.busy === busy) return;
		this.busy = busy;
		if (!busy) this.finishStreaming();
		this.emit();
	}

	finishStreaming() {
		for (const message of this.messages) message.streaming = false;
		this.current = null;
	}

	/**
	 * Applies one stream-json event.
	 * @param {Record<string, any>} event
	 * @returns {boolean} true when something visible changed
	 */
	apply(event) {
		if (!event || typeof event !== "object") return false;
		// Sub-agent traffic would interleave with the main answer; show only the main one.
		if (event.parent_tool_use_id) return false;

		let changed = false;
		switch (event.type) {
			case "system":
				if (event.subtype === "init") {
					this.sessionId = event.session_id || this.sessionId;
					this.model = event.model || this.model;
					if (event.permissionMode) this.permissionMode = event.permissionMode;
					changed = true;
				}
				break;
			case "stream_event":
				changed = this.applyStreamEvent(event.event);
				break;
			case "assistant":
				changed = this.applyAssistant(event.message);
				break;
			case "user":
				changed = this.applyToolResults(event.message);
				break;
			case "result":
				changed = this.applyResult(event);
				break;
			default:
				break;
		}

		if (changed) this.emit();
		return changed;
	}

	applyStreamEvent(streamEvent) {
		if (!streamEvent) return false;

		switch (streamEvent.type) {
			case "message_start": {
				const apiId = streamEvent.message?.id;
				const message = {
					id: this.newId(),
					role: "assistant",
					blocks: [],
					streaming: true,
					streamed: true,
				};
				this.messages.push(message);
				this.current = message;
				if (apiId) this.byApiId.set(apiId, message);
				return true;
			}
			case "content_block_start": {
				if (!this.current) return false;
				this.current.blocks[streamEvent.index] = blockFromApi(
					streamEvent.content_block,
				);
				return true;
			}
			case "content_block_delta": {
				const block = this.current?.blocks[streamEvent.index];
				const delta = streamEvent.delta;
				if (!block || !delta) return false;
				if (delta.type === "text_delta" && block.type === "text") {
					block.text += delta.text || "";
				} else if (
					delta.type === "thinking_delta" &&
					block.type === "thinking"
				) {
					block.text += delta.thinking || "";
				} else if (
					delta.type === "input_json_delta" &&
					block.type === "tool_use"
				) {
					block.inputJson += delta.partial_json || "";
				} else {
					return false;
				}
				return true;
			}
			case "content_block_stop": {
				const block = this.current?.blocks[streamEvent.index];
				if (block?.type === "tool_use" && block.inputJson) {
					try {
						block.input = JSON.parse(block.inputJson);
					} catch {
						// The full assistant message that follows carries the final input.
					}
				}
				return !!block;
			}
			case "message_stop": {
				if (!this.current) return false;
				this.current.streaming = false;
				return true;
			}
			default:
				return false;
		}
	}

	applyAssistant(apiMessage) {
		if (!apiMessage || !Array.isArray(apiMessage.content)) return false;

		let message = apiMessage.id ? this.byApiId.get(apiMessage.id) : null;

		// Streamed messages already hold the text; the final event only completes tool inputs.
		if (message?.streamed) {
			let changed = false;
			for (const part of apiMessage.content) {
				if (part?.type !== "tool_use") continue;
				const block = message.blocks.find(
					(candidate) =>
						candidate?.type === "tool_use" && candidate.id === part.id,
				);
				if (block) {
					block.input = part.input || block.input;
					changed = true;
				} else {
					message.blocks.push(blockFromApi(part));
					changed = true;
				}
			}
			return changed;
		}

		if (!message) {
			message = {
				id: this.newId(),
				role: "assistant",
				blocks: [],
				streaming: false,
			};
			this.messages.push(message);
			if (apiMessage.id) this.byApiId.set(apiMessage.id, message);
		}
		for (const part of apiMessage.content) {
			const block = blockFromApi(part);
			if (block.type !== "unknown") message.blocks.push(block);
		}
		return true;
	}

	applyToolResults(apiMessage) {
		if (!apiMessage || !Array.isArray(apiMessage.content)) return false;

		let changed = false;
		for (const part of apiMessage.content) {
			if (part?.type !== "tool_result") continue;
			const block = this.findToolUse(part.tool_use_id);
			if (!block) continue;
			block.result = {
				text: textOf(part.content),
				isError: part.is_error === true,
			};
			// Claude can switch to plan mode by itself.
			if (block.name === "EnterPlanMode" && !block.result.isError) {
				this.permissionMode = "plan";
			}
			changed = true;
		}
		return changed;
	}

	findToolUse(toolUseId) {
		for (let i = this.messages.length - 1; i >= 0; i--) {
			for (const block of this.messages[i].blocks) {
				if (block?.type === "tool_use" && block.id === toolUseId) return block;
			}
		}
		return null;
	}

	applyResult(event) {
		this.sessionId = event.session_id || this.sessionId;
		const ok = !event.is_error;
		this.lastResult = {
			ok,
			text: typeof event.result === "string" ? event.result : "",
			cost:
				typeof event.total_cost_usd === "number" ? event.total_cost_usd : null,
		};
		this.busy = false;
		this.pending = [];
		this.finishStreaming();
		const interrupted = this.interrupted;
		this.interrupted = false;
		if (interrupted) {
			this.addNotice("Interrompido.");
		} else if (!ok) {
			this.addNotice(
				this.lastResult.text || `Erro (${event.subtype || "desconhecido"})`,
				"error",
			);
		}
		return true;
	}
}
