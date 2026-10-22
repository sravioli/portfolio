import {
  findParent,
  getAncestry,
  hasReadme,
  isRoot,
  pickKey,
  rootEntry,
  type ExplorerItem,
} from "./catalog.ts";
import type { FileSearchResult } from "./file-search.ts";
import {
  formatFileSize,
  pad,
  scrollFraction,
  scrollThumbStyle,
  splitRawLines,
  statusPaths,
  type SplitPath,
} from "./format.ts";
import { attr, escapeHtml } from "./html.ts";
import { controlNotation, leaderNotation } from "../nvim/key-notation.ts";
import type { NavigationState } from "./navigation-state.ts";

export interface HeadingBreadcrumb {
  readonly id: string;
  readonly title: string;
  readonly level: number;
}

export type ExplorerMode = "pending" | "open" | "closed";

/** Everything the shell markup depends on besides the navigation state itself. */
export interface ViewModel {
  readonly state: NavigationState;
  readonly explorer: ExplorerMode;
  readonly finderOpen: boolean;
  readonly loading: boolean;
  readonly loadError: string | null;
  /** Rendered article HTML of the current document, once loaded. */
  readonly documentHtml: string | null;
  /** Source of the current document; required for the raw view. */
  readonly documentSource: string | null;
  readonly documentBytes: number;
  readonly totalLines: number;
  readonly positionLine: number;
  readonly positionColumn: number;
  readonly scrollPosition: string;
  readonly headings: readonly HeadingBreadcrumb[];
  readonly openError: string | null;
}

const ICON_EXPLORER = "&#xf0645;";
const ICON_FILE = "&#xf48a;";
const ICON_FOLDER = "&#xf024b;";
const ICON_FOLDER_OPEN = "&#xf0770;";
const ICON_FIND = "&#xf002;";
const ICON_SIZE = "&#xf0214;";
const ICON_EMPTY_FILE = "&#xf4a5;";

const text = escapeHtml;

export const documentLoaded = (model: ViewModel): boolean =>
  model.state.isReading &&
  !model.loading &&
  model.loadError === null &&
  (model.state.isRawView ? model.documentSource !== null : model.documentHtml !== null);

// ---------------------------------------------------------------- tabline

export function renderTabline({ state }: ViewModel): string {
  const title = state.isReading
    ? state.currentDocument && isRoot(state.currentDocument)
      ? "README"
      : (state.currentDocument?.name ?? "")
    : "Explorer";
  return (
    `<button type="button" class="explorer-label" data-action="toggle-explorer" aria-controls="portfolio-explorer"` +
    `${attr("aria-expanded", state.isExplorerOpen ? "true" : "false")} title="Toggle the explorer (&lt;leader&gt;e)">` +
    `<span class="explorer-toggle-icon" aria-hidden="true">${ICON_EXPLORER}</span>` +
    `<span class="explorer-label-text">File Explorer</span>` +
    `<span class="visually-hidden">${state.isExplorerOpen ? "Hide" : "Show"} the file explorer</span></button>` +
    `<div class="active-tab"><span class="tab-icon" aria-hidden="true">${ICON_FILE}</span>` +
    `<span class="tab-title">${text(title)}</span>` +
    `<button type="button" class="tab-close" data-action="close-document" aria-label="Close document">×</button></div>` +
    `<div class="tab-actions"><button type="button" data-action="back" aria-label="Back" title="Back">` +
    `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 5-7 7 7 7M5 12h14"/></svg></button>` +
    `<button type="button" class="keys-toggle" data-action="toggle-keys" aria-label="Keyboard shortcuts"` +
    `${attr("aria-pressed", state.keyboardEnabled ? "true" : "false")} title="Keyboard shortcuts: ${state.keyboardEnabled ? "on" : "off"} (:set keys / :set nokeys)">` +
    `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>` +
    `${state.keyboardEnabled ? "" : '<path d="m3 3 18 18"/>'}</svg></button>` +
    `<button type="button" data-action="toggle-theme" aria-label="Light mode" aria-pressed="false"` +
    ` title="Toggle light / dark mode">` +
    `<svg class="theme-wave-label" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>` +
    `<svg class="theme-lotus-label" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg></button>` +
    `<button type="button" data-action="find" aria-label="Find files" title="Find files (&lt;leader&gt;ff)">${ICON_FIND}</button>` +
    `<button type="button" data-action="help" aria-label="Help">?</button></div>`
  );
}

