import { quotePosixShellArg } from "utils/shell";

/** Folder used when no project folder is open (the sandbox home). */
export const DEFAULT_CWD = "/public";

/**
 * Builds the shell command Executor.start() runs inside the Ubuntu sandbox.
 * The prompt travels over stdin, so nothing the user types ends up in the command line.
 * @param {{ cwd?: string, resumeId?: string | null, permissionMode?: string, model?: string | null }} options
 * @returns {string}
 */
export function buildClaudeCommand({
	cwd = DEFAULT_CWD,
	resumeId = null,
	permissionMode = "acceptEdits",
	model = null,
} = {}) {
	const claudeArgs = [
		"claude",
		"-p",
		"--input-format",
		"stream-json",
		"--output-format",
		"stream-json",
		"--verbose",
		"--include-partial-messages",
		"--permission-mode",
		permissionMode,
		// Nobody answers permission prompts yet: anything that would ask is denied.
		"--permission-prompts",
		"none",
	];
	if (model) claudeArgs.push("--model", model);
	if (resumeId) claudeArgs.push("--resume", resumeId);

	// Same preparation the interactive shell does (see initrc): a sticky /tmp and no Android PREFIX.
	const script = [
		// A folder the sandbox cannot reach is an error, not a silent move to /public.
		'cd "$1" || { echo "A pasta $1 não existe ou não está acessível no Ubuntu do app." >&2; exit 97; }',
		"shift",
		"export TMPDIR=/tmp",
		'[ "$(stat -c %a /tmp)" = 1777 ] || chmod 1777 /tmp',
		"unset PREFIX",
		'exec "$@"',
	].join("; ");

	return ["/bin/bash", "-c", script, "_", cwd, ...claudeArgs]
		.map(quotePosixShellArg)
		.join(" ");
}

let requestCounter = 0;

/**
 * One `claude` process kept open between turns, talking stream-json over stdin/stdout.
 */
export default class ClaudeProcess {
	/**
	 * @param {object} handlers
	 * @param {(event: Record<string, any>) => void} handlers.onEvent a parsed stdout line
	 * @param {(line: string) => void} handlers.onLog stderr, or a stdout line that is not JSON
	 * @param {(code: number) => void} handlers.onExit the process ended
	 * @param {object} [executor] defaults to the app's global Executor
	 */
	constructor({ onEvent, onLog, onExit }, executor = globalThis.Executor) {
		this.onEvent = onEvent;
		this.onLog = onLog;
		this.onExit = onExit;
		this.executor = executor;
		this.uuid = null;
		this.alive = false;
	}

	async start(options) {
		if (this.alive) return;
		if (!this.executor) throw new Error("Executor plugin is not available");

		const command = buildClaudeCommand(options);
		this.alive = true;
		try {
			this.uuid = await this.executor.start(
				command,
				(type, data) => this.handle(type, data),
				true,
			);
		} catch (error) {
			this.alive = false;
			throw error;
		}
	}

	handle(type, data) {
		if (type === "stdout") {
			const line = String(data).trim();
			if (!line) return;
			let event;
			try {
				event = JSON.parse(line);
			} catch {
				this.onLog?.(line);
				return;
			}
			this.onEvent?.(event);
		} else if (type === "stderr") {
			if (data) this.onLog?.(String(data));
		} else if (type === "exit") {
			this.alive = false;
			this.uuid = null;
			this.onExit?.(Number.parseInt(data, 10));
		}
	}

	#writeJson(value) {
		if (!this.alive || !this.uuid) throw new Error("Claude is not running");
		return this.executor.write(this.uuid, JSON.stringify(value));
	}

	/** Sends one user turn. */
	send(text) {
		return this.#writeJson({
			type: "user",
			message: { role: "user", content: [{ type: "text", text }] },
		});
	}

	/** Asks Claude to stop the current turn; the process stays alive. */
	interrupt() {
		return this.#writeJson({
			type: "control_request",
			request_id: `req_${Date.now()}_${requestCounter++}`,
			request: { subtype: "interrupt" },
		});
	}

	/** Ends the process. */
	async stop() {
		if (!this.alive || !this.uuid) return;
		const uuid = this.uuid;
		this.alive = false;
		this.uuid = null;
		try {
			await this.executor.stop(uuid);
		} catch {
			// The process may have exited already.
		}
	}
}
