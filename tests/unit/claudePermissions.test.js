import ChatModel from "lib/claude/chatModel";
import {
	allowResponse,
	denyResponse,
	describeRequest,
	modeLabel,
	modeOf,
	parsePermissionRequest,
	planApproval,
	planText,
	sessionPermissions,
} from "lib/claude/permissions";
import { describe, expect, it } from "vitest";

function bashEvent(overrides = {}) {
	return {
		type: "control_request",
		request_id: "req-1",
		request: {
			subtype: "can_use_tool",
			tool_name: "Bash",
			display_name: "Bash",
			input: { command: "touch feito.txt", description: "cria arquivo" },
			description: "cria arquivo",
			permission_suggestions: [
				{
					type: "addRules",
					rules: [{ toolName: "Bash", ruleContent: "touch feito.txt" }],
					behavior: "allow",
					destination: "localSettings",
				},
				{ type: "addDirectories", directories: ["/p"], destination: "session" },
				{ type: "setMode", mode: "acceptEdits", destination: "session" },
				{ type: "removeRules", rules: [], behavior: "allow", destination: "x" },
			],
			blocked_path: "/p/feito.txt",
			tool_use_id: "toolu_1",
			...overrides,
		},
	};
}

describe("parsePermissionRequest", () => {
	it("reads a can_use_tool request", () => {
		const request = parsePermissionRequest(bashEvent());
		expect(request).toMatchObject({
			requestId: "req-1",
			toolUseId: "toolu_1",
			tool: "Bash",
			label: "Bash",
			description: "cria arquivo",
			input: { command: "touch feito.txt", description: "cria arquivo" },
			blockedPath: "/p/feito.txt",
			interactive: false,
		});
		expect(request.suggestions).toHaveLength(4);
	});

	it("ignores other events and requests without an id", () => {
		expect(parsePermissionRequest(null)).toBeNull();
		expect(parsePermissionRequest({ type: "assistant" })).toBeNull();
		expect(
			parsePermissionRequest({
				type: "control_request",
				request_id: "x",
				request: { subtype: "interrupt" },
			}),
		).toBeNull();
		expect(
			parsePermissionRequest({
				type: "control_request",
				request: { subtype: "can_use_tool" },
			}),
		).toBeNull();
	});

	it("strips terminal escapes from the reason and tolerates a missing input", () => {
		const request = parsePermissionRequest(
			bashEvent({
				input: undefined,
				decision_reason: "\u001b[31mcaminho fora da pasta\u001b[0m",
				requires_user_interaction: true,
			}),
		);
		expect(request.input).toEqual({});
		expect(request.reason).toBe("caminho fora da pasta");
		expect(request.interactive).toBe(true);
	});
});

describe("answers", () => {
	const request = parsePermissionRequest(bashEvent());

	it("allows the call as asked, echoing the input", () => {
		expect(allowResponse(request)).toEqual({
			behavior: "allow",
			updatedInput: request.input,
		});
	});

	it("denies with a message Claude reads", () => {
		expect(denyResponse("não")).toEqual({ behavior: "deny", message: "não" });
		expect(denyResponse().message).toContain("negou");
	});

	it("remembers suggestions for the session only", () => {
		const updates = sessionPermissions(request);
		expect(updates.map((update) => update.type)).toEqual([
			"addRules",
			"addDirectories",
			"setMode",
		]);
		expect(updates.every((update) => update.destination === "session")).toBe(
			true,
		);
		expect(modeOf(updates)).toBe("acceptEdits");
		expect(modeOf([])).toBeNull();
		expect(allowResponse(request, updates).updatedPermissions).toBe(updates);
	});

	it("approves a plan and picks the mode for the rest of the session", () => {
		expect(planApproval(request, "acceptEdits")).toEqual({
			behavior: "allow",
			updatedInput: request.input,
			updatedPermissions: [
				{ type: "setMode", mode: "acceptEdits", destination: "session" },
			],
		});
	});

	it("reads the plan text Claude Code adds to ExitPlanMode", () => {
		const plan = parsePermissionRequest(
			bashEvent({
				tool_name: "ExitPlanMode",
				input: { plan: "# Plano", planFilePath: "/c/plans/a.md" },
			}),
		);
		expect(planText(plan)).toBe("# Plano");
		expect(planText(request)).toBe("");
	});
});