// ---------------------------------------------------------------- explorer

export function renderExplorerEntry(item: ExplorerItem, index: number, selected: boolean): string {
  const folder = item.kind === "folder";
  const indent = '<span class="tree-indent" aria-hidden="true"></span>'.repeat(item.depth);
  const chevron = folder ? (item.isExpanded ? "⌄" : "›") : "";
  const icon = folder ? (item.isExpanded ? ICON_FOLDER_OPEN : ICON_FOLDER) : ICON_FILE;
  const name = folder ? `<strong>${text(item.name)}</strong>` : `<span>${text(item.name)}</span>`;
  return (
    `<button type="button" class="entry${selected ? " selected" : ""}" data-index="${index}"` +
    `${attr("aria-current", selected ? "true" : null)}` +
    `${attr("aria-expanded", folder ? String(item.isExpanded) : null)}` +
    `${attr("title", item.entry?.description)}>` +
    `${indent}<span class="tree-chevron" aria-hidden="true">${chevron}</span>` +
    `<span class="entry-icon ${folder ? "folder-icon" : "file-icon"}" aria-hidden="true">${icon}</span>` +
    `${name}</button>`
  );
}

export const renderExplorerEntries = ({ state }: ViewModel): string =>
  state.entries
    .map((item, index) => renderExplorerEntry(item, index, index === state.selectedIndex))
    .join("");

// ---------------------------------------------------------------- breadcrumb

export function renderHeadingCrumbs(headings: readonly HeadingBreadcrumb[]): string {
  return headings
    .map(
      (heading) =>
        `<span class="crumb-divider" aria-hidden="true">›</span>` +
        `<a class="heading-crumb" href="#${text(heading.id)}" data-pick-segment` +
        `${attr("data-readme-heading", heading.id)}${attr("title", heading.title)}>` +
        `<span class="heading-level" aria-hidden="true">H${heading.level}</span>` +
        `<span class="heading-title">${text(heading.title)}</span></a>`,
    )
    .join("");
}

export function renderBreadcrumb(model: ViewModel): string {
  const { state } = model;
  let html = `<span aria-hidden="true">${ICON_FOLDER}</span>`;
  for (const entry of getAncestry(state.currentFolder)) {
    const parent = findParent(entry);
    if (!isRoot(entry)) html += '<span class="crumb-divider">›</span>';
    html +=
      `<span class="crumb" data-pick-segment${attr("data-pick-menu", (parent ?? entry).repository)}` +
      `${attr("data-pick-current", pickKey(entry))}>${text(entry.name)}</span>`;
  }
  if (state.isReading) {
    const repository = state.currentFolder.repository;
    html +=
      `<span class="crumb-divider">›</span><span aria-hidden="true">${ICON_FILE}</span>` +
      `<span class="crumb" data-pick-segment${attr("data-pick-menu", repository)}` +
      `${attr("data-pick-current", `readme:${repository}`)}>README.md</span>`;
    if (!state.isRawView && !model.loading && model.loadError === null)
      html += renderHeadingCrumbs(model.headings);
  }
  return html;
}

// ---------------------------------------------------------------- preview

const EOB_SHORT = '<div class="eob-markers" aria-hidden="true">~<br>~<br>~</div>';
const EOB_LONG = '<div class="eob-markers" aria-hidden="true">~<br>~<br>~<br>~<br>~</div>';

