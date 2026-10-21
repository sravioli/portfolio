// Pre-highlights README snapshot code blocks at deploy time with the same highlight.js build the
// browser loads, so opening a snapshot needs neither the highlighter download nor client CPU.
// Usage: node src/tools/highlight-readme-snapshots.mjs <wwwroot>
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const defaultHighlighterPath = fileURLToPath(
  new URL("../Srv.Portfolio/wwwroot/lib/highlight/highlight.min.js", import.meta.url),
);

const codeBlockPattern = /<pre><code class="([^"&<>]*)">([^<]*)<\/code><\/pre>/g;
const namedEntities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
const entityPattern = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g;

export async function loadHighlighter(path = defaultHighlighterPath) {
  const context = { console };
  vm.runInNewContext(await readFile(path, "utf8"), context, { filename: path });
  if (!context.hljs?.highlightElement) throw new Error(`No highlight.js build at ${path}`);
  return context.hljs;
}

// Returns undefined for markup the browser could parse differently, leaving that block to the client.
export function decodeText(html) {
  let unknown = false;
  const text = html.replace(entityPattern, (_, decimal, hex, name) => {
    if (name) {
      if (Object.hasOwn(namedEntities, name)) return namedEntities[name];
      unknown = true;
      return "";
    }
    const codePoint = decimal ? Number(decimal) : Number.parseInt(hex, 16);
    if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      unknown = true;
      return "";
    }
    return String.fromCodePoint(codePoint);
  });
  if (unknown || html.replace(entityPattern, "").includes("&")) return undefined;
  return text.replace(/\r\n?/g, "\n");
}

const highlightedMarkup = /^(?:[^<>]|<span class="[\w -]+">|<\/span>)*$/;

// Minimal element for hljs.highlightElement so class handling matches the browser exactly.
function codeElement(className, textContent) {
  const element = {
    className,
    parentNode: { className: "" },
    dataset: {},
    children: { length: 0 },
    textContent,
    innerHTML: undefined,
    classList: {
      add(...tokens) {
        const current = element.className.split(/\s+/).filter(Boolean);
        for (const token of tokens) if (!current.includes(token)) current.push(token);
        element.className = current.join(" ");
      },
    },
  };
  return element;
}

export function highlightSnapshotHtml(html, hljs) {
  let highlighted = 0;
  let skipped = 0;
  const output = html.replace(codeBlockPattern, (block, className, body) => {
    // Same gate as Home.razor.js refreshPreview.
    const language = className
      .split(/\s+/)
      .find(name => name.startsWith("language-"))
      ?.slice("language-".length);
    if (!language) return block;
    const text = decodeText(body);
    if (text === undefined) return block;
    const element = codeElement(className, text);
    if (hljs.getLanguage(language)) hljs.highlightElement(element);
    if (element.dataset.highlighted !== "yes") {
      skipped++;
      return `<pre><code class="${className}" data-highlight-skip="">${body}</code></pre>`;
    }
    if (!highlightedMarkup.test(element.innerHTML)) throw new Error(`Unexpected highlighter markup for language-${language}`);
    highlighted++;
    return `<pre><code class="${element.className}" data-highlighted="yes">${element.innerHTML}</code></pre>`;
  });
  return { html: output, highlighted, skipped };
}

// Matches System.Text.Json's default encoder so untouched snapshot fields stay byte-identical.
function encodeJsonString(value) {
  let encoded = '"';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const char = value[i];
    if (char === "\\") encoded += "\\\\";
    else if (char === "\n") encoded += "\\n";
    else if (char === "\r") encoded += "\\r";
    else if (char === "\t") encoded += "\\t";
    else if (char === "\b") encoded += "\\b";
    else if (char === "\f") encoded += "\\f";
    else if (code < 0x20 || code > 0x7e || "\"&'+<>`".includes(char)) encoded += `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
    else encoded += char;
  }
  return encoded + '"';
}

export function serializeSnapshot(snapshot) {
  return `{${Object.entries(snapshot)
    .map(([key, value]) => `${encodeJsonString(key)}:${typeof value === "string" ? encodeJsonString(value) : JSON.stringify(value)}`)
    .join(",")}}`;
}

async function* snapshotFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* snapshotFiles(path);
    else if (entry.name.endsWith(".json")) yield path;
  }
}

export async function highlightSnapshots(wwwroot, hljs) {
  const totals = { files: 0, highlighted: 0, skipped: 0 };
  for await (const path of snapshotFiles(join(wwwroot, "readmes"))) {
    const snapshot = JSON.parse(await readFile(path, "utf8"));
    if (typeof snapshot.Html !== "string") throw new Error(`Snapshot without Html: ${path}`);
    const result = highlightSnapshotHtml(snapshot.Html, hljs);
    totals.files++;
    totals.highlighted += result.highlighted;
    totals.skipped += result.skipped;
    if (result.html !== snapshot.Html) await writeFile(path, serializeSnapshot({ ...snapshot, Html: result.html }), "utf8");
  }
  return totals;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const wwwroot = process.argv[2];
  if (!wwwroot) {
    console.error("Usage: node src/tools/highlight-readme-snapshots.mjs <wwwroot>");
    process.exit(2);
  }
  const totals = await highlightSnapshots(wwwroot, await loadHighlighter());
  console.log(`Highlighted ${totals.highlighted} code blocks (${totals.skipped} unsupported) in ${totals.files} snapshots.`);
}
