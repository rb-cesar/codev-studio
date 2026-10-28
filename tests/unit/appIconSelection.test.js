import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	settings: { value: { appIcon: "default" }, update: vi.fn() },
	confirm: vi.fn(),
	toast: vi.fn(),
	error: vi.fn(),
}));
vi.mock("components/toast", () => ({ default: mocks.toast }));
vi.mock("dialogs/confirm", () => ({ default: mocks.confirm }));
vi.mock("lib/settings", () => ({ default: mocks.settings }));
vi.mock("utils/helpers", () => ({
	default: {
		error: mocks.error,
		promisify: (fn, ...args) =>
			new Promise((resolve, reject) => fn(...args, resolve, reject)),
	},
}));

import selectAppIcon from "lib/appIconSelection";

function harness() {
	const controller = new AbortController();
	const onBusy = vi.fn();
	const onLoading = vi.fn();
	const onChange = vi.fn();
	return {
		controller,
		onBusy,
		onLoading,
		onChange,
		select(iconId) {
			return selectAppIcon(iconId, {
				signal: controller.signal,
				onBusy,
				onLoading,
				onChange,
			});
		},
	};
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.settings.value.appIcon = "default";
	mocks.settings.update.mockImplementation(async ({ appIcon }) => {
		mocks.settings.value.appIcon = appIcon;
	});
	mocks.confirm.mockResolvedValue(true);
	vi.stubGlobal("strings", {
		"app icon": "App icon",
		"app icon change warning":
			"The app will exit after the app icon is changed.",
		"app icon changed": "Changed",
	});
	vi.stubGlobal("system", { setAppIcon: vi.fn((id, success) => success()) });
});

describe("icon selection", () => {
	it("warns that the app will exit before applying an icon", async () => {
		const h = harness();
		await h.select("ember");
		expect(mocks.confirm.mock.calls[0][0]).toBe("App icon");
		expect(mocks.confirm.mock.calls[0][1]).toBe(
			"The app will exit after the app icon is changed.",
		);
		expect(system.setAppIcon).toHaveBeenCalledWith(
			"ember",
			expect.any(Function),
			expect.any(Function),
		);
		expect(mocks.settings.update).toHaveBeenCalledOnce();
		expect(h.onLoading.mock.calls).toEqual([[true], [false]]);
		expect(h.onChange).toHaveBeenCalledOnce();
		expect(mocks.toast).toHaveBeenCalledWith("Changed");
	});
	it("ignores current and unknown icons and serializes confirmation", async () => {
		const h = harness();
		await h.select("default");
		await h.select("unknown");
		expect(h.onBusy).not.toHaveBeenCalled();
		expect(h.onLoading).not.toHaveBeenCalled();
		const confirms = [];
		mocks.confirm.mockImplementation(
			() =>
				new Promise((resolve) => {
					confirms.push(resolve);
				}),
		);
		const first = h.select("ember");
		await h.select("ocean");
		expect(mocks.confirm).toHaveBeenCalledOnce();
		expect(h.onBusy).toHaveBeenCalledExactlyOnceWith(true);
		expect(h.onLoading).not.toHaveBeenCalled();
		confirms[0](true);
		await first;
		expect(system.setAppIcon.mock.calls[0][0]).toBe("ember");
		expect(h.onBusy.mock.calls).toEqual([[true], [false]]);
		expect(h.onLoading.mock.calls).toEqual([[true], [false]]);
		expect(mocks.toast).toHaveBeenCalledTimes(1);
	});
	it.each([
		"decline",
		"native failure",
	])("keeps the current selection on %s", async (kind) => {
		if (kind === "decline") mocks.confirm.mockResolvedValue(false);
		if (kind === "native failure")
			system.setAppIcon.mockImplementation((id, ok, fail) =>
				fail("Native failure"),
			);
		const h = harness();
		await h.select("ember");
		expect(mocks.settings.value.appIcon).toBe("default");
		expect(mocks.settings.update).not.toHaveBeenCalled();
		expect(mocks.toast).not.toHaveBeenCalledWith("Changed");
		expect(h.onBusy).toHaveBeenLastCalledWith(false);
		if (kind === "decline") {
			expect(h.onLoading.mock.calls).toEqual([[false]]);
			expect(mocks.error).not.toHaveBeenCalled();
		} else {
			expect(h.onLoading.mock.calls).toEqual([[true], [false]]);
			expect(mocks.error).toHaveBeenCalledOnce();
		}
	});
	it("shows success only after the native change has been persisted", async () => {
		let applied, persisted;
		system.setAppIcon.mockImplementation((id, success) => {
			applied = success;
		});
		mocks.settings.update.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					persisted = resolve;
				}),
		);
		const h = harness();
		const pending = h.select("ember");
		await vi.waitFor(() => expect(applied).toBeTypeOf("function"));
		expect(mocks.toast).not.toHaveBeenCalled();
		applied();
		await vi.waitFor(() => expect(persisted).toBeTypeOf("function"));
		expect(h.onChange).not.toHaveBeenCalled();
		expect(mocks.toast).not.toHaveBeenCalled();
		persisted();
		await pending;
		expect(h.onChange).toHaveBeenCalledOnce();
		expect(mocks.toast).toHaveBeenCalledExactlyOnceWith("Changed");
	});
	it("does not apply after leaving during confirmation", async () => {
		const h = harness();
		mocks.confirm.mockImplementation(async () => {
			h.controller.abort();
			return true;
		});
		await h.select("ember");
		expect(system.setAppIcon).not.toHaveBeenCalled();
		expect(h.onLoading).not.toHaveBeenCalled();
	});
	it("keeps a reopened picker locked until an earlier native change is persisted", async () => {
		let applied;
		system.setAppIcon.mockImplementationOnce((id, success) => {
			applied = success;
		});
		const previous = harness();
		const pending = previous.select("ember");
		await vi.waitFor(() => expect(applied).toBeTypeOf("function"));
		previous.controller.abort();
		const reopened = harness();
		await reopened.select("ocean");
		expect(system.setAppIcon).toHaveBeenCalledOnce();
		expect(reopened.onBusy).not.toHaveBeenCalled();
		applied();
		await pending;
		expect(mocks.settings.value.appIcon).toBe("ember");
		expect(previous.onChange).not.toHaveBeenCalled();
		expect(previous.onLoading).toHaveBeenCalledExactlyOnceWith(true);
		expect(mocks.toast).not.toHaveBeenCalled();
		await reopened.select("ocean");
		expect(mocks.settings.value.appIcon).toBe("ocean");
		expect(reopened.onChange).toHaveBeenCalledOnce();
	});
});