export function renderWelcome(model: ViewModel): string {
  const { state } = model;
  const find = text(leaderNotation("ff", state.devNotation, state.leaderLabel));
  return (
    `<section class="welcome-screen" aria-label="Welcome"><h1>SRAVIO.LI</h1>` +
    `<p>Simone Fidanza<br>.NET dev - C#, ASP.NET, MAUI. I also write Lua, Python, and some C/C++.<br>` +
    `<a href="https://github.com/sravioli">github.com/sravioli</a></p>` +
    `<div class="welcome-hints keyboard-hints">` +
    `<button type="button" data-action="open-readme"><span>open <span class="welcome-key">README.md</span></span><span>to get to know me</span></button>` +
    `<button type="button" data-action="focus-explorer"><span>press <span class="welcome-key">j / k</span></span><span>to browse projects with the tree focused</span></button>` +
    `<button type="button" data-action="open-selected"><span>press <span class="welcome-key">Enter</span></span><span>to open the selection</span></button>` +
    `<button type="button" data-action="find"><span>press <span class="welcome-key">${find}</span></span><span>to find a file</span></button>` +
    `<div><span>press <span class="welcome-key">gx</span></span><span>to open the link under the cursor</span></div>` +
    `<button type="button" data-action="help"><span>type <span class="welcome-key">:help<span class="welcome-enter">&lt;Enter&gt;</span></span></span><span>for keyboard help</span></button>` +
    `</div><div class="welcome-hints touch-hints">` +
    `<button type="button" data-action="open-readme"><span>read <span class="welcome-key">README.md</span></span><span>to get to know me</span></button>` +
    `<button type="button" data-action="open-explorer"><span>tap <span class="welcome-key welcome-icon" aria-hidden="true">${ICON_EXPLORER}</span><span class="visually-hidden">Files</span> top left</span><span>to browse projects</span></button>` +
    `<button type="button" data-action="find"><span>tap <span class="welcome-key welcome-icon" aria-hidden="true">${ICON_FIND}</span><span class="visually-hidden">Find</span> top right</span><span>to search for a project</span></button>` +
    `<button type="button" data-action="help"><span>tap <span class="welcome-key">?</span> top right</span><span>to see what else you can do</span></button>` +
    `</div><p class="welcome-footer">Mouse and touch work here, too.</p>` +
    `<p class="welcome-footer touch-footer">Or tap any line above.</p></section>`
  );
}

export function renderRawDocument(source: string, repository: string | undefined): string {
  const lines = splitRawLines(source)
    .map((line) => `<span class="raw-line">${text(line)}</span>`)
    .join("");
  return `<pre class="raw-readme"${attr("data-repository", repository)}>${lines}</pre>`;
}

export const renderArticle = (html: string, repository: string, totalLines: number): string =>
  `<article class="readme-content"${attr("data-repository", repository)}${attr("data-total-lines", totalLines)}>${html}</article>`;

/** Identifies the preview content, so the client only replaces it when it actually changes. */
export function previewKey(model: ViewModel): string {
  const { state } = model;
  if (state.isWelcome) return `welcome:${state.devNotation}:${state.leader}`;
  const document = state.currentDocument?.repository ?? "";
  if (state.isReading && model.loadError !== null) return `error:${document}:${model.loadError}`;
  if (documentLoaded(model)) return `document:${document}:${state.isRawView ? "raw" : "rendered"}`;
  if (!isRoot(state.currentFolder) && !hasReadme(state.currentFolder)) return "no-readme";
  if (model.loading) return "loading";
  return "hint";
}

export function renderPreview(model: ViewModel): string {
  const { state } = model;
  if (state.isWelcome) return renderWelcome(model);
  if (state.isReading && model.loadError !== null)
    return (
      `<div class="readme-load-error"><p class="readme-error-title" role="alert">E484: Can't open file README.md</p>` +
      `<p class="readme-error-actions"><button type="button" data-action="retry" aria-label=":e — retry opening README.md">:e</button>` +
      `<span>Retry opening the file</span></p>` +
      `<details><summary>Error details</summary><p>${text(model.loadError)}</p></details></div>`
    );
  if (documentLoaded(model)) {
    const repository = state.currentDocument?.repository ?? "";
    const body = state.isRawView
      ? renderRawDocument(model.documentSource!, repository)
      : renderArticle(model.documentHtml!, repository, model.totalLines);
    return `${body}${EOB_LONG}<div class="nvim-cursor" aria-hidden="true"></div>`;
  }
  if (!isRoot(state.currentFolder) && !hasReadme(state.currentFolder))
    return `<article class="readme-content no-readme"><p>No README published.</p></article>${EOB_SHORT}`;
  if (model.loading) return '<p class="loading-message" role="status">Loading README…</p>';
  return `<p class="preview-hint">Select a file to open it.</p>${EOB_SHORT}`;
}

export const renderOpenError = (message: string | null): string =>
  message === null
    ? ""
    : `<button type="button" class="editor-message-notification" role="alert" data-action="dismiss-open-error"` +
      `${attr("aria-label", `Dismiss: ${message}`)}>${text(message)}</button>`;

