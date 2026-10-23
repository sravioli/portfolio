import { escapeHtml } from "./html.ts";
import { byteLength, splitRawLines, stripBom } from "./format.ts";
import { HELP_INDEX_PAGE, helpAnchor, helpTagUrl } from "./routes.ts";

/**
 * Help files use a small subset of Vim's help format (`:h help-writing`):
 *
 * - the first line is `*name.txt*  Title`;
 * - `===` or `---` lines are separators;
 * - an all-caps line is a section heading, optionally followed by `*tags*`;
 * - any other line ending in `*tags*` is an item, such as a command, described by the indented lines below it;
 * - a line of only `*tags*` defines tags for what follows;
 * - `key  description` (a tab or two spaces apart) lines form a key list, and may end in `*tags*`;
 * - a line ending in ` >` starts an example, made of the indented lines below it, up to a line starting with `<`;
 * - other lines form paragraphs, split by blank lines.
 *
 * Inline, `|tag|` links to a tag, `*tag*` defines one, `` `text` `` is literal, `{arg}` is a placeholder, and
 * `<Key>` and `CTRL-X` are keys.
 */

/** Help tag to the help file (page) that defines it. */
export type HelpTags = Readonly<Record<string, string>>;

export interface HelpKey {
  readonly key: string;
  readonly text: string;
  readonly tags: readonly string[];
}

export type HelpBlock =
  | { readonly kind: "rule" }
  | { readonly kind: "heading"; readonly text: string; readonly tags: readonly string[] }
  | { readonly kind: "item"; readonly text: string; readonly tags: readonly string[]; readonly body: string }
  | { readonly kind: "tags"; readonly tags: readonly string[] }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "example"; readonly lines: readonly string[] }
  | { readonly kind: "keys"; readonly rows: readonly HelpKey[] };

export interface HelpDocument {
  /** Page name: the file name without `.txt`. */
  readonly name: string;
  /** Tag on the first line, e.g. `clipboard.txt`. */
  readonly fileTag: string;
  readonly title: string;
  readonly blocks: readonly HelpBlock[];
  /** Every tag the file defines, in order. */
  readonly tags: readonly string[];
  /** Every tag the file links to. */
  readonly links: readonly string[];
  /** Line count and UTF-8 size of the source, shown in the statusline. */
  readonly lines?: number;
  readonly bytes?: number;
}

