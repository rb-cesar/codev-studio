/**
 * Node scripts run inside the Ubuntu sandbox (`node -e <script> <args>`) to read the
 * session transcripts Claude Code keeps in ~/.claude/projects/<folder>/<session-id>.jsonl.
 *
 * Each script prints one line, `@@JSON@@` followed by JSON, so any noise the shell adds
 * around it can be ignored. They are plain strings (not functions turned into strings)
 * so the bundler cannot rename anything they rely on. Do not use backticks or `${` in them.
 */

export const OUTPUT_MARKER = "@@JSON@@";

const COMMON = String.raw`
const fs = require("fs");
const path = require("path");
const MARK = "@@JSON@@";
const root = path.join(process.env.HOME || "/public", ".claude", "projects");

function print(value) {
  console.log(MARK + JSON.stringify(value));
}

function projectDirs() {
  try { return fs.readdirSync(root); } catch (e) { return []; }
}

function findFile(id) {
  if (!/^[0-9A-Za-z_-]+$/.test(id || "")) return null;
  for (const dir of projectDirs()) {
    const file = path.join(root, dir, id + ".jsonl");
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function parseLines(text, dropFirst, dropLast) {
  const lines = text.split("\n");
  if (dropFirst) lines.shift();
  if (dropLast) lines.pop();
  const entries = [];
  for (const line of lines) {
    if (!line) continue;
    try { entries.push(JSON.parse(line)); } catch (e) { /* partial or damaged line */ }
  }
  return entries;
}

function clip(value, max) {
  return typeof value === "string" && value.length > max ? value.slice(0, max) + "…" : value;
}

function promptText(message) {
  const content = message && message.content;
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content.filter((b) => b && b.type === "text").map((b) => b.text).join(" ");
  }
  return text.replace(/\s+/g, " ").trim();
}
`;

/** Prints [{ id, mtime, cwd, custom, ai, prompt }] for the most recent sessions, newest first. */
export const LIST_SESSIONS_SCRIPT = `${COMMON}
const CHUNK = 96 * 1024;
const LIMIT = 100;

function scan(entries, info) {
  for (const e of entries) {
    if (!info.cwd && typeof e.cwd === "string" && e.cwd) info.cwd = e.cwd;
    if (e.type === "custom-title" && e.customTitle) info.custom = e.customTitle;
    else if (e.type === "ai-title" && e.aiTitle) info.ai = e.aiTitle;
    else if (e.type === "user" && !info.prompt && !e.isSidechain && !e.isMeta) {
      const text = promptText(e.message);
      if (text && !text.startsWith("<")) info.prompt = clip(text, 200);
    }
  }
}

const out = [];
for (const dir of projectDirs()) {
  let files;
  try { files = fs.readdirSync(path.join(root, dir)); } catch (e) { continue; }
  for (const name of files) {
    if (!name.endsWith(".jsonl")) continue;
    const file = path.join(root, dir, name);
    let stat;
    try { stat = fs.statSync(file); } catch (e) { continue; }
    if (!stat.isFile() || stat.size === 0) continue;

    const info = { id: name.slice(0, -6), mtime: Math.round(stat.mtimeMs), cwd: null, custom: null, ai: null, prompt: null };
    let fd;
    try {
      fd = fs.openSync(file, "r");
      const read = (start, length) => {
        const buf = Buffer.alloc(length);
        const n = fs.readSync(fd, buf, 0, length, start);
        return buf.toString("utf8", 0, n);
      };
      if (stat.size <= CHUNK * 2) {
        scan(parseLines(read(0, stat.size), false, false), info);
      } else {
        scan(parseLines(read(0, CHUNK), false, true), info);
        scan(parseLines(read(stat.size - CHUNK, CHUNK), true, false), info);
      }
    } catch (e) {
      continue;
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch (e) { /* ignore */ } }
    }
    if (info.prompt || info.custom || info.ai) out.push(info);
  }
}
out.sort((a, b) => b.mtime - a.mtime);
print(out.slice(0, LIMIT));
`;

/**
 * Prints { cwd, entries } for one session (argv[1] = id, argv[2] = max entries).
 * entries: { k: "user", text } | { k: "assistant", id, blocks } | { k: "result", toolUseId, text, isError }
 */
export const LOAD_SESSION_SCRIPT = `${COMMON}
const id = process.argv[1];
const limit = Number(process.argv[2]) || 300;
const file = findFile(id);
if (!file) {
  print({ error: "not-found" });
  process.exit(0);
}

function smallInput(input) {
  const json = JSON.stringify(input || {});
  return json.length > 3000 ? { _truncated: true, preview: json.slice(0, 1500) } : (input || {});
}

function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((p) => (p && typeof p.text === "string" ? p.text : "")).filter(Boolean).join("\\n");
}

let cwd = null;
const entries = [];
for (const e of parseLines(fs.readFileSync(file, "utf8"), false, false)) {
  if (!cwd && typeof e.cwd === "string" && e.cwd) cwd = e.cwd;
  if (e.isSidechain || e.isMeta || e.isCompactSummary) continue;

  if (e.type === "user" && e.message) {
    const content = e.message.content;
    if (typeof content === "string") {
      const text = content.trim();
      if (text && !text.startsWith("<")) entries.push({ k: "user", text: clip(text, 20000) });
    } else if (Array.isArray(content)) {
      const texts = [];
      for (const block of content) {
        if (!block) continue;
        if (block.type === "text" && block.text) texts.push(block.text);
        else if (block.type === "tool_result") {
          entries.push({ k: "result", toolUseId: block.tool_use_id, text: clip(resultText(block.content), 4000), isError: block.is_error === true });
        }
      }
      const text = texts.join("\\n").trim();
      if (text && !text.startsWith("<")) entries.push({ k: "user", text: clip(text, 20000) });
    }
  } else if (e.type === "assistant" && e.message && Array.isArray(e.message.content)) {
    if (e.message.model === "<synthetic>") continue;
    const blocks = [];
    for (const part of e.message.content) {
      if (!part) continue;
      if (part.type === "text" && part.text) blocks.push({ type: "text", text: clip(part.text, 20000) });
      else if (part.type === "thinking" && (part.thinking || part.text)) blocks.push({ type: "thinking", text: clip(part.thinking || part.text, 8000) });
      else if (part.type === "tool_use") blocks.push({ type: "tool_use", id: part.id, name: part.name, input: smallInput(part.input) });
    }
    if (!blocks.length) continue;
    const last = entries[entries.length - 1];
    if (last && last.k === "assistant" && e.message.id && last.id === e.message.id) last.blocks.push(...blocks);
    else entries.push({ k: "assistant", id: e.message.id || null, blocks });
  }
}
print({ cwd, entries: entries.slice(-limit) });
`;

/** Appends a custom title to a session (argv[1] = id, argv[2] = title). */
export const RENAME_SESSION_SCRIPT = `${COMMON}
const id = process.argv[1];
const title = String(process.argv[2] || "").replace(/[\\u0000-\\u001f]+/g, " ").trim().slice(0, 200);
const file = findFile(id);
if (!file || !title) {
  print({ ok: false });
  process.exit(0);
}
fs.appendFileSync(file, JSON.stringify({ type: "custom-title", customTitle: title, sessionId: id }) + "\\n");
print({ ok: true });
`;
