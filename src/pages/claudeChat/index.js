import DOMPurify from "dompurify";
import ChatModel, { summarizeToolUse } from "lib/claude/chatModel";
import ClaudeProcess, { DEFAULT_CWD } from "lib/claude/claudeProcess";
import EditorFile from "lib/editorFile";
import { renderMarkdown } from "pages/markdownPreview/renderer";
import styles from "./styles";

const TAB_ID = "claude-chat";
const MAX_BODY_CHARS = 4000;
// How long to wait for Claude to acknowledge an interrupt before ending the process.
const INTERRUPT_GRACE_MS = 4000;
const LOG_TAIL_LINES = 8;

function el(tagName, className, text) {
	const node = document.createElement(tagName);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function clip(text) {
	const value = String(text ?? "");
	return value.length > MAX_BODY_CHARS
		? `${value.slice(0, MAX_BODY_CHARS)}\n… (${value.length - MAX_BODY_CHARS} caracteres omitidos)`
		: value;
}

async function resolveCwd() {
	try {
		const { addedFolder, convertToProotPath } = await import("lib/openFolder");
		const url = addedFolder[0]?.url;
		if (url) {
			const path = convertToProotPath(url);
			if (typeof path === "string" && path.startsWith("/")) return path;
		}
	} catch (error) {
		console.warn("Claude: could not resolve the project folder", error);
	}
	return DEFAULT_CWD;
}

/**
 * Builds the chat UI and wires it to a claude process.
 * @returns {{ element: HTMLElement, dispose: () => void }}
 */
export function createClaudeChat() {
	const model = new ChatModel();
	let claude = null;
	let starting = false;
	let stopping = false;
	let interruptTimer = null;
	let logTail = [];
	let stickToBottom = true;
	let renderQueued = false;

	/** message id -> { el, blocks: Array<{ el, sig, seq }> } */
	const entries = new Map();

	const root = el("div", "claude-chat");
	const list = el("div", "claude-chat-messages");
	list.setAttribute("role", "log");
	const empty = el(
		"div",
		"claude-chat-empty",
		"Converse com o Claude Code. Ele trabalha na pasta do projeto aberto.",
	);
	list.append(empty);
	const status = el("div", "claude-chat-status");
	const form = el("form", "claude-chat-composer");
	const input = el("textarea", "claude-chat-input");
	input.rows = 1;
	input.placeholder = "Mensagem para o Claude";
	input.enterKeyHint = "enter";
	input.setAttribute("autocapitalize", "sentences");
	const sendButton = el("button", "claude-chat-button", "Enviar");
	sendButton.type = "submit";
	const stopButton = el("button", "claude-chat-button stop", "Parar");
	stopButton.type = "button";
	stopButton.hidden = true;
	form.append(input, stopButton, sendButton);
	root.append(list, status, form);

	list.addEventListener("scroll", () => {
		stickToBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
	});

	list.addEventListener("click", (event) => {
		const link = event.target.closest?.("a[href]");
		if (!link) return;
		event.preventDefault();
		const href = link.getAttribute("href");
		if (/^https?:\/\//i.test(href)) system.openInBrowser(href);
	});

	function autosize() {
		input.style.height = "auto";
		input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
	}
	input.addEventListener("input", autosize);

	function renderText(block, node, sig) {
		const seq = (node.seq = (node.seq || 0) + 1);
		const text = block.text;
		if (!node.rendered) node.el.textContent = text;
		renderMarkdown(text)
			.then(({ html }) => {
				if (node.seq !== seq) return;
				node.el.innerHTML = DOMPurify.sanitize(html);
				node.rendered = true;
				node.sig = sig;
			})
			.catch(() => {
				node.el.textContent = text;
			});
	}

	function syncBlock(message, block, node) {
		if (message.role === "user" || message.role === "notice") {
			node.el.textContent = block.text;
			return;
		}

		if (block.type === "text") {
			const sig = block.text.length;
			if (node.sig !== sig) {
				node.sig = sig;
				renderText(block, node, sig);
			}
		} else if (block.type === "thinking") {
			node.body.textContent = clip(block.text);
		} else if (block.type === "tool_use") {
			const result = block.result;
			const done = !!result;
			node.el.classList.toggle("error", !!result?.isError);
			node.summary.textContent = summarizeToolUse(block);
			node.state.textContent = !done ? "…" : result.isError ? "✗" : "✓";
			node.input.textContent = clip(
				block.input && Object.keys(block.input).length
					? JSON.stringify(block.input, null, 2)
					: block.inputJson,
			);
			node.result.hidden = !done;
			node.result.classList.toggle("error", !!result?.isError);
			node.result.textContent = done ? clip(result.text) || "(sem saída)" : "";
		}
	}

	function createBlockNode(message, block) {
		if (message.role === "user" || message.role === "notice") {
			return { el: el("div") };
		}
		if (block.type === "text") {
			return { el: el("div", "claude-text") };
		}
		if (block.type === "thinking") {
			const details = el("details", "claude-thinking");
			details.append(el("summary", "", "Raciocínio"));
			const body = el("div", "claude-thinking-body");
			details.append(body);
			return { el: details, body };
		}
		if (block.type === "tool_use") {
			const details = el("details", "claude-tool");
			const summaryLine = el("summary");
			summaryLine.append(
				el("span", "claude-tool-name", block.name || "Ferramenta"),
			);
			const summary = el("span", "claude-tool-summary");
			const state = el("span", "claude-tool-state");
			summaryLine.append(summary, state);
			const inputPre = el("pre", "claude-tool-body input");
			const resultPre = el("pre", "claude-tool-body result");
			resultPre.hidden = true;
			details.append(summaryLine, inputPre, resultPre);
			return {
				el: details,
				summary,
				state,
				input: inputPre,
				result: resultPre,
			};
		}
		return null;
	}

	function renderMessages() {
		renderQueued = false;
		empty.hidden = model.messages.length > 0;

		for (const message of model.messages) {
			let entry = entries.get(message.id);
			if (!entry) {
				const wrapper = el("div", `claude-msg ${message.role}`);
				if (message.kind) wrapper.classList.add(message.kind);
				entry = { el: wrapper, blocks: [] };
				entries.set(message.id, entry);
				list.append(wrapper);
			}

			message.blocks.forEach((block, index) => {
				if (!block) return;
				let node = entry.blocks[index];
				if (!node) {
					node = createBlockNode(message, block);
					if (!node) return;
					entry.blocks[index] = node;
					entry.el.append(node.el);
				}
				syncBlock(message, block, node);
			});
		}

		if (model.busy) {
			status.textContent = starting ? "Iniciando o Claude…" : "Trabalhando…";
		} else {
			status.textContent = "";
		}
		sendButton.disabled = model.busy;
		stopButton.hidden = !model.busy;

		if (stickToBottom) list.scrollTop = list.scrollHeight;
	}

	function scheduleRender() {
		if (renderQueued) return;
		renderQueued = true;
		setTimeout(renderMessages, 80);
	}

	model.onChange(() => {
		if (!model.busy) clearTimeout(interruptTimer);
		scheduleRender();
	});

	function onExit(code) {
		const intentional = stopping;
		stopping = false;
		clearTimeout(interruptTimer);
		if (intentional) return;
		if (model.busy) {
			const tail = logTail.slice(-LOG_TAIL_LINES).join("\n");
			model.addNotice(
				`O Claude parou (código ${code}).${tail ? `\n${tail}` : ""}`,
				"error",
			);
			model.setBusy(false);
		}
		// An idle exit is fine: the next message restarts it with --resume.
	}

	async function ensureProcess() {
		if (claude?.alive) return;
		starting = true;
		scheduleRender();
		try {
			logTail = [];
			claude = new ClaudeProcess({
				onEvent: (event) => model.apply(event),
				onLog: (line) => {
					logTail.push(line);
					if (logTail.length > 50) logTail.shift();
				},
				onExit,
			});
			await claude.start({
				cwd: await resolveCwd(),
				resumeId: model.sessionId,
			});
		} finally {
			starting = false;
		}
	}

	async function send(text) {
		model.addUserMessage(text);
		stickToBottom = true;
		try {
			await ensureProcess();
			await claude.send(text);
		} catch (error) {
			model.addNotice(
				`Não foi possível falar com o Claude: ${error?.message || error}`,
				"error",
			);
			model.setBusy(false);
		}
	}

	async function stopTurn() {
		if (!model.busy || !claude?.alive) return;
		model.markInterrupted();
		try {
			await claude.interrupt();
		} catch {
			// Falls through to the timer below.
		}
		clearTimeout(interruptTimer);
		interruptTimer = setTimeout(async () => {
			if (!model.busy) return;
			stopping = true;
			await claude.stop();
			model.addNotice("Interrompido.");
			model.setBusy(false);
		}, INTERRUPT_GRACE_MS);
	}

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const text = input.value.trim();
		if (!text || model.busy) return;
		input.value = "";
		autosize();
		send(text);
	});

	// Enter inserts a new line (phone keyboards); Ctrl/Cmd+Enter sends.
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			form.requestSubmit();
		}
	});

	stopButton.addEventListener("click", stopTurn);

	renderMessages();

	return {
		element: root,
		dispose() {
			clearTimeout(interruptTimer);
			stopping = true;
			claude?.stop();
		},
	};
}

/**
 * Opens (or focuses) the Claude chat tab.
 */
export default function openClaudeChat() {
	const existing = editorManager.files.find((file) => file.id === TAB_ID);
	if (existing) {
		existing.makeActive();
		return;
	}

	const chat = createClaudeChat();
	const file = new EditorFile("Claude", {
		id: TAB_ID,
		render: true,
		type: "page",
		content: chat.element,
		tabIcon: "icon message-circle",
		stylesheets: [styles],
		hideQuickTools: true,
		persistInSession: false,
	});
	file.onclose = () => chat.dispose();
}