// ---------------------------------------------------------------- statusline

const thumb = (fraction: number): string =>
  `<span class="scroll-thumb" aria-hidden="true"${attr("style", scrollThumbStyle(fraction))}></span>`;

const modeBlock = (full: string, short: string): string =>
  `<span class="mode-block"><span class="status-full">${full}</span><span class="status-short" aria-hidden="true">${short}</span></span>`;

const pathParts = (path: SplitPath): string =>
  `<span class="cwd-head">${text(path.head)}</span><span class="cwd-tail">${text(path.tail)}</span>`;

function cwdSegment(model: ViewModel): string {
  const paths = statusPaths(model.state.currentFolder);
  return (
    `<span class="cwd-segment"><span aria-hidden="true">${ICON_FOLDER}</span>` +
    `<i class="cwd-path cwd-full">${pathParts(paths.full)}</i>` +
    `<i class="cwd-path cwd-short" aria-hidden="true">${pathParts(paths.short)}</i></span>`
  );
}

const FILE_FORMAT =
  '<span class="file-format" title="Unix line endings" aria-label="Unix line endings">&#xe712;</span>';

const explorerScroll = ({ state }: ViewModel): number =>
  state.entries.length < 2 ? 0 : state.selectedIndex / (state.entries.length - 1);

export function statuslineClass(model: ViewModel): string {
  const { state } = model;
  const kind =
    (state.isReading || state.isCommandMode) && !model.finderOpen ? "reading-status" : "explorer-status";
  const mode = model.finderOpen ? "insert-status" : state.isCommandMode ? "command-status" : "";
  return `statusline ${kind} ${mode}`;
}

/** Statusline content after the search-position output, which the search module owns. */
export function renderStatusline(model: ViewModel): string {
  const { state } = model;
  if (model.finderOpen)
    return (
      `<div class="status-left"><span class="mode-block">INSERT</span>` +
      `<span class="power-arrow blue-arrow" aria-hidden="true"></span>` +
      `<span class="telescope-segment"><span aria-hidden="true">&#xf46b;</span> telescope</span></div>` +
      `<div class="status-right"><span class="tree-count"><span aria-hidden="true">${ICON_EMPTY_FILE}</span> 0b</span>` +
      `<span class="position-block">001/001:01 All ${thumb(explorerScroll(model))}</span></div>`
    );
  if (state.isCommandMode && !state.isReading)
    return (
      `<div class="status-left">${modeBlock("COMMAND", "C")}` +
      `<span class="power-arrow blue-arrow" aria-hidden="true"></span>${cwdSegment(model)}` +
      `<span class="power-arrow surface-arrow" aria-hidden="true"></span>` +
      `<span class="file-segment"><span aria-hidden="true">${ICON_EMPTY_FILE}</span> [No Name]</span>` +
      `<span class="power-arrow file-arrow" aria-hidden="true"></span></div>` +
      `<div class="status-right"><span class="byte-size">0b <span aria-hidden="true">${ICON_SIZE}</span></span>` +
      `<span class="encoding">utf-8</span>${FILE_FORMAT}<span class="position-block">000/001:00 All</span></div>`
    );
  if (state.isReading) {
    const size = documentLoaded(model) ? formatFileSize(model.documentBytes) : "0b";
    const position = `${pad(model.positionLine, 3)}/${pad(model.totalLines, 3)}:${pad(model.positionColumn, 2)} `;
    return (
      `<div class="status-left">${state.isCommandMode ? modeBlock("COMMAND", "C") : modeBlock("NORMAL", "N")}` +
      `<span class="power-arrow blue-arrow" aria-hidden="true"></span>${cwdSegment(model)}` +
      `<span class="power-arrow surface-arrow" aria-hidden="true"></span>` +
      `<span class="file-segment"><span aria-hidden="true">${ICON_FILE}</span> README.md</span>` +
      `<span class="power-arrow file-arrow" aria-hidden="true"></span>` +
      `<span class="branch-segment"><span aria-hidden="true">&#xe0a0;</span> main</span></div>` +
      `<div class="status-right"><span class="byte-size">${size} <span aria-hidden="true">${ICON_SIZE}</span></span>` +
      `<span class="encoding">utf-8</span>${FILE_FORMAT}` +
      `<span class="filetype">${state.isRawView ? "TEXT" : "MARKDOWN"}</span>` +
      `<span class="position-block"><span class="status-full">${position}</span>${text(model.scrollPosition)} ` +
      `${thumb(scrollFraction(model.scrollPosition))}</span></div>`
    );
  }
  return (
    `<div class="status-left"><span class="tree-mode">NVIMTREE</span>` +
    `<span class="power-arrow tree-arrow" aria-hidden="true"></span></div>` +
    `<div class="status-right"><span class="tree-count"><span aria-hidden="true">${ICON_EMPTY_FILE}</span> 0b</span>` +
    `<span class="position-block">${pad(state.selectedIndex + 1, 3)}/${pad(state.entries.length, 3)}:01 All ` +
    `${thumb(explorerScroll(model))}</span></div>`
  );
}

