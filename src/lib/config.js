// Servidor de plugins compartilhado com o Acode. Todos os plugins do Acode
// são baixados dele. A única outra dependência do acode.app é a fonte
// Proggy Clean (src/lib/fonts.js).
const BASE_URL = "https://acode.app";

const config = {
	BASE_URL,
	SUPPORTED_EDITOR: "cm",
	FILE_NAME_REGEX: /^((?![:<>"\\\|\?\*]).)*$/,
	FONT_SIZE: /^[0-9\.]{1,3}(px|rem|em|pt|mm|pc|in)$/,
	DEFAULT_FILE_SESSION: "default-session",
	DEFAULT_FILE_NAME: "untitled.txt",
	CONSOLE_PORT: 8159,
	SERVER_PORT: 8158,
	PREVIEW_PORT: 8158,
	VIBRATION_TIME: 30,
	VIBRATION_TIME_LONG: 150,
	SCROLL_SPEED_FAST_X2: "FAST_X2",
	SCROLL_SPEED_NORMAL: "NORMAL",
	SCROLL_SPEED_FAST: "FAST",
	SCROLL_SPEED_SLOW: "SLOW",
	SIDEBAR_SLIDE_START_THRESHOLD_PX: 20,
	CUSTOM_THEME: 'body[theme="custom"]',
	ERUDA_CDN: "https://cdn.jsdelivr.net/npm/eruda",

	API_BASE: `${BASE_URL}/api`,
	LOG_FILE_NAME: "CodevStudio.log",

	GITHUB_URL: "https://github.com/rb-cesar/codev-studio",
};

export default config;
