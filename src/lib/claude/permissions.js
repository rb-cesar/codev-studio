/**
 * Permission requests of the Claude tab.
 *
 * With `--permission-prompt-tool stdio`, `claude -p` asks the host before running a tool
 * that needs approval: it prints a `control_request` (subtype `can_use_tool`) and waits for a
 * `control_response` with the decision. This module turns those requests into plain objects
 * and builds the answers. It knows nothing about the DOM or the process.
 */

/** Modes the user can pick; ids are the values of `--permission-mode`. */
export const PERMISSION_MODES = [
	{
		id: "default",
		label: "Perguntar antes",
		hint: "Pede permissão para editar arquivos e rodar comandos.",
	},
	{
		id: "acceptEdits",
		label: "Aceitar edições",
		hint: "Edita arquivos sem perguntar; comandos ainda pedem permissão.",
	},
	{
		id: "plan",
		label: "Plano",
		hint: "Só lê e planeja; nada é alterado até você aprovar o plano.",
	},
];

/** Tool that asks the user to approve a plan before leaving plan mode. */
export const PLAN_TOOL = "ExitPlanMode";

/** Tool that asks the user a multiple-choice question; the tab does not render it yet. */
export const QUESTION_TOOL = "AskUserQuestion";

export const QUESTION_DENIAL =
	"O app ainda não mostra perguntas com opções. Faça a pergunta em texto simples e espere a resposta do usuário.";

export const DENIAL = "O usuário negou esta ação.";

export const KEEP_PLANNING =
	"O usuário quer continuar planejando. Ajuste o plano e peça aprovação de novo.";

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const MAX_FIELD = 1500;

/** Label of a permission mode, "Perguntar antes" for an unknown one. */
export function modeLabel(id) {
	return (
		PERMISSION_MODES.find((mode) => mode.id === id) || PERMISSION_MODES[0]
	).label;
}

/**
 * @param {Record<string, any>} event a parsed stdout line
 * @returns {null | {
 *   requestId: string, toolUseId: string | null, tool: string, label: string,
 *   description: string, input: Record<string, any>, suggestions: object[],
 *   blockedPath: string | null, reason: string, interactive: boolean
 * }} null when the event is not a permission request
 */
export function parsePermissionRequest(event) {
	if (event?.type !== "control_request") return null;
	const request = event.request;
	if (request?.subtype !== "can_use_tool" || !event.request_id) return null;
	return {
		requestId: event.request_id,
		toolUseId: request.tool_use_id || null,
		tool: String(request.tool_name || ""),
		label: String(request.display_name || request.tool_name || "Ferramenta"),
		description: String(request.description || ""),
		input:
			request.input && typeof request.input === "object" ? request.input : {},
		suggestions: Array.isArray(request.permission_suggestions)
			? request.permission_suggestions
			: [],
		blockedPath: request.blocked_path || null,
		reason: String(request.decision_reason || "")
			.replace(ANSI, "")
			.trim(),
		interactive: request.requires_user_interaction === true,
	};
}

/** The `response` payload that lets the tool run as asked. */
export function allowResponse(request, updatedPermissions = []) {
	const response = { behavior: "allow", updatedInput: request.input };
	if (updatedPermissions.length)
		response.updatedPermissions = updatedPermissions;
	return response;
}

/** The `response` payload that refuses the tool; `message` is what Claude reads. */
export function denyResponse(message = DENIAL) {
	return { behavior: "deny", message };
}

/**
 * What Claude Code suggests remembering for this request, limited to the current session:
 * rules, extra folders and the edit mode are never written to the project's settings files.
 * @returns {object[]}
 */
export function sessionPermissions(request) {
	const updates = [];
	for (const suggestion of request.suggestions) {
		if (
			suggestion?.type === "addRules" ||
			suggestion?.type === "addDirectories" ||
			suggestion?.type === "setMode"
		) {
			updates.push({ ...suggestion, destination: "session" });
		}
	}
	return updates;
}

/** The mode a `setMode` update would switch to, or null. */
export function modeOf(updates) {
	return updates.find((update) => update.type === "setMode")?.mode ?? null;
}

/** Approves a plan and moves to `mode` ("default" or "acceptEdits") for the rest of the session. */
export function planApproval(request, mode) {
	return allowResponse(request, [
		{ type: "setMode", mode, destination: "session" },
	]);
}

/** The plan text of an ExitPlanMode request, or "" when Claude Code did not send one. */
export function planText(request) {
	return typeof request.input?.plan === "string" ? request.input.plan : "";
}

function clip(value, max = MAX_FIELD) {
	const text = String(value ?? "");
	return text.length > max
		? `${text.slice(0, max)}\n… (${text.length - max} caracteres omitidos)`
		: text;
}

/**
 * Text to show for what the tool is about to do.
 * @returns {{ heading: string, body: string }}
 */
export function describeRequest(request) {
	const input = request.input;
	const file = input.file_path || input.notebook_path || input.path;
	switch (request.tool) {
		case "Bash":
			return { heading: "Executar comando", body: clip(input.command) };
		case "Write":
			return {
				heading: `Gravar ${file || "arquivo"}`,
				body: clip(input.content),
			};
		case "Edit":
			return {
				heading: `Editar ${file || "arquivo"}`,
				body: clip(
					`− ${String(input.old_string ?? "").replace(/\n/g, "\n− ")}\n+ ${String(input.new_string ?? "").replace(/\n/g, "\n+ ")}`,
				),
			};
		case "MultiEdit":
			return {
				heading: `Editar ${file || "arquivo"}`,
				body: `${Array.isArray(input.edits) ? input.edits.length : 0} alterações`,
			};
		case "WebFetch":
			return { heading: "Abrir endereço", body: clip(input.url) };
		case "WebSearch":
			return { heading: "Pesquisar na web", body: clip(input.query) };
		default:
			return {
				heading: request.description || request.label,
				body: clip(
					Object.keys(input).length ? JSON.stringify(input, null, 2) : "",
				),
			};
	}
}