// ---------------------------------------------------------------- command line

export const showCommandMessage = ({ state }: ViewModel): boolean =>
  !state.isCommandMode && !!state.message;

export function renderCommandLine(model: ViewModel): string {
  const { state } = model;
  const message = showCommandMessage(model) ? text(state.message!) : "";
  return (
    `<label for="command-input" class="visually-hidden">Command</label><div class="command-field">` +
    `<input id="command-input"${attr("value", state.commandText || null)}` +
    `${attr("placeholder", showCommandMessage(model) ? "" : "Type a command…")} autocomplete="off" spellcheck="false">` +
    `<output class="command-message${state.isErrorMessage ? " is-error" : ""}" for="command-input" aria-live="polite" aria-atomic="true">` +
    `${message}</output></div>`
  );
}

// ---------------------------------------------------------------- help

function leaderKeys(keys: string, state: NavigationState): string {
  if (state.devNotation) return `<kbd>${text(leaderNotation(keys, true, state.leaderLabel))}</kbd>`;
  const sequence = [...keys].map((key) => `<kbd>${text(key)}</kbd>`).join(" ");
  return `<span class="key-seq"><kbd>${text(state.leaderLabel)}</kbd> then ${sequence}</span>`;
}

const ctrl = (key: string, state: NavigationState): string =>
  `<kbd>${text(controlNotation(key, state.devNotation))}</kbd>`;

const kbd = (...keys: string[]): string => keys.map((key) => `<kbd>${key}</kbd>`).join("");

const row = (term: string, description: string): string => `<dt>${term}</dt><dd>${description}</dd>`;

const group = (title: string, rows: string, note = ""): string =>
  `<section class="help-group"><h3>${title}</h3>${note}<dl>${rows}</dl></section>`;

const COMMAND_ROWS =
  row(kbd("/pattern"), "Search the open README") +
  row(kbd("n", "N"), "Next or previous search match") +
  row(kbd(":nohl"), "Clear search highlighting") +
  row(kbd("↑", "↓"), "Browse command history") +
  row(kbd(":e"), "Reload the README") +
  row(kbd(":e &lt;path&gt;"), "Open a README by project path");

