const fs = require("node:fs");
const path = require("node:path");
const { execFile: execFileCallback } = require("node:child_process");
const { promisify } = require("node:util");

const execFile = promisify(execFileCallback);

// Plugins that older builds installed (ads, consent and Play billing). The app
// no longer ships them, so they are removed from existing Cordova projects.
const ADMOB_PLUGIN_ID = "admob-plus-cordova";
const LEGACY_CONSENT_PLUGIN_ID = "cordova-plugin-consent";
const IAP_PLUGIN_ID = "cordova-plugin-iap";
const STALE_PLUGIN_IDS = [
	LEGACY_CONSENT_PLUGIN_ID,
	ADMOB_PLUGIN_ID,
	IAP_PLUGIN_ID,
];
const APP_ID = "dev.codev.studio";
const PACKAGE_DEPENDENCY_SECTIONS = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
];
const PLUGIN_COMMAND_ENV = Object.freeze({
	NPM_CONFIG_LEGACY_PEER_DEPS: "true",
});

const LOGO_TEXT = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0F1424</color>
    <color name="ic_splash_background">#0F1424</color>
</resources>`;

/**
 * Returns the Cordova operations required to remove plugins that older builds
 * installed and the app no longer ships.
 *
 * @param {Record<string, PluginState>} states plugin state by plugin id
 */
function getStalePluginRemovalPlan(states = {}) {
	const actions = [];

	for (const pluginId of STALE_PLUGIN_IDS) {
		const { installed = false, dependencyDeclared = false } =
			states[pluginId] ?? {};

		if (installed) {
			actions.push({
				command: "cordova",
				args: [
					"plugin",
					"remove",
					pluginId,
					dependencyDeclared ? "--save" : "--nosave",
				],
				env: PLUGIN_COMMAND_ENV,
			});
			continue;
		}

		if (!dependencyDeclared) continue;

		actions.push({
			command: "npm",
			args: [
				"uninstall",
				pluginId,
				"--save",
				"--ignore-scripts",
				"--no-audit",
				"--no-fund",
			],
			env: PLUGIN_COMMAND_ENV,
		});
	}

	return actions;
}

/**
 * @typedef {{
 *   installed:boolean,
 *   dependencyDeclared:boolean,
 *   cordovaPackageDeclared:boolean,
 *   configDeclared:boolean
 * }} PluginState
 */

function readPackageJson(packagePath, fsImpl) {
	if (!fsImpl.existsSync(packagePath)) return {};
	return JSON.parse(fsImpl.readFileSync(packagePath, "utf8"));
}

function getConfigPluginPattern(pluginId, flags = "i") {
	const escapedId = pluginId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`<plugin\\b(?=[^>]*\\bname=["']${escapedId}["'])`, flags);
}

/**
 * @param {{
 *   pluginId:string,
 *   pluginPath:string,
 *   packageJson:Record<string, unknown>,
 *   config:string,
 *   fsImpl:typeof fs
 * }} options
 * @returns {PluginState}
 */
function getPluginState({ pluginId, pluginPath, packageJson, config, fsImpl }) {
	return {
		installed: fsImpl.existsSync(pluginPath),
		dependencyDeclared: PACKAGE_DEPENDENCY_SECTIONS.some((sectionName) => {
			const section = packageJson[sectionName];
			return (
				section &&
				typeof section === "object" &&
				Object.hasOwn(section, pluginId)
			);
		}),
		cordovaPackageDeclared: Boolean(
			packageJson.cordova?.plugins &&
				Object.hasOwn(packageJson.cordova.plugins, pluginId),
		),
		configDeclared: getConfigPluginPattern(pluginId).test(config),
	};
}

function removeCordovaPluginDeclarations({ configPath, packagePath, fsImpl }) {
	const packageJson = readPackageJson(packagePath, fsImpl);
	let packageChanged = false;
	const cordovaPlugins = packageJson.cordova?.plugins;

	if (cordovaPlugins && typeof cordovaPlugins === "object") {
		for (const pluginId of STALE_PLUGIN_IDS) {
			if (!Object.hasOwn(cordovaPlugins, pluginId)) continue;
			delete cordovaPlugins[pluginId];
			packageChanged = true;
		}
	}

	if (packageChanged) {
		fsImpl.writeFileSync(
			packagePath,
			`${JSON.stringify(packageJson, undefined, 2)}\n`,
			"utf8",
		);
	}

	const config = fsImpl.readFileSync(configPath, "utf8");
	let nextConfig = config;
	for (const pluginId of STALE_PLUGIN_IDS) {
		const pluginPattern = new RegExp(
			`\\s*${getConfigPluginPattern(pluginId).source}[^>]*(?:\\/\\s*>|>[\\s\\S]*?<\\/plugin\\s*>)`,
			"gi",
		);
		nextConfig = nextConfig.replace(pluginPattern, "");
	}

	if (nextConfig !== config) {
		fsImpl.writeFileSync(configPath, nextConfig, "utf8");
	}
}

function assertPluginState({ paths, fsImpl }) {
	const config = fsImpl.readFileSync(paths.config, "utf8");
	const packageJson = readPackageJson(paths.package, fsImpl);

	for (const pluginId of STALE_PLUGIN_IDS) {
		const state = getPluginState({
			pluginId,
			pluginPath: paths.plugins(pluginId),
			packageJson,
			config,
			fsImpl,
		});

		if (Object.values(state).some(Boolean)) {
			throw new Error(`Failed to remove the ${pluginId} Cordova plugin.`);
		}
	}
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{cwd:string}} options
 */
async function runCommand(command, args, options) {
	const { stdout, stderr } = await execFile(command, args, {
		...options,
		maxBuffer: 10 * 1024 * 1024,
	});
	if (stdout) process.stdout.write(stdout);
	if (stderr) process.stderr.write(stderr);
}

/**
 * @param {{
 *   mode?:string,
 *   rootDir?:string,
 *   fsImpl?:typeof fs,
 *   commandRunner?:(command:string,args:string[],options:{
 *     cwd:string,
 *     env?:NodeJS.ProcessEnv
 *   })=>Promise<void>
 * }} options
 */
async function configureProject({
	mode = "d",
	rootDir = path.resolve(__dirname, ".."),
	fsImpl = fs,
	commandRunner = runCommand,
} = {}) {
	const paths = {
		babel: path.join(rootDir, ".babelrc"),
		config: path.join(rootDir, "config.xml"),
		logo: path.join(rootDir, "res/android/values/ic_launcher_background.xml"),
		package: path.join(rootDir, "package.json"),
		platforms: path.join(rootDir, "platforms"),
		plugins: (pluginId) => path.join(rootDir, "plugins", pluginId),
	};

	const config = fsImpl.readFileSync(paths.config, "utf8");
	const packageJson = readPackageJson(paths.package, fsImpl);
	const currentId = /<widget[^>]*?\sid=["']([^"']+)["']/.exec(config)?.[1];
	if (!currentId) {
		throw new Error(`Unable to read the widget id from ${paths.config}.`);
	}

	const targetId = APP_ID;
	const identityChanged = currentId !== targetId;
	const actions = getStalePluginRemovalPlan(
		Object.fromEntries(
			STALE_PLUGIN_IDS.map((pluginId) => [
				pluginId,
				getPluginState({
					pluginId,
					pluginPath: paths.plugins(pluginId),
					packageJson,
					config,
					fsImpl,
				}),
			]),
		),
	);

	const babelConfig = JSON.parse(fsImpl.readFileSync(paths.babel, "utf8"));
	const compact = mode === "p" || mode === "prod";
	if (babelConfig.compact !== compact) {
		babelConfig.compact = compact;
		fsImpl.writeFileSync(
			paths.babel,
			`${JSON.stringify(babelConfig, undefined, 2)}\n`,
			"utf8",
		);
	}

	if (identityChanged) {
		fsImpl.writeFileSync(
			paths.config,
			config.replace(/(<widget[^>]*?\sid=["'])[^"']+(["'])/, `$1${targetId}$2`),
			"utf8",
		);
	}

	fsImpl.writeFileSync(paths.logo, LOGO_TEXT, "utf8");

	for (const action of actions) {
		console.log(`|--- ${action.command} ${action.args.join(" ")} ---|`);
		const commandOptions = { cwd: rootDir };
		if (action.env) {
			commandOptions.env = { ...process.env, ...action.env };
		}
		await commandRunner(action.command, action.args, commandOptions);
	}

	removeCordovaPluginDeclarations({
		configPath: paths.config,
		packagePath: paths.package,
		fsImpl,
	});
	assertPluginState({ paths, fsImpl });

	const hasPlatforms =
		fsImpl.existsSync(paths.platforms) &&
		fsImpl
			.readdirSync(paths.platforms)
			.some((entry) => entry && !entry.startsWith("."));

	if (identityChanged && hasPlatforms) {
		console.log("|--- Reinstalling platforms for the new app identity ---|");
		await commandRunner("npm", ["run", "clean"], { cwd: rootDir });
	}

	return {
		actions,
		identityChanged,
		targetId,
	};
}

async function main() {
	const mode = process.argv[2] || "d";
	await configureProject({ mode });
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}

module.exports = {
	APP_ID,
	STALE_PLUGIN_IDS,
	configureProject,
	getStalePluginRemovalPlan,
};
