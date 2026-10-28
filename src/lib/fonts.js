import fsOperation from "fileSystem";
import loader from "dialogs/loader";
import helpers from "utils/helpers";
import Url from "utils/Url";
import cascadiaCodeLatin from "../res/fonts/CascadiaCode-Latin.woff2";
import cascadiaCodeLatinExt from "../res/fonts/CascadiaCode-LatinExt.woff2";
import firaCode from "../res/fonts/FiraCode.ttf";
import jetBrainsMonoBoldLatin from "../res/fonts/JetBrainsMonoBold-Latin.woff2";
import jetBrainsMonoBoldLatinExt from "../res/fonts/JetBrainsMonoBold-LatinExt.woff2";
import jetBrainsMonoRegularLatin from "../res/fonts/JetBrainsMonoRegular-Latin.woff2";
import jetBrainsMonoRegularLatinExt from "../res/fonts/JetBrainsMonoRegular-LatinExt.woff2";
import MesloLGSNFRegular from "../res/fonts/MesloLGSNFRegular.ttf";
import notoMonoLatin from "../res/fonts/NotoMono-Latin.woff2";
import robotoMono from "../res/fonts/RobotoMono.ttf";
import sourceCodeProLatin from "../res/fonts/SourceCodePro-Latin.woff2";
import sourceCodeProLatinExt from "../res/fonts/SourceCodePro-LatinExt.woff2";
import victorMonoItalicLatin from "../res/fonts/VictorMonoItalic-Latin.woff2";
import victorMonoItalicLatinExt from "../res/fonts/VictorMonoItalic-LatinExt.woff2";
import victorMonoMediumLatin from "../res/fonts/VictorMonoMedium-Latin.woff2";
import victorMonoMediumLatinExt from "../res/fonts/VictorMonoMedium-LatinExt.woff2";

const fonts = new Map();
const customFontNames = new Set();
const CUSTOM_FONTS_KEY = "custom_fonts";
const FONT_FACE_STYLE_ID = "font-face-style";
const EDITOR_STYLE_ID = "editor-font-style";
const APP_STYLE_ID = "app-font-style";
const DEFAULT_EDITOR_FONT = "Roboto Mono";
const DEFAULT_APP_FONT_STACK = `"Roboto", sans-serif`;
// Subset ranges of the bundled .woff2 files (see src/res/fonts/OFL.txt).
const LATIN_RANGE =
	"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT_RANGE =
	"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

add(
	"Fira Code",
	`@font-face {
  font-family: 'Fira Code';
  src: url(${firaCode}) format('truetype');
  font-weight: 300 700;
  font-style: normal;
}`,
);

add(
	"Roboto Mono",
	`@font-face {
  font-family: 'Roboto Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(${robotoMono}) format('truetype');
  unicode-range: U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F,
    U+FE2E-FE2F;
}`,
);

add(
	"MesloLGS NF Regular",
	`@font-face {
  font-family: 'MesloLGS NF Regular';
  font-style: normal;
  font-weight: normal;
  src: url(${MesloLGSNFRegular}) format('truetype');
}`,
);

add(
	"Source Code",
	`@font-face {
  font-family: 'Source Code';
  src: url(${sourceCodeProLatin}) format('woff2');
  font-weight: 300 700;
  font-style: normal;
  unicode-range: ${LATIN_RANGE};
}
@font-face {
  font-family: 'Source Code';
  src: url(${sourceCodeProLatinExt}) format('woff2');
  font-weight: 300 700;
  font-style: normal;
  unicode-range: ${LATIN_EXT_RANGE};
}`,
);

add(
	"Victor Mono Italic",
	`@font-face {
  font-family: 'Victor Mono Italic';
  src: url(${victorMonoItalicLatin}) format('woff2');
  font-style: normal;
  unicode-range: ${LATIN_RANGE};
}
@font-face {
  font-family: 'Victor Mono Italic';
  src: url(${victorMonoItalicLatinExt}) format('woff2');
  font-style: normal;
  unicode-range: ${LATIN_EXT_RANGE};
}`,
);