/** Contents of the help dialog; the dialog element itself is static. */
export function renderHelp({ state }: ViewModel): string {
  const touch =
    `<div class="help-touch">` +
    group(
      "Touch",
      row(`<span class="help-icon" aria-hidden="true">${ICON_EXPLORER}</span> top left`, "Show or hide the files") +
        row("Tap a file or folder", "Open the file, or expand the folder") +
        row("Back", "Go up one level") +
        row(`<span class="help-icon" aria-hidden="true">${ICON_FIND}</span> top right`, "Find a file by name") +
        row("Tap a breadcrumb", "Jump to another folder or heading") +
        row("Tap an image", "Full-screen preview") +
        row(`<span class="help-icon" aria-hidden="true">&#xf05b6;</span> on code`, "Wrap long lines"),
    ) +
    group(
      "Commands",
      COMMAND_ROWS +
        row(kbd(":q"), "Return to the listing") +
        row(kbd(":NvimTreeToggle"), "Show or hide the files"),
      '<p class="help-note">Type them in the command line at the bottom.</p>',
    ) +
    `</div>`;

  const general = group(
    "General",
    (state.devNotation ? row(kbd("&lt;leader&gt;"), text(state.leaderLabel)) : "") +
      row(kbd(":"), "Command line (always works)") +
      row(kbd("?", ":h"), "Open this help") +
      row(ctrl("h", state) + leaderKeys("e", state), "Focus the explorer") +
      row(ctrl("l", state), "Focus the README") +
      row(kbd("Tab"), "Browser focus navigation"),
  );
  const explorer = group(
    "Explorer",
    row(kbd("j", "k"), "Move the selection") +
      row(kbd("l", "Enter"), "Open a file or toggle a folder") +
      row(kbd("h"), "Collapse, or go to the parent") +
      row(kbd("gg", "G"), "First or last entry"),
  );
  const find = group(
    "Find",
    row(leaderKeys("ff", state) + ctrl("p", state), "Fuzzy-find READMEs") +
      row(ctrl("j", state) + ctrl("k", state), "Next or previous result") +
      row(leaderKeys(";", state), "Pick a breadcrumb by letter") +
      row(kbd("j", "k", "l", "h"), "In the pick menu: move, open, back"),
  );
  const readme = group(
    "README",
    row(kbd("h", "j", "k", "l"), `Move the cursor (prefix a count, e.g. ${kbd("5j")})`) +
      row(kbd("gg", "G"), `Top or bottom (${kbd("12G")} goes to line 12)`) +
      row(ctrl("d", state) + ctrl("u", state), "Half page down or up") +
      row(kbd("]]", "[["), "Next or previous heading") +
      row(kbd("p"), "Toggle rendered or raw") +
      row(ctrl("c", state), "Copy the source (no selection)") +
      row(kbd("-"), "Back to the explorer") +
      row(leaderKeys("bx", state), "Close the tab"),
  );
  const links = group(
    "Links &amp; jumps",
    row(kbd("gx", "Enter"), "Follow the link or play the video") +
      row(`Click / ${kbd("Enter")}`, "Full-screen image preview") +
      row(ctrl("o", state) + ctrl("i", state), "Jump back or forward"),
  );
  const commands = group(
    "Commands",
    COMMAND_ROWS +
      row(kbd(":Ex", ":q"), "Return to the listing") +
      row(kbd(":set nokeys", ":set keys"), "Keymaps off or on") +
      row(kbd(":set nodev", ":set dev"), "Plain words or Vim notation") +
      row(kbd(':let mapleader = ","'), "Change the leader until reload"),
  );
  const motions = group(
    "Motions",
    row(kbd("w", "b", "e", "ge"), "Word forward, back, end, previous end") +
      row(kbd("W", "B", "E", "gE"), "Same for WORDs (blank-separated)") +
      row(kbd("0", "^", "$", "g_"), "Line start, first or last non-blank, end") +
      row(kbd("|", "gm", "gM"), "Column N, middle of screen or text") +
      row(kbd("+", "_", "gj", "gk"), "Next or current line start, display lines") +
      row(kbd("f", "F", "t", "T"), "Find or till a character on the line") +
      row(kbd(";", ","), "Repeat the last find, same or reverse") +
      row(kbd("H", "M", "L"), "Top, middle or bottom of the screen") +
      row(kbd("zt", "zz", "zb"), "Scroll the line to the top, middle or bottom") +
      row(kbd("(", ")", "{", "}"), "Previous or next sentence, paragraph") +
      row(kbd("%", "50%"), "Matching bracket, or percentage of the file") +
      row(kbd("[(", "[{", "])", "]}"), "Unmatched bracket") +
      row(kbd("][", "[]"), "End of the next or previous section") +
      row(kbd("ma", "'a", "`a"), "Set a mark, jump to its line or spot") +
      row(kbd("mA", "''"), "Mark across READMEs, jump back"),
  );

  return (
    `<div class="help-heading"><h2 id="help-title"><span class="input-keys">Keyboard shortcuts</span>` +
    `<span class="input-touch">Help</span></h2><div class="help-actions">` +
    `<button type="button" class="help-dev-toggle" data-action="toggle-dev"${attr("aria-pressed", state.devNotation ? "true" : "false")}` +
    ` title="Key notation: Vim (&lt;leader&gt;ff) or plain (Space then f f). :set dev / :set nodev">` +
    `Notation: ${state.devNotation ? "Vim" : "Plain"}</button>` +
    `<button type="button" data-action="close-help" aria-label="Close help">×</button></div></div>` +
    touch +
    `<details class="help-keys"><summary>Keyboard shortcuts</summary>` +
    `<p class="help-hint"><kbd>Esc</kbd> or <kbd>q</kbd> closes</p><div class="help-groups">` +
    `<div class="help-column">${general}${explorer}${find}</div>` +
    `<div class="help-column">${readme}${links}${commands}</div>` +
    `<div class="help-column">${motions}</div></div></details>`
  );
}

