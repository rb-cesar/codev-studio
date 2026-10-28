import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { onTestFinished, test } from "vitest";

const requireFromTest = createRequire(import.meta.url);
const { APP_ID, configureProject, getStalePluginRemovalPlan } =
	requireFromTest("../../utils/config.js");

const ADMOB_PLUGIN_ID = "admob-plus-cordova";
const LEGACY_CONSENT_PLUGIN_ID = "cordova-plugin-consent";
const IAP_PLUGIN_ID = "cordova-plugin-iap";
const OLD_FREE_ID = "com.foxdebug.acodefree";

const TRACKED_VARIANT_FILES = [
	"package.json",
	"package-lock.json",
	"config.xml",
	"res/android/values/ic_launcher_background.xml",
];

function createFixture({
	id,
	admobInstalled = false,
	legacyConsentInstalled = false,
	iapInstalled = false,
	dependencyPlugins = [],
	cordovaPlugins = [],
	configPlugins = [],
}) {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "acode-config-"));
	const write = (relativePath, contents = "") => {
		const filePath = path.join(rootDir, relativePath);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, contents);
	};
	const dependencies = Object.fromEntries(
		dependencyPlugins.map((pluginId) => [pluginId, "1.0.0"]),
	);
	const pluginDeclarations = configPlugins
		.map((pluginId) => `  <plugin name="${pluginId}" spec="1.0.0" />`)
		.join("\n");

	write(
		"config.xml",
		`<widget id="${id}" version="1.0.0">\n${pluginDeclarations}\n</widget>\n`,
	);
	write(
		"package.json",
		`${JSON.stringify(
			{
				name: "acode-config-test",
				cordova: {
					plugins: Object.fromEntries(
						cordovaPlugins.map((pluginId) => [pluginId, {}]),
					),
				},
				dependencies,
			},
			undefined,
			2,
		)}\n`,
	);
	write(
		"package-lock.json",
		`${JSON.stringify(
			{
				name: "acode-config-test",
				lockfileVersion: 3,
				packages: {
					"": {
						name: "acode-config-test",
						dependencies: { ...dependencies },
					},
					...Object.fromEntries(
						dependencyPlugins.map((pluginId) => [
							`node_modules/${pluginId}`,
							{ version: "1.0.0" },
						]),
					),
				},
			},
			undefined,
			2,
		)}\n`,
	);
	write(".babelrc", '{"compact":false}\n');
	write(
		"res/android/values/ic_launcher_background.xml",
		id === OLD_FREE_ID
			? `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#ffffff</color>
    <color name="ic_splash_background">#313131</color>
</resources>`
			: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#3a3e54</color>
    <color name="ic_splash_background">#3a3e54</color>
</resources>`,
	);
	if (admobInstalled) write(`plugins/${ADMOB_PLUGIN_ID}/plugin.xml`, "plugin");
	if (legacyConsentInstalled) {
		write(`plugins/${LEGACY_CONSENT_PLUGIN_ID}/plugin.xml`, "plugin");
	}
	if (iapInstalled) write(`plugins/${IAP_PLUGIN_ID}/plugin.xml`, "plugin");

	function removeDependency(pluginId) {
		const packagePath = path.join(rootDir, "package.json");
		const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
		for (const sectionName of [
			"dependencies",
			"devDependencies",
			"optionalDependencies",
		]) {
			delete packageJson[sectionName]?.[pluginId];
		}
		write("package.json", `${JSON.stringify(packageJson, undefined, 2)}\n`);

		const lockPath = path.join(rootDir, "package-lock.json");
		const packageLock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
		for (const sectionName of [
			"dependencies",
			"devDependencies",
			"optionalDependencies",
		]) {
			delete packageLock.packages?.[""]?.[sectionName]?.[pluginId];
		}
		delete packageLock.packages?.[`node_modules/${pluginId}`];
		write(
			"package-lock.json",
			`${JSON.stringify(packageLock, undefined, 2)}\n`,
		);
	}

	return {
		rootDir,
		commandRunner(commands) {
			return async (command, args) => {
				commands.push([command, ...args]);
				if (command === "npm" && args[0] === "uninstall") {
					removeDependency(args[1]);
					return;
				}
				if (command !== "cordova" || args[0] !== "plugin") return;

				if (args[1] === "remove") {
					fs.rmSync(path.join(rootDir, "plugins", args[2]), {
						recursive: true,
						force: true,
					});
					if (args.includes("--save")) removeDependency(args[2]);
				}
			};
		},
		read(relativePath) {
			return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
		},
		snapshot() {
			return Object.fromEntries(
				TRACKED_VARIANT_FILES.map((relativePath) => [
					relativePath,
					fs.readFileSync(path.join(rootDir, relativePath), "utf8"),
				]),
			);
		},
		remove() {
			fs.rmSync(rootDir, { recursive: true });
		},
	};
}

function pluginState(overrides = {}) {
	return {
		installed: false,
		dependencyDeclared: false,
		cordovaPackageDeclared: false,
		configDeclared: false,
		...overrides,
	};
}

test("plans transient removal without saving metadata", () => {
	const actions = getStalePluginRemovalPlan({
		[ADMOB_PLUGIN_ID]: pluginState({ installed: true }),
	});

	assert.deepEqual(
		actions.map(({ command, args }) => [command, ...args]),
		[["cordova", "plugin", "remove", ADMOB_PLUGIN_ID, "--nosave"]],
	);
});

test("plans saved removal only for installed dependency state", () => {
	const actions = getStalePluginRemovalPlan({
		[ADMOB_PLUGIN_ID]: pluginState({
			installed: true,
			dependencyDeclared: true,
		}),
		[LEGACY_CONSENT_PLUGIN_ID]: pluginState({
			installed: true,
			dependencyDeclared: true,
		}),
		[IAP_PLUGIN_ID]: pluginState({
			installed: true,
			dependencyDeclared: true,
		}),
	});

	assert.deepEqual(
		actions.map(({ command, args }) => [command, ...args]),
		[
			["cordova", "plugin", "remove", LEGACY_CONSENT_PLUGIN_ID, "--save"],
			["cordova", "plugin", "remove", ADMOB_PLUGIN_ID, "--save"],
			["cordova", "plugin", "remove", IAP_PLUGIN_ID, "--save"],
		],
	);
});

test("removes installed ads and billing plugins and refreshes a changed identity", async () => {
	const fixture = createFixture({
		id: OLD_FREE_ID,
		admobInstalled: true,
		iapInstalled: true,
	});
	onTestFinished(fixture.remove);
	fs.mkdirSync(path.join(fixture.rootDir, "platforms/android"), {
		recursive: true,
	});
	const commands = [];

	const result = await configureProject({
		rootDir: fixture.rootDir,
		commandRunner: fixture.commandRunner(commands),
	});

	assert.equal(result.identityChanged, true);
	assert.match(fixture.read("config.xml"), new RegExp(`id="${APP_ID}"`));
	assert.deepEqual(commands, [
		["cordova", "plugin", "remove", ADMOB_PLUGIN_ID, "--nosave"],
		["cordova", "plugin", "remove", IAP_PLUGIN_ID, "--nosave"],
		["npm", "run", "clean"],
	]);
	assert.equal(
		result.actions.every(
			(action) => action.env?.NPM_CONFIG_LEGACY_PEER_DEPS === "true",
		),
		true,
	);
});

test("removes installed saved legacy consent", async () => {
	const fixture = createFixture({
		id: APP_ID,
		legacyConsentInstalled: true,
		dependencyPlugins: [LEGACY_CONSENT_PLUGIN_ID],
		cordovaPlugins: [LEGACY_CONSENT_PLUGIN_ID],
		configPlugins: [LEGACY_CONSENT_PLUGIN_ID],
	});
	onTestFinished(fixture.remove);
	const commands = [];

	await configureProject({
		rootDir: fixture.rootDir,
		commandRunner: fixture.commandRunner(commands),
	});

	assert.deepEqual(commands[0], [
		"cordova",
		"plugin",
		"remove",
		LEGACY_CONSENT_PLUGIN_ID,
		"--save",
	]);
	assert.doesNotMatch(
		`${fixture.read("package.json")}${fixture.read("package-lock.json")}${fixture.read("config.xml")}`,
		/cordova-plugin-consent/,
	);
});

test("dependency-only plugin state is removed through npm", async () => {
	const fixture = createFixture({
		id: APP_ID,
		dependencyPlugins: [LEGACY_CONSENT_PLUGIN_ID, ADMOB_PLUGIN_ID],
	});
	onTestFinished(fixture.remove);
	const commands = [];

	await configureProject({
		rootDir: fixture.rootDir,
		commandRunner: fixture.commandRunner(commands),
	});

	assert.deepEqual(commands, [
		[
			"npm",
			"uninstall",
			LEGACY_CONSENT_PLUGIN_ID,
			"--save",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
		],
		[
			"npm",
			"uninstall",
			ADMOB_PLUGIN_ID,
			"--save",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
		],
	]);
	assert.doesNotMatch(
		`${fixture.read("package.json")}${fixture.read("package-lock.json")}`,
		/cordova-plugin-consent|admob-plus-cordova/,
	);
});

test("declaration-only state is cleaned without package commands", async () => {
	const fixture = createFixture({
		id: APP_ID,
		cordovaPlugins: [LEGACY_CONSENT_PLUGIN_ID, ADMOB_PLUGIN_ID],
		configPlugins: [LEGACY_CONSENT_PLUGIN_ID, ADMOB_PLUGIN_ID],
	});
	onTestFinished(fixture.remove);
	const packageLockBefore = fixture.read("package-lock.json");
	const commands = [];

	await configureProject({
		rootDir: fixture.rootDir,
		commandRunner: fixture.commandRunner(commands),
	});

	assert.deepEqual(commands, []);
	assert.doesNotMatch(
		`${fixture.read("package.json")}${fixture.read("config.xml")}`,
		/cordova-plugin-consent|admob-plus-cordova/,
	);
	assert.equal(fixture.read("package-lock.json"), packageLockBefore);
});

test("repeated configuration converges to identical tracked files", async () => {
	const fixture = createFixture({ id: OLD_FREE_ID });
	onTestFinished(fixture.remove);

	await configureProject({
		rootDir: fixture.rootDir,
		commandRunner: fixture.commandRunner([]),
	});
	const converged = fixture.snapshot();
	const secondCommands = [];

	await configureProject({
		rootDir: fixture.rootDir,
		commandRunner: fixture.commandRunner(secondCommands),
	});

	assert.deepEqual(fixture.snapshot(), converged);
	assert.deepEqual(secondCommands, []);
});

test("fails when a successful command leaves dependency state behind", async () => {
	const fixture = createFixture({
		id: APP_ID,
		dependencyPlugins: [ADMOB_PLUGIN_ID],
	});
	onTestFinished(fixture.remove);

	await assert.rejects(
		configureProject({
			rootDir: fixture.rootDir,
			commandRunner: async () => {},
		}),
		/Failed to remove the admob-plus-cordova Cordova plugin/,
	);
});