const TITLE_LINE = /^\*([^*\s]+\.txt)\*\s+(\S.*)$/;
const RULE_LINE = /^(?:={3,}|-{3,})\s*$/;
const TAGS_LINE = /^\s*((?:\*[^*\s]+\*\s*)+)$/;
const TRAILING_TAGS = /^(.*?\S)\s+((?:\*[^*\s]+\*\s*)+)$/;
const HEADING_TEXT = /^[A-Z][A-Z0-9 &'(),./:+-]*[A-Z0-9)]$/;
const KEY_ROW = /^(\S.*?)(?:\t+| {2,})(\S.*)$/;
const TAG = /\*([^*\s]+)\*/g;
const INLINE =
  /\|([^|\s]+)\||\*([^*\s]+)\*|`([^`]+)`|\{([a-z][\w-]*)\}|(<[A-Za-z][\w-]*>)|\b(CTRL-(?:[A-Z@^_]\b|[\]\\[]))/g;

const indented = (line: string): boolean => /^\s/.test(line);
const blank = (line: string): boolean => line.trim().length === 0;
const tagsOf = (text: string): string[] => [...text.matchAll(TAG)].map((match) => match[1]);

function splitTrailingTags(line: string): { text: string; tags: string[] } {
  const match = TRAILING_TAGS.exec(line.trimEnd());
  return match === null ? { text: line.trim(), tags: [] } : { text: match[1].trim(), tags: tagsOf(match[2]) };
}

/** Removes the indentation shared by every non-blank line. */
function dedent(lines: string[]): string[] {
  const widths = lines.filter((line) => !blank(line)).map((line) => /^\s*/.exec(line)![0].length);
  const width = widths.length === 0 ? 0 : Math.min(...widths);
  return lines.map((line) => line.slice(width).trimEnd());
}

/** Text ending in ` >` (or a lone `>`) introduces an example; returns the text without the marker. */
function exampleIntro(text: string): string | null {
  if (text.trim() === ">") return "";
  return / >$/.test(text.trimEnd()) ? text.trimEnd().slice(0, -2).trimEnd() : null;
}

export function parseHelp(name: string, source: string): HelpDocument {
  const lines = splitRawLines(stripBom(source));
  const title = TITLE_LINE.exec(lines[0] ?? "");
  if (title === null) throw new Error(`${name}.txt: the first line must be "*${name}.txt*  Title"`);
  if (title[1] !== `${name}.txt`) throw new Error(`${name}.txt: the first line names ${title[1]}`);

  const blocks: HelpBlock[] = [];
  let index = 1;

  const readExample = (): void => {
    const example: string[] = [];
    while (index < lines.length) {
      const line = lines[index];
      if (line.startsWith("<")) {
        index++;
        break;
      }
      if (!blank(line) && !indented(line)) break;
      example.push(line);
      index++;
    }
    while (example.length > 0 && blank(example[example.length - 1])) example.pop();
    while (example.length > 0 && blank(example[0])) example.shift();
    if (example.length > 0) blocks.push({ kind: "example", lines: dedent(example) });
  };

  while (index < lines.length) {
    const line = lines[index];
    if (blank(line)) {
      index++;
      continue;
    }
    if (RULE_LINE.test(line)) {
      blocks.push({ kind: "rule" });
      index++;
      continue;
    }
    if (TAGS_LINE.test(line)) {
      blocks.push({ kind: "tags", tags: tagsOf(line) });
      index++;
      continue;
    }

    const { text, tags } = splitTrailingTags(line);
    if (!indented(line) && HEADING_TEXT.test(text) && !KEY_ROW.test(text)) {
      blocks.push({ kind: "heading", text, tags });
      index++;
      continue;
    }

    if (!indented(line) && KEY_ROW.test(text)) {
      const rows: { key: string; text: string; tags: string[] }[] = [];
      while (index < lines.length) {
        const current = lines[index];
        if (blank(current)) break;
        if (indented(current)) {
          const previous = rows[rows.length - 1];
          if (TAGS_LINE.test(current)) previous.tags.push(...tagsOf(current));
          else {
            const continued = splitTrailingTags(current);
            previous.text += ` ${continued.text}`;
            previous.tags.push(...continued.tags);
          }
          index++;
          continue;
        }
        const row = splitTrailingTags(current);
        const match = KEY_ROW.exec(row.text);
        if (match === null) break;
        rows.push({ key: match[1].trim(), text: match[2].trim(), tags: row.tags });
        index++;
      }
      blocks.push({ kind: "keys", rows });
      continue;
    }

    if (!indented(line) && tags.length > 0) {
      index++;
      const body: string[] = [];
      while (index < lines.length && indented(lines[index]) && !blank(lines[index])) {
        body.push(lines[index].trim());
        index++;
      }
      blocks.push({ kind: "item", text, tags, body: body.join(" ") });
      continue;
    }

    const paragraph: string[] = [];
    let example = false;
    while (index < lines.length && !blank(lines[index])) {
      const current = lines[index];
      if (paragraph.length > 0 && (RULE_LINE.test(current) || TAGS_LINE.test(current))) break;
      index++;
      const intro = exampleIntro(current);
      if (intro !== null) {
        if (intro.length > 0) paragraph.push(intro.trim());
        example = true;
        break;
      }
      paragraph.push(current.trim());
    }
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    if (example) readExample();
  }

  const inlineTexts = blocks.flatMap((block): string[] => {
    switch (block.kind) {
      case "heading":
        return [block.text];
      case "item":
        return [block.text, block.body];
      case "paragraph":
        return [block.text];
      case "keys":
        return block.rows.flatMap((row) => [row.key, row.text]);
      default:
        return [];
    }
  });
  const tags = [title[1]];
  const links: string[] = [];
  for (const block of blocks) {
    if (block.kind === "heading" || block.kind === "item" || block.kind === "tags") tags.push(...block.tags);
    if (block.kind === "keys") for (const row of block.rows) tags.push(...row.tags);
  }
  for (const text of inlineTexts)
    for (const match of text.matchAll(INLINE)) {
      if (match[1] !== undefined) links.push(match[1]);
      if (match[2] !== undefined) tags.push(match[2]);
    }
  const lineCount = source.endsWith("\n") ? lines.length - 1 : lines.length;
  const bytes = byteLength(source);
  return { name, fileTag: title[1], title: title[2].trim(), blocks, tags, links, lines: lineCount, bytes };
}

// ---------------------------------------------------------------- rendering

const text = escapeHtml;

function tagLink(tag: string, tags: HelpTags, label = tag): string {
  const page = tags[tag];
  if (page === undefined) return `<span class="help-link-missing">${text(label)}</span>`;
  return `<a class="help-link" href="${text(helpTagUrl(page, tag))}" data-help-tag="${text(tag)}">${text(label)}</a>`;
}

const tagTarget = (tag: string): string =>
  `<span class="help-tag" id="${text(helpAnchor(tag))}">${text(tag)}</span>`;

const tagTargets = (tags: readonly string[]): string =>
  tags.length === 0 ? "" : `<span class="help-tags">${tags.map(tagTarget).join(" ")}</span>`;

/** Inline markup; in key lists literal text is a key, elsewhere it is code. */
export function renderHelpInline(source: string, tags: HelpTags, literal: "kbd" | "code" = "code"): string {
  let html = "";
  let offset = 0;
  for (const match of source.matchAll(INLINE)) {
    html += text(source.slice(offset, match.index));
    offset = match.index + match[0].length;
    const [, link, target, code, placeholder, key, control] = match;
    if (link !== undefined) html += tagLink(link, tags);
    else if (target !== undefined) html += tagTarget(target);
    else if (code !== undefined) html += `<${literal}>${text(code)}</${literal}>`;
    else if (placeholder !== undefined) html += `<var>{${text(placeholder)}}</var>`;
    else html += `<kbd>${text(key ?? control)}</kbd>`;
  }
  return html + text(source.slice(offset));
}

function renderBlock(block: HelpBlock, tags: HelpTags): string {
  const inline = (source: string, literal?: "kbd" | "code"): string => renderHelpInline(source, tags, literal);
  switch (block.kind) {
    case "rule":
      return '<hr class="help-rule">';
    case "heading":
      return `<h2 class="help-section"><span>${inline(block.text)}</span>${tagTargets(block.tags)}</h2>`;
    case "item":
      return (
        `<section class="help-item"><h3><span class="help-item-text">${inline(block.text)}</span>` +
        `${tagTargets(block.tags)}</h3>${block.body ? `<p>${inline(block.body)}</p>` : ""}</section>`
      );
    case "tags":
      return `<p class="help-tag-line">${tagTargets(block.tags)}</p>`;
    case "paragraph":
      return `<p>${inline(block.text)}</p>`;
    case "example":
      return `<pre class="help-example"><code>${text(block.lines.join("\n"))}</code></pre>`;
    case "keys":
      return (
        `<dl class="help-keys">` +
        block.rows
          .map((row) => `<dt>${inline(row.key, "kbd")}</dt><dd>${inline(row.text)}${tagTargets(row.tags)}</dd>`)
          .join("") +
        `</dl>`
      );
  }
}

/** Article markup of a help file; links resolve through `tags`. */
export function renderHelp(document: HelpDocument, tags: HelpTags): string {
  return (
    `<article class="help-content" data-help-page="${text(document.name)}"` +
    `${document.lines === undefined ? "" : ` data-total-lines="${document.lines}"`}` +
    `${document.bytes === undefined ? "" : ` data-bytes="${document.bytes}"`}>` +
    `<h1 class="help-title">${tagTarget(document.fileTag)}<span>${text(document.title)}</span></h1>` +
    document.blocks.map((block) => renderBlock(block, tags)).join("") +
    `</article>`
  );
}

export interface HelpBundle {
  readonly documents: readonly HelpDocument[];
  readonly tags: HelpTags;
  /** Rendered article per page name. */
  readonly html: Readonly<Record<string, string>>;
}

/** Parses, validates, and renders every help file; throws on duplicate tags and broken links. */
export function buildHelp(sources: readonly { name: string; source: string }[]): HelpBundle {
  const documents = sources.map(({ name, source }) => parseHelp(name, source));
  if (!documents.some((document) => document.name === HELP_INDEX_PAGE))
    throw new Error(`Missing the help index, ${HELP_INDEX_PAGE}.txt`);
  const tags: Record<string, string> = {};
  for (const document of documents)
    for (const tag of document.tags) {
      if (Object.hasOwn(tags, tag))
        throw new Error(`Duplicate help tag *${tag}* in ${document.name}.txt and ${tags[tag]}.txt`);
      tags[tag] = document.name;
    }
  for (const document of documents)
    for (const link of document.links)
      if (!Object.hasOwn(tags, link)) throw new Error(`${document.name}.txt links to unknown tag |${link}|`);
  const html: Record<string, string> = {};
  for (const document of documents) html[document.name] = renderHelp(document, tags);
  return { documents, tags, html };
}

const byLength = (left: string, right: string): number => left.length - right.length || left.localeCompare(right);

/**
 * Finds the tag for `:help {topic}` the way Vim ranks matches, simplified: an exact match, then one that differs
 * only in case, then the shortest tag starting with the topic, then the shortest containing it.
 * An empty topic is the help index. Returns `null` when nothing matches.
 */
export function resolveHelpTag(tags: HelpTags, topic: string): string | null {
  const query = topic.trim();
  if (query.length === 0) return `${HELP_INDEX_PAGE}.txt`;
  if (Object.hasOwn(tags, query)) return query;
  const lower = query.toLowerCase();
  const candidates = Object.keys(tags).sort(byLength);
  return (
    candidates.find((tag) => tag.toLowerCase() === lower) ??
    candidates.find((tag) => tag.toLowerCase().startsWith(lower)) ??
    candidates.find((tag) => tag.toLowerCase().includes(lower)) ??
    null
  );
}

/** Help file that defines `tag`; unknown tags fall back to the index. */
export const helpPageOf = (tags: HelpTags, tag: string | null): string =>
  (tag !== null ? tags[tag] : undefined) ?? HELP_INDEX_PAGE;