describe("describeRequest", () => {
	const parse = (tool, input) =>
		parsePermissionRequest(bashEvent({ tool_name: tool, input }));

	it("shows the command, the file and the change", () => {
		expect(describeRequest(parse("Bash", { command: "ls -la" }))).toEqual({
			heading: "Executar comando",
			body: "ls -la",
		});
		expect(
			describeRequest(parse("Write", { file_path: "/a.txt", content: "oi" })),
		).toEqual({ heading: "Gravar /a.txt", body: "oi" });
		expect(
			describeRequest(
				parse("Edit", {
					file_path: "/a.txt",
					old_string: "a",
					new_string: "b\nc",
				}),
			),
		).toEqual({ heading: "Editar /a.txt", body: "− a\n+ b\n+ c" });
	});

	it("falls back to the raw input and clips long text", () => {
		const other = describeRequest(parse("Custom", { x: 1 }));
		expect(other.body).toBe('{\n  "x": 1\n}');
		const long = describeRequest(parse("Bash", { command: "x".repeat(5000) }));
		expect(long.body.length).toBeLessThan(1700);
		expect(long.body).toContain("caracteres omitidos");
	});
});

describe("modeLabel", () => {
	it("names the modes", () => {
		expect(modeLabel("default")).toBe("Perguntar antes");
		expect(modeLabel("acceptEdits")).toBe("Aceitar edições");
		expect(modeLabel("plan")).toBe("Plano");
		expect(modeLabel("qualquer")).toBe("Perguntar antes");
	});
});

describe("ChatModel permissions", () => {
	function modelWithTool() {
		const model = new ChatModel();
		model.apply({
			type: "assistant",
			message: {
				id: "msg_1",
				content: [
					{
						type: "tool_use",
						id: "toolu_1",
						name: "Bash",
						input: { command: "x" },
					},
				],
			},
		});
		return model;
	}

	it("keeps requests in order and marks the waiting tool call", () => {
		const model = modelWithTool();
		const request = parsePermissionRequest(bashEvent());
		model.requestPermission(request);
		model.requestPermission(request);
		expect(model.pending).toHaveLength(1);
		expect(model.findToolUse("toolu_1").permission).toBe("pending");

		model.resolvePermission("req-1", "allowed");
		expect(model.pending).toEqual([]);
		expect(model.findToolUse("toolu_1").permission).toBe("allowed");
	});

	it("drops a request Claude withdrew, or all of them when the turn ends", () => {
		const model = modelWithTool();
		model.requestPermission(parsePermissionRequest(bashEvent()));
		model.cancelPermission("req-1");
		expect(model.pending).toEqual([]);
		expect(model.findToolUse("toolu_1").permission).toBeUndefined();

		model.requestPermission(parsePermissionRequest(bashEvent()));
		model.apply({ type: "result", subtype: "success", is_error: false });
		expect(model.pending).toEqual([]);
	});

	it("follows the permission mode from init, the user and plan mode", () => {
		const model = new ChatModel();
		expect(model.permissionMode).toBe("default");
		model.apply({
			type: "system",
			subtype: "init",
			permissionMode: "acceptEdits",
		});
		expect(model.permissionMode).toBe("acceptEdits");
		model.setPermissionMode("default");
		expect(model.permissionMode).toBe("default");

		model.apply({
			type: "assistant",
			message: {
				id: "m2",
				content: [
					{ type: "tool_use", id: "toolu_9", name: "EnterPlanMode", input: {} },
				],
			},
		});
		model.apply({
			type: "user",
			message: {
				content: [
					{ type: "tool_result", tool_use_id: "toolu_9", content: "ok" },
				],
			},
		});
		expect(model.permissionMode).toBe("plan");
	});
});
