const EXTERNAL_STORAGE_PROVIDER =
	"content://com.android.externalstorage.documents/";
const PRIMARY_STORAGE = "/storage/emulated/0";

/**
 * Path inside the Ubuntu sandbox for a folder or file of the editor, or null when the
 * sandbox cannot see it (another app's files, cloud providers, downloads and media providers).
 *
 * The sandbox binds /storage and /sdcard, so the phone's internal storage and SD cards are
 * reachable once the editor opened them through the Android file picker.
 *
 * @param {string} url folder or file url from the editor
 * @param {object} deps
 * @param {(url: string) => { docId: string }} deps.parseUri `Uri.parse`
 * @param {(url: string) => string} deps.toProotPath `convertToProotPath` of lib/openFolder
 * @param {string} [deps.packageName] application id, owner of the app's own documents provider
 * @returns {string | null}
 */
export function sandboxPathFor(url, { parseUri, toProotPath, packageName }) {
	if (typeof url !== "string" || !url) return null;

	if (url.startsWith("content://")) {
		if (url.startsWith(EXTERNAL_STORAGE_PROVIDER)) {
			const docId = safely(() => parseUri(url).docId);
			return docId ? storagePath(docId) : null;
		}
		if (packageName && url.startsWith(`content://${packageName}.documents/`)) {
			return absolute(safely(() => toProotPath(url)));
		}
		return null;
	}

	const path = decodePath(url.replace(/^file:\/\//, ""));
	if (/^\/(storage|sdcard)(\/|$)/.test(path)) return trimSlash(path);
	return absolute(safely(() => toProotPath(url)));
}

/** "primary:Dev/app" -> /storage/emulated/0/Dev/app; "AA98-181D:x" -> /storage/AA98-181D/x */
function storagePath(docId) {
	const colon = docId.indexOf(":");
	if (colon < 1) return null;
	const volume = docId.slice(0, colon);
	const relative = docId
		.slice(colon + 1)
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
	if (relative.split("/").includes("..")) return null;
	const base = volume === "primary" ? PRIMARY_STORAGE : `/storage/${volume}`;
	return relative ? `${base}/${relative}` : base;
}

function absolute(path) {
	return typeof path === "string" && path.startsWith("/") ? path : null;
}

function trimSlash(path) {
	return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function decodePath(path) {
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

function safely(read) {
	try {
		return read();
	} catch {
		return null;
	}
}