// ---------------------------------------------------------------- shell

export const EXPLORER_STORAGE_KEY = "portfolio.explorer";
// Keep in sync with the narrow-layout media query in app.css.
export const NARROW_QUERY = "(max-width: 700px)";

/** Runs right after the shell markup, so the explorer starts in its final state without a layout shift. */
export const EXPLORER_SCRIPT =
  `(()=>{let c=null;try{c=localStorage.getItem(${JSON.stringify(EXPLORER_STORAGE_KEY)})}catch{}` +
  `document.querySelector(".portfolio-shell").dataset.explorer=` +
  `matchMedia(${JSON.stringify(NARROW_QUERY)}).matches||c==="closed"?"closed":"open"})()`;

/** Search position slot; the search module owns its content and visibility. */
export const SEARCH_POSITION =
  '<output id="search-position" class="search-position" hidden aria-label="Search query and match position"></output>';

/** Full application markup; the server renders it once and the client patches its regions. */
export function renderShell(model: ViewModel): string {
  const { state } = model;
  return (
    `<div class="skip-link"><a href="#portfolio-main">Skip to content</a></div>` +
    `<div class="portfolio-shell" data-reading="${state.isReading}" data-explorer="${model.explorer}">` +
    `<header class="tabline">${renderTabline(model)}</header>` +
    `<div class="workspace"><div class="explorer-backdrop" aria-hidden="true" data-action="close-explorer"></div>` +
    `<aside id="portfolio-explorer" class="explorer" aria-label="File Explorer">` +
    `<div class="explorer-path">/home/${text(rootEntry.name)}/</div>` +
    `<nav class="entry-list" aria-label="Project files">${renderExplorerEntries(model)}</nav></aside>` +
    `<main id="portfolio-main" class="preview-area">` +
    `<div class="breadcrumb" aria-label="Current location">${renderBreadcrumb(model)}</div>` +
    `<div class="open-error">${renderOpenError(model.openError)}</div>` +
    `<section class="preview-scroll" data-welcome="${state.isWelcome}" tabindex="0">${renderPreview(model)}</section>` +
    `</main></div>` +
    `<footer class="${statuslineClass(model)}">${SEARCH_POSITION}${renderStatusline(model)}</footer>` +
    `<form class="command-line">${renderCommandLine(model)}</form></div>` +
    `<dialog class="help-dialog" aria-labelledby="help-title">${renderHelp(model)}</dialog>`
  );
}

// ---------------------------------------------------------------- finder

export interface FinderModel {
  readonly query: string;
  readonly results: readonly FileSearchResult[];
  readonly totalCount: number;
  readonly selectedIndex: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly preview: string | null;
}

function highlightPath(result: FileSearchResult): string {
  const matches = new Set(result.matches);
  let html = "";
  for (let index = 0; index < result.path.length; index++) {
    const character = text(result.path[index]);
    html += matches.has(index) ? `<span class="finder-match">${character}</span>` : `<span>${character}</span>`;
  }
  return html;
}

export function renderFinderResults(model: FinderModel): string {
  if (model.results.length === 0) return '<p class="finder-empty">No matching files.</p>';
  return model.results
    .map((result, index) => {
      const selected = index === model.selectedIndex;
      return (
        `<button type="button" id="finder-result-${index}" class="finder-result${selected ? " selected" : ""}"` +
        ` role="option" aria-selected="${selected}" tabindex="-1" data-index="${index}"${attr("title", result.path)}>` +
        `<span class="finder-pointer" aria-hidden="true">${selected ? "›" : " "}</span>` +
        `<span class="finder-file-icon" aria-hidden="true">${ICON_FILE}</span>` +
        `<span class="finder-path">${highlightPath(result)}</span></button>`
      );
    })
    .join("");
}

