import confirm from "dialogs/confirm";
import prompt from "dialogs/prompt";
import select from "dialogs/select";
import DOMPurify from "dompurify";
import actionStack from "lib/actionStack";
import ChatModel, { summarizeToolUse } from "lib/claude/chatModel";
import ClaudeProcess, { DEFAULT_CWD } from "lib/claude/claudeProcess";
import { sandboxPathFor } from "lib/claude/folderPath";
import SessionStore, {
	folderLabel,
	formatRelativeTime,
	sessionTitle,
} from "lib/claude/sessionStore";
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

function escapeHtml(text) {
	return String(text)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Folders a new session can work in: the open folders (the one holding the file being
 * edited first), then the sandbox home for a session without a project. `hidden` names
 * the open folders the Ubuntu sandbox cannot see.
 * @returns {Promise<{ choices: Array<{ cwd: string, label: string }>, hidden: string[] }>}
 */
async function folderChoices() {
	const choices = [];
	const hidden = [];
	try {
		const { addedFolder, convertToProotPath } = await import("lib/openFolder");
		const { default: Uri } = await import("utils/Uri");
		const toPath = (url) =>
			sandboxPathFor(url, {
				parseUri: (value) => Uri.parse(value),
				toProotPath: convertToProotPath,
				packageName: window.BuildInfo?.packageName,
			});
		const activeUri = globalThis.editorManager?.activeFile?.uri;
		const activePath = activeUri ? toPath(activeUri) : null;

		for (const folder of addedFolder) {
			const cwd = toPath(folder.url);
			if (!cwd) {
				hidden.push(folder.title || folder.url);
				continue;
			}
			if (choices.some((choice) => choice.cwd === cwd)) continue;
			const base = cwd.replace(/\/$/, "");
			choices.push({
				cwd,
				label: folderLabel(cwd),
				holdsActiveFile:
					!!activePath &&
					(activePath === cwd || activePath.startsWith(`${base}/`)),
			});
		}
		// The folder holding the open file comes first; among several, the deepest one.
		choices.sort(
			(a, b) =>
				Number(b.holdsActiveFile) - Number(a.holdsActiveFile) ||
				(a.holdsActiveFile ? b.cwd.length - a.cwd.length : 0),
		);
	} catch (error) {
		console.warn("Claude: could not list the open folders", error);
	}
	if (!choices.some((choice) => choice.cwd === DEFAULT_CWD)) {
		choices.push({ cwd: DEFAULT_CWD, label: folderLabel(DEFAULT_CWD) });
	}
	return { choices, hidden };
}

/**
 * Builds the chat UI and wires it to a claude process.
 * @returns {{ element: HTMLElement, dispose: () => void }}
 */
export function createClaudeChat() {
	const model = new ChatModel();
	const store = new SessionStore();
	/** The session on screen: its Claude id (once known), folder and title. */
	const session = { id: null, cwd: DEFAULT_CWD, title: null, custom: null };
	let claude = null;
	let starting = false;
	let loading = false;
	let interruptTimer = null;
	let logTail = [];
	let stickToBottom = true;
	let renderQueued = false;
	/** Open folders the Ubuntu sandbox cannot see, shown while the session is empty. */
	let hiddenFolders = [];

	/** message id -> { el, blocks: Array<{ el, sig, seq }> } */
	const entries = new Map();

	const root = el("div", "claude-chat");
	const list = el("div", "claude-chat-messages");
	list.setAttribute("role", "log");
	const empty = el(
		"div",
		"claude-chat-empty",
		"Converse com o Claude Code. Ele trabalha na pasta mostrada no topo.",
	);
	const emptyNote = el("div", "claude-chat-empty-note");
	empty.append(emptyNote);
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

	const header = el("div", "claude-chat-header");
	const sessionsButton = el("button", "claude-chat-hbtn", "Sessões");
	sessionsButton.type = "button";
	const titleButton = el("button", "claude-chat-htitle");
	titleButton.type = "button";
	const titleLabel = el("span", "claude-chat-htitle-text");
	const folderLabelEl = el("span", "claude-chat-htitle-folder");
	titleButton.append(titleLabel, folderLabelEl);
	const newButton = el("button", "claude-chat-hbtn", "Nova");
	newButton.type = "button";
	header.append(sessionsButton, titleButton, newButton);

	const panel = el("div", "claude-sessions");
	panel.hidden = true;
	const panelHead = el("div", "claude-sessions-head");
	const closePanelButton = el("button", "claude-chat-hbtn", "Fechar");
	closePanelButton.type = "button";
	panelHead.append(el("strong", "", "Sessões"), closePanelButton);
	const panelList = el("div", "claude-sessions-list");
	panel.append(panelHead, panelList);

	root.append(header, list, status, form, panel);

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
		emptyNote.hidden = empty.hidden || !hiddenFolders.length;
		emptyNote.textContent = hiddenFolders.length
			? `O Ubuntu do app não enxerga ${hiddenFolders.map((name) => `"${name}"`).join(", ")} (só armazenamento interno, cartão SD e a pasta pessoal). Abra o projeto pelo armazenamento interno ou clone-o na pasta pessoal.`
			: "";

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

		if (loading) {
			status.textContent = "Carregando a sessão…";
		} else if (model.busy) {
			status.textContent = starting ? "Iniciando o Claude…" : "Trabalhando…";
		} else {
			status.textContent = "";
		}
		sendButton.disabled = model.busy || loading;
		stopButton.hidden = !model.busy;
		updateHeader();

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

	function updateHeader() {
		titleLabel.textContent = session.custom || session.title || "Nova conversa";
		folderLabelEl.textContent = folderLabel(session.cwd);
		titleButton.title = session.cwd;
	}

	/** Forgets the messages on screen (the model keeps no DOM). */
	function clearView() {
		for (const entry of entries.values()) entry.el.remove();
		entries.clear();
		stickToBottom = true;
	}

	/** Ends the running process without reporting it as a failure. */
	async function stopProcess() {
		clearTimeout(interruptTimer);
		const running = claude;
		claude = null;
		await running?.stop();
	}

	function createProcess() {
		const instance = new ClaudeProcess({
			onEvent: (event) => {
				if (claude === instance) model.apply(event);
			},
			onLog: (line) => {
				logTail.push(line);
				if (logTail.length > 50) logTail.shift();
			},
			onExit: (code) => {
				// A process we ended on purpose (new session, stop) is no longer `claude`.
				if (claude !== instance) return;
				clearTimeout(interruptTimer);
				if (model.busy) {
					const tail = logTail.slice(-LOG_TAIL_LINES).join("\n");
					model.addNotice(
						`O Claude parou (código ${code}).${tail ? `\n${tail}` : ""}`,
						"error",
					);
					model.setBusy(false);
				}
				// An idle exit is fine: the next message restarts it with --resume.
			},
		});
		return instance;
	}

	async function ensureProcess() {
		if (claude?.alive) return;
		starting = true;
		scheduleRender();
		try {
			logTail = [];
			claude = createProcess();
			await claude.start({
				cwd: session.cwd,
				resumeId: model.sessionId,
			});
		} finally {
			starting = false;
		}
	}

	async function send(text) {
		if (!session.title && !session.custom) {
			session.title = text.replace(/\s+/g, " ").slice(0, 70);
		}
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
			await stopProcess();
			model.addNotice("Interrompido.");
			model.setBusy(false);
		}, INTERRUPT_GRACE_MS);
	}

	// Claude learns the session id from its first answer.
	model.onChange(() => {
		if (model.sessionId && session.id !== model.sessionId) {
			session.id = model.sessionId;
		}
	});

	async function confirmLeaving() {
		if (!model.busy) return true;
		return confirm(
			"Claude",
			"Há uma resposta em andamento. Trocar de sessão vai interrompê-la.",
		);
	}

	/**
	 * Starts an empty session in `cwd`.
	 * @param {string} [cwd] defaults to the folder holding the open file
	 */
	async function startNewSession(cwd) {
		if (loading || !(await confirmLeaving())) return;
		await stopProcess();
		model.reset();
		clearView();
		session.id = null;
		session.title = null;
		session.custom = null;
		if (cwd) {
			session.cwd = cwd;
		} else {
			const { choices, hidden } = await folderChoices();
			session.cwd = choices[0].cwd;
			hiddenFolders = hidden;
		}
		scheduleRender();
		input.focus();
	}

	/** Opens a stored session and shows its history. */
	async function openSession(info) {
		if (loading || !(await confirmLeaving())) return;
		await stopProcess();
		model.reset();
		clearView();
		loading = true;
		session.id = info.id;
		session.cwd = info.cwd || DEFAULT_CWD;
		session.title = sessionTitle(info);
		session.custom = info.custom || null;
		model.sessionId = info.id;
		scheduleRender();
		try {
			const history = await store.load(info.id);
			if (history.cwd) session.cwd = history.cwd;
			model.loadHistory(history.entries);
			stickToBottom = true;
		} catch (error) {
			model.addNotice(
				`Não foi possível abrir a sessão: ${error?.message || error}`,
				"error",
			);
		} finally {
			loading = false;
			scheduleRender();
		}
	}

	async function renameSession(id, current) {
		const title = await prompt("Renomear sessão", current || "", "text", {
			required: true,
		});
		if (!title?.trim()) return false;
		try {
			await store.rename(id, title);
		} catch (error) {
			window.toast(`Não foi possível renomear: ${error?.message || error}`);
			return false;
		}
		if (session.id === id) {
			session.custom = title.trim();
			scheduleRender();
		}
		return true;
	}

	/** Lets the user pick the folder of a session that has not started yet. */
	async function chooseFolder() {
		if (session.id || model.messages.length || model.busy) return;
		const { choices, hidden } = await folderChoices();
		hiddenFolders = hidden;
		scheduleRender();
		const picked = await select(
			"Pasta da sessão",
			choices.map((choice) => ({
				value: choice.cwd,
				text: escapeHtml(choice.label),
				subText: choice.cwd,
				icon: "folder",
			})),
			{ default: session.cwd },
		);
		if (picked) {
			session.cwd = picked;
			scheduleRender();
		}
	}

	function closePanel() {
		if (panel.hidden) return;
		panel.hidden = true;
		actionStack.remove("claude-sessions");
	}

	function renderSessionRows(sessions) {
		panelList.replaceChildren();
		if (!sessions.length) {
			panelList.append(
				el("div", "claude-sessions-empty", "Nenhuma sessão ainda."),
			);
			return;
		}
		for (const info of sessions) {
			const row = el("div", "claude-session-row");
			if (info.id === session.id) row.classList.add("current");

			const open = el("button", "claude-session-open");
			open.type = "button";
			open.append(
				el("span", "claude-session-title", sessionTitle(info)),
				el(
					"span",
					"claude-session-sub",
					`${folderLabel(info.cwd)} · ${formatRelativeTime(info.mtime)}`,
				),
			);
			open.addEventListener("click", async () => {
				closePanel();
				await openSession(info);
			});

			const rename = el("button", "claude-session-rename", "Renomear");
			rename.type = "button";
			rename.addEventListener("click", async () => {
				if (await renameSession(info.id, info.custom || sessionTitle(info))) {
					showSessions();
				}
			});

			row.append(open, rename);
			panelList.append(row);
		}
	}

	async function showSessions() {
		if (panel.hidden) {
			panel.hidden = false;
			actionStack.push({ id: "claude-sessions", action: closePanel });
		}
		panelList.replaceChildren(
			el("div", "claude-sessions-empty", "Carregando…"),
		);
		try {
			renderSessionRows(await store.list());
		} catch (error) {
			panelList.replaceChildren(
				el(
					"div",
					"claude-sessions-empty error",
					`Não foi possível listar as sessões: ${error?.message || error}`,
				),
			);
		}
	}

	sessionsButton.addEventListener("click", showSessions);
	closePanelButton.addEventListener("click", closePanel);
	newButton.addEventListener("click", () => startNewSession());
	titleButton.addEventListener("click", () => {
		if (session.id) {
			renameSession(session.id, session.custom || session.title);
		} else {
			chooseFolder();
		}
	});

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
	folderChoices().then(({ choices, hidden }) => {
		// Open folders may not be known yet when the tab opens; pick the default once.
		if (!session.id && !model.messages.length) {
			session.cwd = choices[0].cwd;
			hiddenFolders = hidden;
			scheduleRender();
		}
	});

	return {
		element: root,
		dispose() {
			closePanel();
			stopProcess();
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