add(
	"Victor Mono Medium",
	`@font-face {
  font-family: 'Victor Mono Medium';
  src: url(${victorMonoMediumLatin}) format('woff2');
  font-weight: medium;
  font-style: normal;
  unicode-range: ${LATIN_RANGE};
}
@font-face {
  font-family: 'Victor Mono Medium';
  src: url(${victorMonoMediumLatinExt}) format('woff2');
  font-weight: medium;
  font-style: normal;
  unicode-range: ${LATIN_EXT_RANGE};
}`,
);

add(
	"Cascadia Code",
	`@font-face {
  font-family: 'Cascadia Code';
  src: url(${cascadiaCodeLatin}) format('woff2');
  font-weight: 300 700;
  font-style: normal;
  unicode-range: ${LATIN_RANGE};
}
@font-face {
  font-family: 'Cascadia Code';
  src: url(${cascadiaCodeLatinExt}) format('woff2');
  font-weight: 300 700;
  font-style: normal;
  unicode-range: ${LATIN_EXT_RANGE};
}`,
);

// Not available as a package, so it is still downloaded from the old host.
add(
	"Proggy Clean",
	`@font-face {
  font-family: 'Proggy Clean';
  src: url(https://acode.app/ProggyClean.ttf) format('truetype');
  font-weight: 300 700;
  font-style: normal;
}`,
);

add(
	"JetBrains Mono Bold",
	`@font-face {
  font-family: 'JetBrains Mono Bold';
  src: url(${jetBrainsMonoBoldLatin}) format('woff2');
  font-weight: bold;
  unicode-range: ${LATIN_RANGE};
}
@font-face {
  font-family: 'JetBrains Mono Bold';
  src: url(${jetBrainsMonoBoldLatinExt}) format('woff2');
  font-weight: bold;
  unicode-range: ${LATIN_EXT_RANGE};
}`,
);

add(
	"JetBrains Mono Regular",
	`@font-face {
  font-family: 'JetBrains Mono Regular';
  src: url(${jetBrainsMonoRegularLatin}) format('woff2');
  font-weight: 300 700;
  font-style: normal;
  unicode-range: ${LATIN_RANGE};
}
@font-face {
  font-family: 'JetBrains Mono Regular';
  src: url(${jetBrainsMonoRegularLatinExt}) format('woff2');
  font-weight: 300 700;
  font-style: normal;
  unicode-range: ${LATIN_EXT_RANGE};
}`,
);

add(
	"Noto Mono",
	`@font-face {
  font-display: swap;
  font-family: 'Noto Mono';
  src: url(${notoMonoLatin}) format('woff2');
  font-weight: 400;
  font-style: normal;
  unicode-range: ${LATIN_RANGE};
}`,
);

// Load custom fonts on module initialization
loadCustomFonts();

function add(name, css) {
	fonts.set(name, css);
}

function addCustom(name, css) {
	fonts.set(name, css);
	customFontNames.add(name);
	saveCustomFonts();
}

function saveCustomFonts() {
	const customFonts = {};

	for (const name of customFontNames) {
		const css = fonts.get(name);
		if (css) {
			customFonts[name] = css;
		}
	}

	localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(customFonts));
}

function loadCustomFonts() {
	try {
		const customFonts = localStorage.getItem(CUSTOM_FONTS_KEY);
		if (customFonts) {
			const parsed = JSON.parse(customFonts);
			for (const [name, css] of Object.entries(parsed)) {
				fonts.set(name, css);
				customFontNames.add(name);
			}
		}
	} catch (error) {
		console.error("Failed to load custom fonts:", error);
	}
}

function get(name) {
	return fonts.get(name);
}

function getNames() {
	return [...fonts.keys()];
}

function remove(name) {
	const result = fonts.delete(name);
	if (result) {
		customFontNames.delete(name);
		saveCustomFonts();
	}
	return result;
}

function has(name) {
	return fonts.has(name);
}

function isCustom(name) {
	return customFontNames.has(name);
}