export function renderFinderPreview(model: FinderModel): string {
  if (model.loading) return '<legend>README Preview</legend><p role="status">Loading preview…</p>';
  if (model.error !== null)
    return (
      `<legend>README Preview</legend><div class="finder-preview-error">` +
      `<p class="finder-error-title" role="alert">E484: Can't open file for preview</p>` +
      `<button type="button" class="finder-retry" data-finder-action="retry">Retry</button>` +
      `<details><summary>Error details</summary><p>${text(model.error)}</p></details></div>`
    );
  if (model.preview !== null)
    return `<legend>README Preview</legend><pre><code>${text(model.preview)}</code></pre>`;
  return '<legend>README Preview</legend><p class="finder-empty">Select a file to preview it.</p>';
}

export const finderCount = (model: FinderModel): string => `${model.results.length} / ${model.totalCount}`;

export const finderActiveDescendant = (model: FinderModel): string | null =>
  model.results.length > 0 ? `finder-result-${model.selectedIndex}` : null;

export function renderFinder(model: FinderModel): string {
  return (
    `<div class="finder-layout"><fieldset class="finder-results"><legend>Results</legend>` +
    `<div id="finder-result-list" class="finder-list" role="listbox" aria-label="Matching files">` +
    `${renderFinderResults(model)}</div></fieldset>` +
    `<fieldset class="finder-preview">${renderFinderPreview(model)}</fieldset>` +
    `<fieldset class="finder-prompt"><legend>Find Files</legend><div>` +
    `<span aria-hidden="true">${ICON_FIND}</span>` +
    `<input${attr("value", model.query || null)} role="combobox" aria-expanded="true" aria-autocomplete="list"` +
    ` aria-label="Find files" aria-controls="finder-result-list"${attr("aria-activedescendant", finderActiveDescendant(model))}` +
    ` autocomplete="off" spellcheck="false">` +
    `<span class="finder-count" aria-live="polite">${finderCount(model)}</span></div></fieldset></div>` +
    `<div class="finder-footer"><span>↑/↓ select · Enter open · Esc close</span>` +
    `<button type="button" data-finder-action="close" aria-label="Close file search">×</button></div>`
  );
}

// ---------------------------------------------------------------- static pages

export const ERROR_UI =
  `<div id="error-ui" role="alert"><section class="runtime-error" aria-label="Application error"><div class="runtime-error-copy">` +
  `<p class="runtime-error-location"><span class="runtime-error-user">guest@portfolio</span> <span class="runtime-error-path">~</span></p>` +
  `<p class="runtime-error-command"><span class="runtime-error-success">(0)</span> <span aria-hidden="true">→</span> nvim .</p>` +
  `<p class="runtime-error-title">error: The portfolio encountered an unexpected application error.</p>` +
  `<p class="runtime-error-message">Press Enter to run it again. If it keeps happening, try later.</p>` +
  `<p class="runtime-error-location"><span class="runtime-error-user">guest@portfolio</span> <span class="runtime-error-path">~</span></p>` +
  `<div class="runtime-error-actions"><span class="runtime-error-status">(1)</span>` +
  `<span class="runtime-error-arrow" aria-hidden="true">→</span>` +
  `<a href="" class="reload" title="Run again (Enter)">nvim .</a><span class="runtime-error-cursor" aria-hidden="true"></span>` +
  `<button type="button" class="dismiss" title="Hide this message without restarting the app">clear</button>` +
  `</div></div></section></div>`;

export function renderNotFound(requestedPath: string): string {
  const path = text(requestedPath);
  const prompt =
    '<p class="not-found-location"><span class="prompt-user">guest@portfolio</span><span class="prompt-path">~</span></p>';
  return (
    `<main class="not-found" aria-label="Page not found"><section class="not-found-content">${prompt}` +
    `<p class="not-found-command"><span class="prompt-success" aria-label="Previous exit status 0">(0)</span>` +
    `<span class="prompt-arrow" aria-hidden="true">→</span><span>cd <span class="requested-path">${path}</span></span></p>` +
    `<p class="not-found-output">bash: cd: <span class="requested-path">${path}</span>: No such file or directory</p>${prompt}` +
    `<p class="not-found-return"><span class="not-found-exit" aria-label="Page not found: HTTP 404">(404)</span>` +
    `<span class="prompt-arrow" aria-hidden="true">→</span><a href="/" aria-label="nvim . — open the portfolio">nvim .</a></p>` +
    `</section></main>`
  );
}
