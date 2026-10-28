import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	confirm: vi.fn(),
	exitApp: vi.fn(),
	settings: {
		value: {
			confirmOnExit: false,
		},
	},
}));

vi.mock("dialogs/confirm", () => ({
	default: mocks.confirm,
}));

vi.mock("lib/settings", () => ({
	default: mocks.settings,
}));

import actionStack from "lib/actionStack";

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"navigator",
);
const originalAcode = globalThis.acode;
const originalStrings = globalThis.strings;

function setNavigator() {
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: {
			app: {
				exitApp: mocks.exitApp,
			},
		},
	});
}

describe("actionStack app exit", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.settings.value.confirmOnExit = false;
		actionStack.onCloseApp = undefined;
		actionStack.unfreeze();
		globalThis.acode = { exitAppMessage: "Close Acode?" };
		globalThis.strings = { warning: "Warning" };
		setNavigator();
	});

	afterAll(() => {
		actionStack.onCloseApp = undefined;
		globalThis.acode = originalAcode;
		globalThis.strings = originalStrings;

		if (originalNavigatorDescriptor) {
			Object.defineProperty(
				globalThis,
				"navigator",
				originalNavigatorDescriptor,
			);
		} else {
			Reflect.deleteProperty(globalThis, "navigator");
		}
	});

	it("exits after confirmation", async () => {
		mocks.settings.value.confirmOnExit = true;
		mocks.confirm.mockResolvedValue(true);

		await actionStack.pop();

		expect(mocks.confirm).toHaveBeenCalledWith("WARNING", "Close Acode?");
		expect(mocks.exitApp).toHaveBeenCalledOnce();
	});

	it("does not exit when confirmation is cancelled", async () => {
		mocks.settings.value.confirmOnExit = true;
		mocks.confirm.mockResolvedValue(false);

		await actionStack.pop();

		expect(mocks.exitApp).not.toHaveBeenCalled();
	});

	it("runs a synchronous close callback before exiting", async () => {
		const onClose = vi.fn();
		actionStack.onCloseApp = onClose;

		await actionStack.pop();

		expect(onClose).toHaveBeenCalledOnce();
		expect(mocks.exitApp).toHaveBeenCalledOnce();
	});

	it("waits for an asynchronous close callback before exiting", async () => {
		let finishClose;
		const closeComplete = new Promise((resolve) => {
			finishClose = resolve;
		});
		actionStack.onCloseApp = vi.fn(() => closeComplete);

		await actionStack.pop();

		expect(mocks.exitApp).not.toHaveBeenCalled();
		finishClose();
		await closeComplete;
		await Promise.resolve();

		expect(mocks.exitApp).toHaveBeenCalledOnce();
	});
});
