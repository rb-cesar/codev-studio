import { DEFAULT_CWD } from "./claudeProcess";
import {
	LIST_SESSIONS_SCRIPT,
	LOAD_SESSION_SCRIPT,
	OUTPUT_MARKER,
	RENAME_SESSION_SCRIPT,
} from "./sessionScripts";

const MAX_HISTORY_ENTRIES = 300;
const SESSION_ID = /^[0-9A-Za-z_-]+$/;

/**
 * Quotes one value as a literal shell argument. Unlike utils/shell, line breaks are
 * allowed: the scripts are multi-line and sit inside single quotes.
 */
function quoteArg(value) {
	const text = String(value);
	if (text.includes("\0")) {
		throw new Error("Shell arguments cannot contain NUL characters");
	}
	return `'${text.replaceAll("'", `'"'"'`)}'`;
}

/**
 * Command line that runs a Node script inside the Ubuntu sandbox.
 * @param {string} script
 * @param {string[]} [args]
 */
export function buildNodeCommand(script, args = []) {
	return ["node", "-e", script, ...args.map(String)].map(quoteArg).join(" ");
}

/**
 * Reads the JSON a session script printed after its marker.
 * @param {unknown} output
 */
export function parseScriptOutput(output) {
	const text = String(output ?? "");
	const index = text.lastIndexOf(OUTPUT_MARKER);
	if (index === -1) throw new Error("Resposta inesperada do sandbox");
	const line = text.slice(index + OUTPUT_MARKER.length).split("\n")[0];
	return JSON.parse(line);
}

/** Title shown for a session in lists. */
export function sessionTitle(session, max = 70) {
	const text = (session.custom || session.ai || session.prompt || "")
		.replace(/\s+/g, " ")
		.trim();
	if (!text) return "Sem título";
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Short, readable name for a sandbox folder: the last two path segments,
 * or "Pasta pessoal" for the sandbox home.
 */
export function folderLabel(cwd) {
	if (!cwd || cwd === DEFAULT_CWD || cwd === "/") return "Pasta pessoal";
	const parts = cwd
		.replace(/^\/public\//, "")
		.split("/")
		.filter(Boolean);
	return parts.slice(-2).join("/") || "Pasta pessoal";
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 d" or a date. */
export function formatRelativeTime(timestamp, now = Date.now()) {
	const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
	if (seconds < 60) return "agora";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `há ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `há ${hours} h`;
	const days = Math.round(hours / 24);
	if (days === 1) return "ontem";
	if (days < 30) return `há ${days} d`;
	return new Date(timestamp).toLocaleDateString("pt-BR");
}

/**
 * Reads and renames Claude Code sessions stored in the Ubuntu sandbox.
 */
export default class SessionStore {
	/** @param {object} [executor] defaults to the app's global Executor */
	constructor(executor = globalThis.Executor) {
		this.executor = executor;
	}

	async run(script, args) {
		if (!this.executor) throw new Error("Executor plugin is not available");
		const output = await this.executor.execute(
			buildNodeCommand(script, args),
			true,
		);
		return parseScriptOutput(output);
	}

	/**
	 * @returns {Promise<Array<{ id: string, mtime: number, cwd: string | null, custom: string | null, ai: string | null, prompt: string | null }>>}
	 */
	async list() {
		const sessions = await this.run(LIST_SESSIONS_SCRIPT, []);
		return Array.isArray(sessions) ? sessions : [];
	}

	/**
	 * @param {string} id
	 * @returns {Promise<{ cwd: string | null, entries: object[] }>}
	 */
	async load(id) {
		if (!SESSION_ID.test(id))
			throw new Error("Identificador de sessão inválido");
		const result = await this.run(LOAD_SESSION_SCRIPT, [
			id,
			MAX_HISTORY_ENTRIES,
		]);
		if (result?.error) throw new Error("Sessão não encontrada");
		return { cwd: result.cwd || null, entries: result.entries || [] };
	}

	/**
	 * @param {string} id
	 * @param {string} title
	 */
	async rename(id, title) {
		if (!SESSION_ID.test(id))
			throw new Error("Identificador de sessão inválido");
		const clean = String(title)
			.replace(/[\u0000-\u001f]+/g, " ")
			.trim();
		if (!clean) throw new Error("O título não pode ficar vazio");
		const result = await this.run(RENAME_SESSION_SCRIPT, [id, clean]);
		if (!result?.ok) throw new Error("Não foi possível renomear a sessão");
	}
}
