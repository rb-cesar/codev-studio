import settingsPage from "components/settingsPage";
import confirm from "dialogs/confirm";
import actionStack from "lib/actionStack";
import { APP_ICONS } from "lib/appIcons";
import openFile from "lib/openFile";
import appSettings from "lib/settings";
import settings from "lib/settings";
import appIconSetting, { preloadAppIconSetting } from "pages/appIconSetting";
import plugins from "pages/plugins";
import themeSetting from "pages/themeSetting";
import About from "../pages/about";
import otherSettings from "./appSettings";
import backupRestore from "./backupRestore";
import editorSettings from "./editorSettings";
import filesSettings from "./filesSettings";
import formatterSettings from "./formatterSettings";
import lspSettings from "./lspSettings";
import previewSettings from "./previewSettings";
import scrollSettings from "./scrollSettings";
import searchSettings from "./searchSettings";
import terminalSettings from "./terminalSettings";

export default function mainSettings() {
	preloadAppIconSetting();
	const title = strings.settings.capitalize();
	const categories = {
		core: strings["settings-category-core"],
		customization:
			strings["settings-category-customization"] || "Customization",
		tools: strings["settings-category-tools"] || "Tools",
		maintenance: strings["settings-category-maintenance"],
		aboutAcode: strings["settings-category-about-acode"],
	};
	const items = [
		{
			key: "app-settings",
			text: strings["app settings"],
			icon: "tune",
			info: strings["settings-info-main-app-settings"],
			category: categories.core,
			chevron: true,
		},
		{
			key: "editor-settings",
			text: strings["editor settings"],
			icon: "text_format",
			info: strings["settings-info-main-editor-settings"],
			category: categories.core,
			chevron: true,
		},
		{
			key: "terminal-settings",
			text: `${strings["terminal settings"]}`,
			icon: "terminal",
			info: strings["settings-info-main-terminal-settings"],
			category: categories.core,
			chevron: true,
		},
		{
			key: "preview-settings",
			text: strings["preview settings"],
			icon: "public",
			info: strings["settings-info-main-preview-settings"],
			category: categories.core,
			chevron: true,
		},
		{
			key: "theme",
			text: strings.theme,
			icon: "color_lenspalette",
			info: strings["settings-info-main-theme"],
			category: categories.customization,
			chevron: true,
		},
		{
			key: "appIcon",
			text: strings["app icon"] || "App icon",
			image: getAppIconImage(),
			info:
				strings["settings-info-app-icon"] ||
				"Choose the app icon displayed on your device.",
			category: categories.customization,
			chevron: true,
		},
		{
			key: "formatter",
			text: strings.formatter,
			icon: "spellcheck",
			info: strings["settings-info-main-formatter"],
			category: categories.tools,
			chevron: true,
		},
		{
			key: "plugins",
			text: strings["plugins"],
			icon: "extension",
			info: strings["settings-info-main-plugins"],
			category: categories.tools,
			chevron: true,
		},
		{
			key: "lsp-settings",
			text:
				strings?.lsp_settings ||
				strings["language servers"] ||
				"Language servers",
			icon: "zap",
			info: strings["settings-info-main-lsp-settings"],
			category: categories.tools,
			chevron: true,
		},
		{
			key: "backup-restore",
			text: `${strings.backup.capitalize()} & ${strings.restore.capitalize()}`,
			icon: "cached",
			info: strings["settings-info-main-backup-restore"],
			category: categories.maintenance,
			chevron: true,
		},
		{
			key: "editSettings",
			text: `${strings["edit"]} settings.json`,
			icon: "edit",
			info: strings["settings-info-main-edit-settings"],
			category: categories.maintenance,
			chevron: true,
		},
		{
			key: "reset",
			text: strings["restore default settings"],
			icon: "historyrestore",
			info: strings["settings-info-main-reset"],
			category: categories.maintenance,
			chevron: true,
		},
		{
			key: "about",
			text: strings.about,
			icon: "info",
			info: `Version ${BuildInfo.version}`,
			category: categories.aboutAcode,
			chevron: true,
		},
	];

	/**
	 * Callback for settings page for handling click event
	 * @this {HTMLElement}
	 * @param {string} key
	 */
	async function callback(key) {
		switch (key) {
			case "app-settings":
			case "backup-restore":
			case "editor-settings":
			case "preview-settings":
			case "terminal-settings":
			case "lsp-settings":
				appSettings.uiSettings[key].show();
				break;

			case "theme":
				themeSetting();
				break;

			case "appIcon":
				return appIconSetting();

			case "about":
				About();
				break;

			case "plugins":
				plugins();
				break;

			case "formatter":
				formatterSettings();
				break;

			case "editSettings": {
				actionStack.pop();
				openFile(settings.settingsFile);
				break;
			}

			case "reset":
				const confirmation = await confirm(
					strings.warning,
					strings["restore default settings"],
				);
				if (confirmation) {
					await appSettings.reset();
					location.reload();
				}
				break;

			default:
				break;
		}
	}

	const page = settingsPage(title, items, callback, undefined, {
		preserveOrder: true,
		pageClassName: "main-settings-page",
		listClassName: "main-settings-list",
	});
	const $appIcon = page
		.getListElement()
		.querySelector('[data-key="appIcon"] > .icon img');
	const updateAppIcon = () => {
		$appIcon.src = getAppIconImage();
	};
	appSettings.on("update:appIcon", updateAppIcon);
	page.onClose(() => appSettings.off("update:appIcon", updateAppIcon));
	page.show();

	appSettings.uiSettings["main-settings"] = page;

	const lazyPages = {
		"app-settings": otherSettings,
		"file-settings": filesSettings,
		"backup-restore": backupRestore,
		"editor-settings": editorSettings,
		"scroll-settings": scrollSettings,
		"search-settings": searchSettings,
		"preview-settings": previewSettings,
		"terminal-settings": terminalSettings,
		"lsp-settings": lspSettings,
	};

	const instantiated = {};

	for (const [key, initializer] of Object.entries(lazyPages)) {
		delete appSettings.uiSettings[key];
		Object.defineProperty(appSettings.uiSettings, key, {
			get() {
				if (!(key in instantiated)) {
					instantiated[key] = initializer();
					Object.defineProperty(appSettings.uiSettings, key, {
						value: instantiated[key],
						writable: true,
						configurable: true,
						enumerable: true,
					});
				}
				return instantiated[key];
			},
			set(val) {
				instantiated[key] = val;
				Object.defineProperty(appSettings.uiSettings, key, {
					value: val,
					writable: true,
					configurable: true,
					enumerable: true,
				});
			},
			configurable: true,
			enumerable: false,
		});
	}
}

function getAppIconImage() {
	return (
		APP_ICONS.find(({ id }) => id === appSettings.value.appIcon) || APP_ICONS[0]
	).image;
}
