import {
  documentFileName,
  findParent,
  getAncestry,
  hasReadme,
  isRoot,
  isStandaloneDocument,
  pickKey,
  rootEntry,
  type ExplorerItem,
  type PortfolioEntry,
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
import { leaderNotation } from "../nvim/key-notation.ts";
import type { NavigationState } from "./navigation-state.ts";
import { documentUrl, siteUrl } from "./routes.ts";
import { fileUrl, repositoryUrl } from "./github-urls.ts";

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
  /** Rendered help file shown in the help window, once loaded. */
  readonly helpHtml?: string | null;
  readonly helpLoading?: boolean;
  readonly helpError?: string | null;
  /** Whether the help tag stack has somewhere to go back to. */
  readonly helpBack?: boolean;
  /** Whether help is the current window, so the tabline actions act on it instead of the README. */
  readonly helpCurrent?: boolean;
  /** Help cursor position and file size for the statusline while help is the current window. */
  readonly helpStatus?: HelpStatus | null;
  /** Visual mode of the current window's cursor: characterwise or linewise. */
  readonly visualMode?: VisualMode | null;
}

export type VisualMode = "char" | "line";

export interface HelpStatus {
  readonly line: number;
  readonly column: number;
  readonly total: number;
  /** All, Top, Bot, or a percentage, like Vim's ruler. */
  readonly position: string;
  readonly bytes: number;
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

export function renderTabline(model: ViewModel): string {
  const { state } = model;
  const title = state.isReading
    ? state.currentDocument && isRoot(state.currentDocument)
      ? "README"
      : (state.currentDocument?.name ?? "")
    : "Explorer";
  // Like Vim, the actions apply to the current window: the README, or help while it is current.
  const help = model.helpCurrent === true;
  const back = !help
    ? 'data-action="back" aria-label="Back" title="Back"'
    : model.helpBack
      ? 'data-action="help-back" aria-label="Back" title="Back (CTRL-T)"'
      : 'data-action="help-back" aria-label="Close help" title="Close help (q)"';
  const find = help
    ? 'data-action="help-search" aria-label="Search help" title="Search this help file (/)"'
    : 'data-action="find" aria-label="Find files" title="Find files (&lt;leader&gt;ff)"';
  const topics = help
    ? 'data-action="help-topics" aria-label="Help topics" title="List of help files"'
    : 'data-action="help" aria-label="Help" title="Help (:help)"';
  return (
    `<button type="button" class="explorer-label" data-action="toggle-explorer" aria-controls="portfolio-explorer"` +
    `${attr("aria-expanded", state.isExplorerOpen ? "true" : "false")} title="Toggle the explorer (&lt;leader&gt;e)">` +
    `<span class="explorer-toggle-icon" aria-hidden="true">${ICON_EXPLORER}</span>` +
    `<span class="explorer-label-text">File Explorer</span>` +
    `<span class="visually-hidden">${state.isExplorerOpen ? "Hide" : "Show"} the file explorer</span></button>` +
    `<div class="active-tab"><span class="tab-icon" aria-hidden="true">${ICON_FILE}</span>` +
    `<span class="tab-title">${text(title)}</span>` +
    `<button type="button" class="tab-close" data-action="close-document" aria-label="Close document">×</button></div>` +
    `<div class="tab-actions"><button type="button" ${back}>` +
    `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 5-7 7 7 7M5 12h14"/></svg></button>` +
    `<button type="button" class="keys-toggle" data-action="toggle-keys" aria-label="Keyboard shortcuts"` +
    `${attr("aria-pressed", state.keyboardEnabled ? "true" : "false")} title="Keyboard shortcuts: ${state.keyboardEnabled ? "on" : "off"} (:set keys / :set nokeys)">` +
    `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>` +
    `${state.keyboardEnabled ? "" : '<path d="m3 3 18 18"/>'}</svg></button>` +
    `<button type="button" data-action="toggle-theme" aria-label="Light mode" aria-pressed="false"` +
    ` title="Toggle light / dark mode">` +
    `<svg class="theme-wave-label" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>` +
    `<svg class="theme-lotus-label" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg></button>` +
    `<button type="button" ${find}>${ICON_FIND}</button>` +
    `<button type="button" ${topics}>?</button></div>`
  );
}

// ---------------------------------------------------------------- explorer

// Documents are real links, so they open in a new tab, copy, and work without JavaScript;
// folders only toggle, so they stay buttons.
export function renderExplorerEntry(item: ExplorerItem, index: number, selected: boolean): string {
  const folder = item.kind === "folder";
  const indent = '<span class="tree-indent" aria-hidden="true"></span>'.repeat(item.depth);
  const chevron = folder ? (item.isExpanded ? "⌄" : "›") : "";
  const icon = folder ? (item.isExpanded ? ICON_FOLDER_OPEN : ICON_FOLDER) : ICON_FILE;
  const name = folder ? `<strong>${text(item.name)}</strong>` : `<span>${text(item.name)}</span>`;
  const link = !folder && item.entry !== null;
  const open = link
    ? `<a class="entry${selected ? " selected" : ""}"${attr("href", documentUrl(item.entry!))}`
    : `<button type="button" class="entry${selected ? " selected" : ""}"`;
  return (
    `${open} data-index="${index}"` +
    `${attr("aria-current", selected ? "true" : null)}` +
    `${attr("aria-expanded", folder ? String(item.isExpanded) : null)}` +
    `${attr("title", item.entry?.description)}>` +
    `${indent}<span class="tree-chevron" aria-hidden="true">${chevron}</span>` +
    `<span class="entry-icon ${folder ? "folder-icon" : "file-icon"}" aria-hidden="true">${icon}</span>` +
    `${name}${link ? "</a>" : "</button>"}`
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

/** Folder that holds a document: a standalone file like `featured.md` lives in its parent. */
export const documentFolder = (entry: PortfolioEntry): PortfolioEntry =>
  isStandaloneDocument(entry) ? (findParent(entry) ?? rootEntry) : entry;

export function renderBreadcrumb(model: ViewModel): string {
  const { state } = model;
  const folder = documentFolder(state.currentFolder);
  let html = `<span aria-hidden="true">${ICON_FOLDER}</span>`;
  for (const entry of getAncestry(folder)) {
    const parent = findParent(entry);
    if (!isRoot(entry)) html += '<span class="crumb-divider">›</span>';
    html +=
      `<span class="crumb" data-pick-segment${attr("data-pick-menu", (parent ?? entry).repository)}` +
      `${attr("data-pick-current", pickKey(entry))}>${text(entry.name)}</span>`;
  }
  if (state.isReading) {
    const repository = folder.repository;
    const current = isStandaloneDocument(state.currentFolder)
      ? pickKey(state.currentFolder)
      : `readme:${repository}`;
    html +=
      `<span class="crumb-divider">›</span><span aria-hidden="true">${ICON_FILE}</span>` +
      `<span class="crumb" data-pick-segment${attr("data-pick-menu", repository)}` +
      `${attr("data-pick-current", current)}>${text(documentFileName(state.currentFolder))}</span>`;
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
  const readme = attr("href", documentUrl(rootEntry));
  const featured = rootEntry.children.find(isStandaloneDocument);
  const featuredHint = (verb: string): string =>
    featured === undefined
      ? ""
      : `<a${attr("href", documentUrl(featured))} data-action="open-featured"><span>${verb} <span class="welcome-key">${text(featured.name)}</span></span><span>for three projects in depth</span></a>`;
  return (
    `<section class="welcome-screen" aria-label="Welcome"><h1>SRAVIO.LI</h1>` +
    `<p>Simone Fidanza<br>.NET dev - C#, ASP.NET, MAUI. I also write Lua, Python, and some C/C++.<br>` +
    `<a href="https://github.com/sravioli">github.com/sravioli</a></p>` +
    `<div class="welcome-hints keyboard-hints">` +
    `<a${readme} data-action="open-readme"><span>open <span class="welcome-key">README.md</span></span><span>to get to know me</span></a>` +
    featuredHint("open") +
    `<button type="button" data-action="focus-explorer"><span>press <span class="welcome-key">j / k</span></span><span>to browse projects with the tree focused</span></button>` +
    `<button type="button" data-action="open-selected"><span>press <span class="welcome-key">Enter</span></span><span>to open the selection</span></button>` +
    `<button type="button" data-action="find"><span>press <span class="welcome-key">${find}</span></span><span>to find a file</span></button>` +
    `<div><span>press <span class="welcome-key">gx</span></span><span>to open the link under the cursor</span></div>` +
    `<button type="button" data-action="help"><span>type <span class="welcome-key">:help<span class="welcome-enter">&lt;Enter&gt;</span></span></span><span>for keyboard help</span></button>` +
    `</div><div class="welcome-hints touch-hints">` +
    `<a${readme} data-action="open-readme"><span>read <span class="welcome-key">README.md</span></span><span>to get to know me</span></a>` +
    featuredHint("read") +
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
  if (state.isReading && model.loadError !== null) {
    const file = text(documentFileName(state.currentDocument ?? state.currentFolder));
    return (
      `<div class="readme-load-error"><p class="readme-error-title" role="alert">E484: Can't open file ${file}</p>` +
      `<p class="readme-error-actions"><button type="button" data-action="retry" aria-label=":e — retry opening ${file}">:e</button>` +
      `<span>Retry opening the file</span></p>` +
      `<details><summary>Error details</summary><p>${text(model.loadError)}</p></details></div>`
    );
  }
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

/** The mode block of a window: COMMAND, VISUAL, V-LINE, or the window's own Normal-mode name. */
function windowMode(model: ViewModel, normal: string, short: string): string {
  if (model.state.isCommandMode) return modeBlock("COMMAND", "C");
  if (model.visualMode === "char") return modeBlock("VISUAL", "V");
  if (model.visualMode === "line") return modeBlock("V-LINE", "V-L");
  return modeBlock(normal, short);
}

const pathParts = (path: SplitPath): string =>
  `<span class="cwd-head">${text(path.head)}</span><span class="cwd-tail">${text(path.tail)}</span>`;

function cwdSegment(model: ViewModel): string {
  const paths = statusPaths(documentFolder(model.state.currentFolder));
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
  const kind = model.finderOpen
    ? "explorer-status"
    : model.helpCurrent
      ? "reading-status help-status"
      : state.isReading || state.isCommandMode
        ? "reading-status"
        : "explorer-status";
  const mode = model.finderOpen
    ? "insert-status"
    : state.isCommandMode
      ? "command-status"
      : model.visualMode && (state.isReading || model.helpCurrent)
        ? "visual-status"
        : "";
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
  if (model.helpCurrent) return renderHelpStatusline(model);
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
      `<div class="status-left">${windowMode(model, "NORMAL", "N")}` +
      `<span class="power-arrow blue-arrow" aria-hidden="true"></span>${cwdSegment(model)}` +
      `<span class="power-arrow surface-arrow" aria-hidden="true"></span>` +
      `<span class="file-segment"><span aria-hidden="true">${ICON_FILE}</span> ${text(documentFileName(state.currentDocument ?? state.currentFolder))}</span>` +
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

/** Vim's help statusline: mode, the help file name, then its size and the cursor position. */
function renderHelpStatusline(model: ViewModel): string {
  const { state } = model;
  const status = model.helpStatus ?? { line: 1, column: 1, total: 1, position: "Top", bytes: 0 };
  const position = `${pad(status.line, 3)}/${pad(status.total, 3)}:${pad(status.column, 2)} `;
  return (
    `<div class="status-left">${windowMode(model, "HELP", "H")}` +
    `<span class="power-arrow raised-arrow" aria-hidden="true"></span>` +
    `<span class="file-segment"><span aria-hidden="true">${ICON_FILE}</span> ${text(`${state.helpPage}.txt`)}</span>` +
    `<span class="power-arrow file-arrow" aria-hidden="true"></span></div>` +
    `<div class="status-right"><span class="byte-size">${formatFileSize(status.bytes)} <span aria-hidden="true">${ICON_SIZE}</span></span>` +
    `<span class="filetype">HELP</span>` +
    `<span class="position-block"><span class="status-full">${position}</span>${text(status.position)} ` +
    `${thumb(scrollFraction(status.position))}</span></div>`
  );
}

// ---------------------------------------------------------------- command line

export const showCommandMessage = ({ state }: ViewModel): boolean =>
  !state.isCommandMode && !!state.message;

/** Marks a command-line message as flash's jump prompt; it renders as a lightning-bolt icon. */
export const FLASH_PROMPT = "\u26a1";
const ICON_FLASH =
  `<svg class="flash-prompt-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">` +
  `<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg><span class="visually-hidden">Flash: </span>`;

function commandMessage(message: string): string {
  return message.startsWith(FLASH_PROMPT)
    ? ICON_FLASH + text(message.slice(FLASH_PROMPT.length))
    : text(message);
}

export function renderCommandLine(model: ViewModel): string {
  const { state } = model;
  const message = showCommandMessage(model) ? commandMessage(state.message!) : "";
  return (
    `<label for="command-input" class="visually-hidden">Command</label><div class="command-field">` +
    `<input id="command-input"${attr("value", state.commandText || null)}` +
    `${attr("placeholder", showCommandMessage(model) ? "" : "Type a command…")} autocomplete="off" spellcheck="false">` +
    `<output class="command-message${state.isErrorMessage ? " is-error" : ""}" for="command-input" aria-live="polite" aria-atomic="true">` +
    `${message}</output></div>`
  );
}

// ---------------------------------------------------------------- help

/** Help window statusline: the file name, like Vim's help statusline, and a close button. */
export function renderHelpBar(model: ViewModel): string {
  const { state } = model;
  return (
    `<span class="help-file" id="help-file">${text(`${state.helpPage}.txt`)} <span class="help-flags">[Help][RO]</span></span>` +
    `<a class="help-close"${attr("href", siteUrl(""))} data-action="close-help" title="Close help (q)" aria-label="Close help">×</a>`
  );
}

/** Help window body: the rendered help file, or its loading and error states. */
export function renderHelpContent(model: ViewModel): string {
  if (model.helpError)
    return (
      `<div class="help-error" role="alert"><p>${text(model.helpError)}</p>` +
      `<button type="button" data-action="help-retry">Retry</button></div>`
    );
  if (model.helpLoading || !model.helpHtml) return '<p class="help-loading" role="status">Loading help…</p>';
  return `${model.helpHtml}<div class="nvim-cursor" aria-hidden="true"></div>`;
}

// ---------------------------------------------------------------- document actions

/** Where the current document lives on GitHub: its repository, or this site's source for local pages. */
export function githubUrl(entry: PortfolioEntry): string {
  const profile = repositoryUrl("").replace(/\/$/, "");
  if (isRoot(entry)) return profile;
  if (isStandaloneDocument(entry)) return fileUrl(SITE_REPOSITORY, `src/documents/${entry.name}`);
  if (entry.isReadmeLocal && entry.children.length > 0)
    return `${profile}?tab=repositories&q=${encodeURIComponent(".wz")}`;
  return repositoryUrl(entry.repository);
}

const SITE_REPOSITORY = "portfolio";

export interface OutlineItem {
  readonly id: string;
  readonly title: string;
  readonly level: number;
}

const OUTLINE_HEADING = /<h([1-3])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;

let outlineCache: { html: string; items: OutlineItem[] } | null = null;

/** Top three heading levels of the rendered document; titles stay HTML-escaped. */
export function documentOutline(html: string | null): OutlineItem[] {
  if (html === null) return [];
  if (outlineCache?.html === html) return outlineCache.items;
  const items = [...html.matchAll(OUTLINE_HEADING)]
    .map(([, level, id, inner]) => ({
      id,
      level: Number(level),
      title: inner.replace(/<[^>]*>/g, "").trim(),
    }))
    .filter((item) => item.title.length > 0);
  outlineCache = { html, items };
  return items;
}

/** Touch and narrow-screen actions for the open document; hidden on wide pointer layouts by CSS. */
export function renderDocumentActions(model: ViewModel): string {
  const { state } = model;
  const entry = state.currentDocument;
  if (!state.isReading || entry === null) return "";
  const outline = !state.isRawView && documentLoaded(model) && documentOutline(model.documentHtml).length > 0;
  return (
    `<button type="button" data-action="outline" aria-haspopup="dialog"${outline ? "" : " disabled"}>` +
    `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 6h16M8 12h12M8 18h12"/></svg>Outline</button>` +
    `<a${attr("href", githubUrl(entry))} target="_blank" rel="noopener noreferrer">` +
    `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>` +
    `Open on GitHub<span class="visually-hidden"> (opens in a new tab)</span></a>` +
    `<button type="button" data-action="copy-link">` +
    `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>` +
    `Copy link</button>`
  );
}

/** Contents of the outline dialog; the dialog element itself is static. */
export function renderOutline(model: ViewModel): string {
  const items = documentOutline(model.documentHtml);
  const list = items
    .map(
      (item) =>
        `<li class="outline-level-${item.level}"><a href="#${text(item.id)}"${attr("data-readme-heading", item.id)}>${item.title}</a></li>`,
    )
    .join("");
  return (
    `<div class="outline-heading"><h2 id="outline-title">Outline</h2>` +
    `<button type="button" data-action="close-outline" aria-label="Close outline">×</button></div>` +
    `<nav aria-labelledby="outline-title"><ol class="outline-list">${list}</ol></nav>`
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
    `<div class="portfolio-shell" data-reading="${state.isReading}" data-explorer="${model.explorer}" data-help="${state.isHelpOpen ? "open" : "closed"}">` +
    `<header class="tabline">${renderTabline(model)}</header>` +
    `<div class="workspace"><div class="explorer-backdrop" aria-hidden="true" data-action="close-explorer"></div>` +
    `<aside id="portfolio-explorer" class="explorer" aria-label="File Explorer">` +
    `<div class="explorer-path">/home/${text(rootEntry.name)}/</div>` +
    `<nav class="entry-list" aria-label="Project files">${renderExplorerEntries(model)}</nav></aside>` +
    `<main id="portfolio-main" class="preview-area">` +
    `<div class="breadcrumb" aria-label="Current location">${renderBreadcrumb(model)}</div>` +
    `<div class="document-actions" role="toolbar" aria-label="Document actions">${renderDocumentActions(model)}</div>` +
    `<div class="open-error">${renderOpenError(model.openError)}</div>` +
    `<section class="preview-scroll" data-welcome="${state.isWelcome}" tabindex="0">${renderPreview(model)}</section>` +
    `</main>` +
    `<aside class="help-pane" aria-labelledby="help-file"${state.isHelpOpen ? "" : " hidden"}>` +
    `<div class="help-bar">${renderHelpBar(model)}</div>` +
    `<section class="help-scroll" tabindex="0" aria-label="Help text">${state.isHelpOpen ? renderHelpContent(model) : ""}</section>` +
    `</aside></div>` +
    `<footer class="${statuslineClass(model)}">${SEARCH_POSITION}${renderStatusline(model)}</footer>` +
    `<form class="command-line">${renderCommandLine(model)}</form></div>` +
    `<dialog class="outline-dialog" aria-labelledby="outline-title">${renderOutline(model)}</dialog>`
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
    `<span class="prompt-arrow" aria-hidden="true">→</span><a href="${text(siteUrl(""))}" aria-label="nvim . — open the portfolio">nvim .</a></p>` +
    `</section></main>`
  );
}