async function setEditorFont(name) {
	loader.showTitleLoader();
	try {
		await loadFont(name);
		const $style = ensureStyleElement(EDITOR_STYLE_ID);
		$style.textContent = `.editor-container.ace_editor{
    font-family: "${name}", NotoMono, Monaco, MONOSPACE !important;
  }
  .ace_text{
    font-family: inherit !important;
  }`;
	} catch (error) {
		toast(`${name} font not found`, "error");
		setEditorFont(DEFAULT_EDITOR_FONT);
	} finally {
		loader.removeTitleLoader();
	}
}

async function setAppFont(name) {
	const $style = ensureStyleElement(APP_STYLE_ID);

	if (!name) {
		$style.textContent = `:root {
  --app-font-family: ${DEFAULT_APP_FONT_STACK};
}`;
		return;
	}

	try {
		await loadFont(name);
		$style.textContent = `:root {
  --app-font-family: "${name}", ${DEFAULT_APP_FONT_STACK};
}`;
	} catch (error) {
		toast(`${name} font not found`, 3000);
		$style.textContent = `:root {
  --app-font-family: ${DEFAULT_APP_FONT_STACK};
}`;
	}
}

async function downloadFont(name, link) {
	const FONT_DIR = Url.join(DATA_STORAGE, "fonts");
	const FONT_FILE = Url.join(FONT_DIR, name);

	const fs = fsOperation(FONT_FILE);
	if (await fs.exists()) return FONT_FILE;

	if (!(await fsOperation(FONT_DIR).exists())) {
		await fsOperation(DATA_STORAGE).createDirectory("fonts");
	}

	const font = await fsOperation(link).readFile();
	console.log("fonts content : ", font);
	await fsOperation(FONT_DIR).createFile(name, font);

	return FONT_FILE;
}

function injectFontFace(name) {
	const $style = ensureStyleElement(FONT_FACE_STYLE_ID);
	const css = get(name);

	if (!css) return;

	// Inject CSS if not already present (skip remote URL downloads - loadFont handles those)
	if (!$style.textContent.includes(`font-family: '${name}'`)) {
		$style.textContent = `${$style.textContent}\n${css}`;
	}

	// Kick off browser font loading without blocking
	if (document.fonts?.load) {
		document.fonts.load(`12px '${name}'`).catch(() => {});
	}
}

async function loadFont(name) {
	const $style = ensureStyleElement(FONT_FACE_STYLE_ID);
	let css = get(name);

	if (!css) {
		throw new Error(`Font ${name} not found`);
	}

	// Get all URL font references
	const urls = [...css.matchAll(/url\((.*?)\)/g)].map((match) => match[1]);

	// Download and replace URLs
	for (const url of urls) {
		if (!/^https?/.test(url)) continue;
		if (/^https?:\/\/localhost/.test(url)) continue;
		const fontFile = await downloadFont(name, url);
		const internalUrl = await helpers.toInternalUri(fontFile);
		css = css.replace(url, internalUrl);
	}

	// Replace any pre-injected @font-face block (from injectFontFace)
	// with the locally-cached version, or append if not yet present
	if ($style.textContent.includes(`font-family: '${name}'`)) {
		let escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		$style.textContent = $style.textContent.replace(
			new RegExp(
				`@font-face\\s*\\{[^}]*font-family:\\s*'${escapedName}'[^}]*\\}`,
				"g",
			),
			css,
		);
	} else {
		$style.textContent = `${$style.textContent}\n${css}`;
	}

	// Ensure the browser has actually parsed and loaded the font
	if (document.fonts?.load) {
		try {
			await document.fonts.load(`12px '${name}'`);
		} catch {
			// document.fonts.load may reject if font is unavailable
		}
	}

	return css;
}

function ensureStyleElement(id) {
	const selector = `style#${id}`;
	const $style = tag.get(selector) ?? <style id={id}></style>;
	if (!$style.isConnected) {
		document.head.append($style);
	}
	return $style;
}

export default {
	add,
	addCustom,
	get,
	getNames,
	remove,
	has,
	isCustom,
	setFont: setEditorFont,
	setEditorFont,
	setAppFont,
	loadFont,
	injectFontFace,
};
