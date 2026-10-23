import { documentFileName, getPickMenu, type PortfolioEntry } from "../lib/catalog.ts";
import { CommandHistory } from "../nvim/command-history.ts";
import { handleCommand } from "../nvim/commands.ts";
import { copiedLineCount } from "../lib/format.ts";
import { KeymapHandler, type KeyAction } from "../nvim/keymap.ts";
import { NavigationState } from "../lib/navigation-state.ts";
import {
  documentKey,
  documentUrl,
  entryFromPath,
  fragmentUrl,
  HELP_INDEX_PAGE,
  helpAnchor,
  helpFragmentUrl,
  helpPageFromPath,
  helpPageUrl,
  helpTagFromHash,
  helpTagUrl,
  pageTitle,
  rawUrl,
  siteUrl,
  SITE_TITLE,
} from "../lib/routes.ts";
import { resolveHelpTag, type HelpTags } from "../lib/help.ts";
import * as view from "../lib/view.ts";
import { Region } from "./dom.ts";
import { openFinder, type Finder } from "./finder.ts";
import { syncThemeToggle, toggleTheme } from "./theme.ts";
import * as home from "./home.js";

type DocumentMetrics = Record<string, [bytes: number, lines: number]>;

const { EXPLORER_STORAGE_KEY } = view;
const OPEN_ERROR_DURATION_MS = 2000;

const CURSOR_MOTIONS: Partial<Record<KeyAction, string>> = {
  ScrollUp: "up",
  ScrollDown: "down",
  ScrollTop: "top",
  ScrollBottom: "bottom",
  HalfPageUp: "halfUp",
  HalfPageDown: "halfDown",
  CursorLeft: "left",
  CursorRight: "right",
  WordForward: "wordForward",
  WordBackward: "wordBackward",
  WordEnd: "wordEnd",
  LineStart: "lineStart",
  LineEnd: "lineEnd",
};

const EXPLORER_REFOCUS_KEYS = new Set(["j", "k", "ArrowDown", "ArrowUp", "g", "G"]);

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing element: ${selector}`);
  return element;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `Response status code does not indicate success: ${response.status} (${response.statusText || "Error"}).`,
    );
  return response.text();
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies to this visit.
  }
}

const whenIdle = (callback: () => void): void => {
  if ("requestIdleCallback" in window) requestIdleCallback(callback, { timeout: 2000 });
  else setTimeout(callback, 200);
};

/** Client controller: owns the navigation state and patches the server-rendered shell as it changes. */
export function start(): void {
  const state = new NavigationState();
  const keymap = new KeymapHandler();
  const commandHistory = new CommandHistory();
  const metrics = JSON.parse(required(document, "#portfolio-data").textContent ?? "{}") as DocumentMetrics;
  const fragments = new Map<string, string>();
  const sources = new Map<string, string>();

  const shell = required<HTMLElement>(document, ".portfolio-shell");
  const tabline = new Region(required(shell, ".tabline"));
  const entryList = required<HTMLElement>(shell, ".entry-list");
  const explorer = new Region(entryList);
  const breadcrumb = new Region(required(shell, ".breadcrumb"));
  const openErrorHost = new Region(required(shell, ".open-error"));
  const preview = required<HTMLElement>(shell, ".preview-scroll");
  const statusline = required<HTMLElement>(shell, ".statusline");
  const status = new Region(statusline);
  const commandForm = required<HTMLFormElement>(shell, ".command-line");
  const commandLine = new Region(commandForm);
  const helpPane = required<HTMLElement>(shell, ".help-pane");
  const helpBar = new Region(required(helpPane, ".help-bar"));
  const helpScroll = required<HTMLElement>(helpPane, ".help-scroll");
  const documentActions = new Region(required(shell, ".document-actions"));
  const outlineDialog = required<HTMLDialogElement>(document, ".outline-dialog");
  const outline = new Region(outlineDialog);
  let outlineOpen = false;

  let loading = false;
  let loadError: string | null = null;
  let loadToken = 0;
  let documentHtml: string | null = null;
  let documentSource: string | null = null;
  let documentBytes = 0;
  let totalLines = 1;
  let positionLine = 1;
  let positionColumn = 1;
  let scrollPosition = "All";
  let headings: readonly view.HeadingBreadcrumb[] = [];
  let openError: string | null = null;
  let openErrorTimer = 0;
  let finder: Finder | null = null;

  let explorerReady = false;
  let narrowLayout = false;
  let desktopExplorerOpen = true;
  let syncedExplorerOpen = true;

  let previewKey = "";
  let previewDocument: string | null = null;

  const helpFragments = new Map<string, string>();
  let helpHtml: string | null = null;
  let helpLoading = false;
  let helpError: string | null = null;
  /** Markup inside the help window; search highlights change the DOM, so it is only replaced when this changes. */
  let renderedHelp = "";
  /** Help location on screen, and the earlier ones `CTRL-T` returns to, like Vim's tag stack. */
  let helpShown: { page: string; tag: string } | null = null;
  const helpStack: { page: string; tag: string; scroll: number }[] = [];
  let previewScrollBeforeHelp = 0;
  /** Whether a command typed from the help window returns focus there. */
  let commandFromHelp = false;
  /** Whether the help window was focused last on a wide screen, making it the current window. */
  let helpFocused = false;
  let helpStatus: view.HelpStatus | null = null;
  let helpStatusPage = "";
  /** Visual mode of the README or help cursor, for the statusline mode block. */
  let visualMode: view.VisualMode | null = null;
  let visualInHelp = false;

  const model = (): view.ViewModel => ({
    state,
    explorer: !explorerReady ? "pending" : state.isExplorerOpen ? "open" : "closed",
    finderOpen: finder !== null,
    loading,
    loadError,
    documentHtml,
    documentSource,
    documentBytes,
    totalLines,
    positionLine,
    positionColumn,
    scrollPosition,
    headings,
    openError,
    helpHtml,
    helpLoading,
    helpError,
    helpBack: helpStack.length > 0,
    helpCurrent: state.isHelpOpen && (narrowLayout || helpFocused),
    helpStatus: helpStatusPage === state.helpPage ? helpStatus : null,
    visualMode: visualInHelp === (state.isHelpOpen && (narrowLayout || helpFocused)) ? visualMode : null,
  });

  // ------------------------------------------------------------ rendering

  function render(): void {
    const current = model();
    syncHistory();
    shell.dataset.reading = String(state.isReading);
    shell.dataset.explorer = current.explorer;
    tabline.update(view.renderTabline(current));
    syncThemeToggle();
    explorer.update(view.renderExplorerEntries(current));
    breadcrumb.update(view.renderBreadcrumb(current));
    documentActions.update(view.renderDocumentActions(current));
    openErrorHost.update(view.renderOpenError(openError));
    renderPreview(current);
    statusline.className = view.statuslineClass(current);
    status.update(view.SEARCH_POSITION + view.renderStatusline(current));
    commandLine.update(view.renderCommandLine(current));
    const input = commandInput();
    if (input.value !== state.commandText) input.value = state.commandText;
    renderHelp(current);
    syncExplorer();
    if (outlineOpen && (!view.documentLoaded(current) || state.isRawView)) outlineOpen = false;
    outline.update(view.renderOutline(current));
    if (outlineDialog.open !== outlineOpen) {
      if (outlineOpen) outlineDialog.showModal();
      else outlineDialog.close();
    }
  }

  function renderPreview(current: view.ViewModel): void {
    const key = view.previewKey(current);
    if (key === previewKey) return;
    previewKey = key;
    preview.dataset.welcome = String(state.isWelcome);
    preview.innerHTML = view.renderPreview(current);
    const loaded = view.documentLoaded(current);
    const shown = loaded ? (state.currentDocument?.repository ?? null) : null;
    if (shown !== previewDocument) preview.scrollTop = 0;
    previewDocument = shown;
    if (!loaded) return;
    home.refreshPreview();
    if (state.searchQuery.length > 0) home.searchReadme(state.searchQuery);
  }

  function renderHelp(current: view.ViewModel): void {
    const open = state.isHelpOpen;
    if (open !== (shell.dataset.help === "open")) {
      // On a narrow screen the help window covers the README, which keeps its place underneath.
      if (open) previewScrollBeforeHelp = preview.scrollTop;
      shell.dataset.help = open ? "open" : "closed";
      helpPane.hidden = !open;
      if (!open) {
        preview.scrollTop = previewScrollBeforeHelp;
        helpShown = null;
        helpStack.length = 0;
        home.clearHelpSearch();
      }
    }
    helpBar.update(view.renderHelpBar(current));
    const content = open ? view.renderHelpContent(current) : "";
    if (content !== renderedHelp) {
      home.clearHelpSearch();
      helpScroll.innerHTML = content;
      renderedHelp = content;
    }
  }

  const commandInput = (): HTMLInputElement => required<HTMLInputElement>(commandForm, "#command-input");

  // ------------------------------------------------------------ history

  let applyingHistory = false;

  function syncHistory(): void {
    if (applyingHistory) return;
    if (state.isHelpOpen) {
      syncHelpHistory();
      return;
    }
    const target = state.isReading ? state.currentDocument : undefined;
    if (target === null || (helpPageFromPath(location.pathname) === null && entryFromPath(location.pathname) === target))
      return;
    const url = target === undefined ? siteUrl("") : documentUrl(target);
    if (home.consumeDrawerEntry()) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    document.title = pageTitle(target);
  }

  const helpFileTag = (page: string): string => `${page}.txt`;

  function syncHelpHistory(): void {
    const page = state.helpPage;
    const tag = state.helpTag ?? helpFileTag(page);
    const hashTag = tag === helpFileTag(page) ? null : tag;
    if (helpPageFromPath(location.pathname) === page && helpTagFromHash(location.hash) === hashTag) return;
    history.pushState(null, "", hashTag === null ? helpPageUrl(page) : helpTagUrl(page, hashTag));
    document.title = `${helpFileTag(page)} | ${SITE_TITLE}`;
  }

  /** Opens the help location a history entry names; returns whether it was a help page. */
  function applyHelpLocation(): boolean {
    const page = helpPageFromPath(location.pathname);
    if (page === null) return false;
    const hashTag = helpTagFromHash(location.hash);
    state.openHelp(hashTag !== null && state.helpTags[hashTag] === page ? hashTag : helpFileTag(page));
    document.title = `${helpFileTag(page)} | ${SITE_TITLE}`;
    return true;
  }

  function onPopState(event: PopStateEvent): void {
    if ((event.state as { portfolioDrawer?: boolean } | null)?.portfolioDrawer) return;
    applyingHistory = true;
    try {
      if (applyHelpLocation()) {
        const top = helpStack.at(-1);
        if (top !== undefined && top.page === state.helpPage && top.tag === state.helpTag) helpStack.pop();
        void showHelp({ push: false, scroll: top?.tag === state.helpTag ? top.scroll : undefined });
        return;
      }
      const leavingHelp = state.isHelpOpen;
      if (leavingHelp) state.closeHelp();
      const target = entryFromPath(location.pathname);
      if (target === null) {
        location.reload();
        return;
      }
      const showing = state.isReading ? state.currentDocument : state.isWelcome ? undefined : null;
      if (target === showing) {
        if (leavingHelp) render();
        return;
      }
      document.title = pageTitle(target);
      if (target === undefined) {
        closeDocument(false);
        render();
      } else {
        void openRepository(target.repository);
      }
    } finally {
      applyingHistory = false;
    }
  }

  // ------------------------------------------------------------ help

  async function loadHelpPage(): Promise<boolean> {
    const page = state.helpPage;
    helpError = null;
    helpHtml = helpFragments.get(page) ?? null;
    if (helpHtml === null) {
      helpLoading = true;
      render();
      try {
        const html = await fetchText(helpFragmentUrl(page));
        helpFragments.set(page, html);
        if (!state.isHelpOpen || state.helpPage !== page) return false;
        helpHtml = html;
      } catch (error) {
        if (!state.isHelpOpen || state.helpPage !== page) return false;
        helpError = `E149: Sorry, no help for ${helpFileTag(page)}: ${errorMessage(error)}`;
      }
      helpLoading = false;
    }
    render();
    return helpHtml !== null;
  }

  /** Scrolls the help window to `tag`, or to `scroll` when returning to an earlier place. */
  function positionHelp(tag: string, scroll?: number): void {
    home.refreshHelpCursor();
    for (const marked of helpScroll.querySelectorAll(".help-target")) marked.classList.remove("help-target");
    const target = tag === helpFileTag(state.helpPage) ? null : document.getElementById(helpAnchor(tag));
    if (target !== null && helpScroll.contains(target)) target.classList.add("help-target");
    if (scroll !== undefined) helpScroll.scrollTop = scroll;
    else if (target !== null && helpScroll.contains(target))
      helpScroll.scrollTop +=
        target.getBoundingClientRect().top - helpScroll.getBoundingClientRect().top - 8;
    else helpScroll.scrollTop = 0;
    home.placeHelpCursor(scroll === undefined ? target : null);
  }

  /**
   * Shows the help location in the state. `push` remembers the place being left for `CTRL-T`;
   * `scroll` restores a remembered scroll position.
   */
  async function showHelp(options: { push: boolean; scroll?: number }): Promise<void> {
    const page = state.helpPage;
    const tag = state.helpTag ?? helpFileTag(page);
    if (options.push && helpShown !== null && (helpShown.page !== page || helpShown.tag !== tag))
      helpStack.push({ ...helpShown, scroll: helpScroll.scrollTop });
    helpShown = { page, tag };
    if (narrowLayout) state.isExplorerOpen = false;
    if (!(await loadHelpPage()) || state.helpPage !== page) return;
    positionHelp(tag, options.scroll);
    helpScroll.focus({ preventScroll: true });
  }

  function openHelpTag(tag: string): Promise<void> {
    state.openHelp(tag);
    return showHelp({ push: true });
  }

  async function helpBack(): Promise<void> {
    const entry = helpStack.pop();
    if (entry === undefined) {
      state.showError("E73: Tag stack empty");
      render();
      return;
    }
    state.openHelp(entry.tag);
    await showHelp({ push: false, scroll: entry.scroll });
  }

  function closeHelp(): void {
    state.closeHelp();
    render();
    home.focusPreview();
  }

  function beginHelpSearch(): void {
    state.beginSearch("help");
    render();
    focusCommandLine();
  }

  function focusCommandLine(): void {
    commandFromHelp = document.activeElement !== null && helpPane.contains(document.activeElement);
    home.focusCommand();
    home.setCommandCaretToEnd();
  }

  function searchHelp(): void {
    const query = state.helpSearchQuery;
    const matches = home.searchHelp(query);
    if (matches === 0) state.showError(`E486: Pattern not found: ${query}`);
    else state.message = `/${query} [1/${matches}]`;
    render();
  }

  function moveHelpMatch(direction: number): void {
    const query = state.helpSearchQuery;
    if (query.length === 0) {
      state.showError("E35: No previous regular expression");
      render();
      return;
    }
    let { index, count } = home.moveHelpMatch(direction);
    // The page was replaced since the search: search it again.
    if (count === 0 && home.searchHelp(query) > 0) ({ index, count } = home.moveHelpMatch(direction === 1 ? 0 : -1));
    if (count === 0) state.showError(`E486: Pattern not found: ${query}`);
    else state.message = `/${query} [${index}/${count}]`;
    render();
  }

  async function onHelpKey(action: string): Promise<void> {
    switch (action) {
      case "close":
        closeHelp();
        return;
      case "search":
        beginHelpSearch();
        return;
      case "back":
        await helpBack();
        return;
      case "next-match":
        moveHelpMatch(1);
        return;
      case "previous-match":
        moveHelpMatch(-1);
        return;
      case "no-identifier":
        state.showError("E349: No identifier under cursor");
        render();
        return;
      case "leave":
        if (!narrowLayout) home.focusPreview();
        return;
    }
  }

  // Focus after a command or Esc in the command line: the help window when the command came from it.
  function focusAfterCommand(): void {
    if (state.isHelpOpen && (commandFromHelp || narrowLayout)) helpScroll.focus({ preventScroll: true });
    else home.focusPreview();
  }

  // ------------------------------------------------------------ explorer

  function initializeExplorer(): void {
    narrowLayout = home.initializeLayout();
    desktopExplorerOpen = readStorage(EXPLORER_STORAGE_KEY) !== "closed";
    state.isExplorerOpen = !narrowLayout && desktopExplorerOpen;
    syncedExplorerOpen = state.isExplorerOpen;
    explorerReady = true;
  }

  function syncExplorer(): void {
    if (!explorerReady || syncedExplorerOpen === state.isExplorerOpen) return;
    syncedExplorerOpen = state.isExplorerOpen;
    if (narrowLayout) {
      home.setDrawerOpen(state.isExplorerOpen);
      return;
    }
    desktopExplorerOpen = state.isExplorerOpen;
    writeStorage(EXPLORER_STORAGE_KEY, state.isExplorerOpen ? "open" : "closed");
  }

  function onLayoutChanged(narrow: boolean): void {
    narrowLayout = narrow;
    state.isExplorerOpen = !narrow && desktopExplorerOpen;
    syncedExplorerOpen = state.isExplorerOpen;
    render();
  }

  function onDrawerDismissed(): void {
    state.isExplorerOpen = false;
    syncedExplorerOpen = false;
    render();
  }

  const focusExplorer = (): void => home.focusExplorer(entryList);

  // ------------------------------------------------------------ documents

  async function getFragment(entry: PortfolioEntry): Promise<string> {
    const key = documentKey(entry);
    let html = fragments.get(key);
    if (html === undefined) {
      html = await fetchText(fragmentUrl(entry));
      fragments.set(key, html);
    }
    return html;
  }

  async function getSource(entry: PortfolioEntry): Promise<string> {
    const key = documentKey(entry);
    let source = sources.get(key);
    if (source === undefined) {
      source = await fetchText(rawUrl(entry));
      sources.set(key, source);
    }
    return source;
  }

  // The raw source is only needed for the raw view and copying, so it is fetched once the page is idle.
  function prefetchSource(entry: PortfolioEntry): void {
    whenIdle(() => {
      getSource(entry).then(
        (source) => {
          if (state.currentDocument === entry && documentSource === null) documentSource = source;
        },
        () => {},
      );
    });
  }

  function cancelReadmeLoad(): void {
    loadToken++;
    loading = false;
  }

  function clearDocumentContent(): void {
    documentHtml = null;
    documentSource = null;
  }

  async function loadReadme(entry: PortfolioEntry): Promise<void> {
    const token = ++loadToken;
    state.searchQuery = "";
    home.clearReadmeSearch();
    syncHistory();
    if (narrowLayout) state.isExplorerOpen = false;

    const key = documentKey(entry);
    const [bytes, lines] = metrics[key] ?? [0, 1];
    loadError = null;
    headings = [];
    documentBytes = bytes;
    totalLines = Math.max(1, lines);
    positionLine = 1;
    scrollPosition = "All";
    documentHtml = fragments.get(key) ?? null;
    documentSource = sources.get(key) ?? null;
    const ready = documentHtml !== null && (!state.isRawView || documentSource !== null);
    loading = !ready;
    render();
    if (!ready) {
      try {
        const [html, source] = await Promise.all([
          getFragment(entry),
          state.isRawView ? getSource(entry) : Promise.resolve(documentSource),
        ]);
        if (token !== loadToken || state.currentDocument !== entry) return;
        documentHtml = html;
        documentSource = source;
      } catch (error) {
        if (token !== loadToken) return;
        loadError = errorMessage(error);
      }
      loading = false;
      render();
    }
    if (documentSource === null) prefetchSource(entry);
  }

  async function ensureSource(): Promise<string | null> {
    const entry = state.currentDocument;
    if (entry === null) return null;
    if (documentSource !== null) return documentSource;
    try {
      const source = await getSource(entry);
      if (state.currentDocument === entry) documentSource = source;
      return source;
    } catch (error) {
      if (state.currentDocument === entry) state.showError(`E484: Can't open file ${documentFileName(entry)}: ${errorMessage(error)}`);
      return null;
    }
  }

  async function showRawView(): Promise<void> {
    if (!state.isRawView || documentSource !== null || loadError !== null) return;
    const token = ++loadToken;
    loading = true;
    render();
    const source = await ensureSource();
    if (token !== loadToken) return;
    loading = false;
    if (source === null) state.isRawView = false;
    render();
  }

  const retryReadme = (): Promise<void> =>
    state.currentDocument === null ? Promise.resolve() : loadReadme(state.currentDocument);

  async function openRepository(repository: string): Promise<void> {
    cancelReadmeLoad();
    state.navigateTo(repository);
    if (state.currentDocument !== null) await loadReadme(state.currentDocument);
    else {
      clearDocumentContent();
      render();
    }
  }

  async function openSelected(): Promise<void> {
    const document = state.openSelected();
    if (document !== null) await loadReadme(document);
    else render();
  }

  function goParent(): void {
    cancelReadmeLoad();
    state.goToParent();
    clearDocumentContent();
    loadError = null;
    render();
  }

  function closeDocument(focus = true): void {
    cancelReadmeLoad();
    state.closeDocument();
    clearDocumentContent();
    loadError = null;
    headings = [];
    positionLine = 1;
    totalLines = 1;
    scrollPosition = "All";
    render();
    if (focus) focusExplorer();
  }

  async function copyDocument(): Promise<void> {
    const source = await ensureSource();
    if (source === null) return;
    if (await home.copyText(source)) state.message = `${copiedLineCount(source)} lines yanked into "+`;
    else state.showError('clipboard: Browser denied access. See ":h clipboard-errors".');
    render();
  }

  function onVisualMode(kind: view.VisualMode | null, inHelp: boolean): void {
    if (visualMode === kind && visualInHelp === inHelp) return;
    visualMode = kind;
    visualInHelp = inHelp;
    render();
  }

  // Vim reports a yank only when it spans more lines than 'report' (2).
  function onYank(lines: number, copied: boolean): void {
    if (!copied) state.showError('clipboard: Browser denied access. See ":h clipboard-errors".');
    else if (lines > 2) state.message = `${lines} lines yanked into "+`;
    else return;
    render();
  }

  // flash.nvim shows the typed pattern after a lightning bolt while a jump is active.
  function onFlashPrompt(text: string | null): void {
    if (text !== null) state.message = `${view.FLASH_PROMPT}${text}`;
    else if (state.message?.startsWith(view.FLASH_PROMPT)) state.message = "";
    else return;
    render();
  }

  async function copyLink(): Promise<void> {
    const entry = state.currentDocument;
    if (entry === null) return;
    const url = new URL(documentUrl(entry), location.href).href;
    if (await home.copyText(url)) state.message = `Copied link: ${url}`;
    else state.showError('clipboard: Browser denied access. See ":h clipboard-errors".');
    render();
  }

  // Jumping to a heading moves focus to the document itself; otherwise it returns to the Outline button.
  function closeOutline(restoreFocus = true): void {
    outlineOpen = false;
    render();
    if (restoreFocus) documentActions.element.querySelector<HTMLElement>('[data-action="outline"]')?.focus();
  }

  function showOpenError(message: string): void {
    clearTimeout(openErrorTimer);
    openError = message;
    openErrorTimer = window.setTimeout(() => {
      openError = null;
      render();
    }, OPEN_ERROR_DURATION_MS);
    render();
  }

  function dismissOpenError(): void {
    clearTimeout(openErrorTimer);
    openError = null;
    render();
  }

  function toggleKeyboard(): void {
    state.setKeyboardEnabled(!state.keyboardEnabled);
    home.setKeyboardEnabled(state.keyboardEnabled);
    render();
  }

  function showFinder(): void {
    if (finder !== null) return;
    finder = openFinder({
      loadSource: getSource,
      onOpen: (entry) => {
        finder = null;
        void openRepository(entry.repository).then(() => home.focusPreview());
      },
      onClose: () => {
        finder = null;
        render();
      },
    });
    render();
  }

  // ------------------------------------------------------------ keyboard

  async function onKeyDown(key: string, explorerFocused: boolean): Promise<boolean> {
    const action = keymap.handle(state, key, explorerFocused);
    const motion = CURSOR_MOTIONS[action];
    if (motion !== undefined) {
      home.moveCursor(motion);
      return true;
    }
    switch (action) {
      case "OpenFileFinder":
        showFinder();
        break;
      case "FocusExplorer":
        render();
        focusExplorer();
        break;
      case "CloseExplorer":
        render();
        home.focusPreview();
        return true;
      case "OpenSelected":
        if (state.isReading && state.currentDocument !== null) await loadReadme(state.currentDocument);
        else {
          cancelReadmeLoad();
          clearDocumentContent();
        }
        break;
      case "FollowLink":
      case "OpenLink":
        if (!home.followLink(action === "OpenLink")) showOpenError("No URL found under cursor");
        return true;
      case "JumpBack":
        home.jump(-1);
        return true;
      case "JumpForward":
        home.jump(1);
        return true;
      case "NextSearchMatch":
      case "PreviousSearchMatch":
        home.moveSearchMatch(action === "NextSearchMatch" ? 1 : -1);
        return true;
      case "NextHeading":
        home.jumpHeading(1);
        break;
      case "PreviousHeading":
        home.jumpHeading(-1);
        break;
      case "FocusPreview":
        home.focusPreview();
        return true;
      case "CloseDocument":
        closeDocument();
        return true;
      case "CopyDocument":
        await copyDocument();
        break;
      case "FocusCommand":
        render();
        focusCommandLine();
        return true;
      case "OpenHelp":
        await showHelp({ push: true });
        return true;
      case "Changed":
        if (!state.isReading) cancelReadmeLoad();
        else if (key === "p") void showRawView();
        break;
    }

    if (action === "Ignored") return false;
    render();
    if (explorerFocused && action === "Changed" && EXPLORER_REFOCUS_KEYS.has(key)) focusExplorer();
    else if (action === "OpenSelected" && state.isReading) home.focusPreview();
    return true;
  }

  // ------------------------------------------------------------ command line

  function beginCommandFromInput(event: FocusEvent): void {
    if (state.isCommandMode) return;
    // Clicked or tapped into; keys that open the command line record their origin in focusCommandLine.
    commandFromHelp = event.relatedTarget instanceof Node && helpPane.contains(event.relatedTarget);
    state.beginCommand();
    commandHistory.reset();
    render();
  }

  function endCommandFromInput(): void {
    if (state.isCommandMode) state.endCommand();
    commandHistory.reset();
    render();
  }

  function handleCommandKey(event: KeyboardEvent): void {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      state.commandText =
        event.key === "ArrowUp"
          ? commandHistory.previous(state.commandText)
          : commandHistory.next(state.commandText);
      render();
      home.setCommandCaretToEnd();
    } else if (event.key === "Escape") {
      state.endCommand();
      commandHistory.reset();
      render();
      focusAfterCommand();
    }
  }

  async function submitCommand(): Promise<void> {
    const commandText = state.commandText;
    commandHistory.add(commandText);
    const action = handleCommand(state, commandText);
    if (action === "OpenReadme" && state.currentDocument !== null) {
      await loadReadme(state.currentDocument);
      state.isExplorerOpen = true;
    }
    if (action === "SetKeyboard") home.setKeyboardEnabled(state.keyboardEnabled);
    render();
    if (action === "ClearSearchHighlight") home.hideReadmeSearchHighlights();
    if (action === "SearchReadme") {
      const matches = home.searchReadme(state.searchQuery);
      if (matches === 0) state.showError(`E486: Pattern not found: ${state.searchQuery}`);
      else state.message = `${matches} ${matches === 1 ? "match" : "matches"} for /${state.searchQuery}`;
      render();
      home.searchReadme(state.searchQuery);
    }
    home.applyLeader(state.leader);
    if (action === "OpenHelp") {
      await showHelp({ push: true });
      return;
    }
    if (action === "SearchHelp") searchHelp();
    if (action === "CloseHelp") home.focusPreview();
    else focusAfterCommand();
    if (action === "Reload") await retryReadme();
  }

  // ------------------------------------------------------------ callbacks from the page script

  function onPreviewPosition(
    line: number,
    column: number,
    total: number,
    position: string,
    activeHeadings: view.HeadingBreadcrumb[],
    repository: string | null,
  ): void {
    if (
      !view.documentLoaded(model()) ||
      (!state.isRawView && repository !== state.currentDocument?.repository)
    )
      return;
    const boundedTotal = Math.max(1, total);
    const boundedLine = Math.min(Math.max(line, 1), boundedTotal);
    const boundedColumn = Math.max(1, column);
    const nextHeadings = state.isRawView ? [] : activeHeadings;
    if (
      positionLine === boundedLine &&
      positionColumn === boundedColumn &&
      totalLines === boundedTotal &&
      scrollPosition === position &&
      sameHeadings(headings, nextHeadings)
    )
      return;
    positionLine = boundedLine;
    positionColumn = boundedColumn;
    totalLines = boundedTotal;
    scrollPosition = position;
    headings = nextHeadings;
    render();
  }

  function onHelpPosition(
    line: number,
    column: number,
    total: number,
    position: string,
    bytes: number,
    page: string,
  ): void {
    if (!state.isHelpOpen || page !== state.helpPage) return;
    const boundedTotal = Math.max(1, total);
    const next: view.HelpStatus = {
      line: Math.min(Math.max(line, 1), boundedTotal),
      column: Math.max(1, column),
      total: boundedTotal,
      position,
      bytes: Math.max(0, bytes),
    };
    if (
      helpStatus !== null &&
      helpStatusPage === page &&
      helpStatus.line === next.line &&
      helpStatus.column === next.column &&
      helpStatus.total === next.total &&
      helpStatus.position === next.position &&
      helpStatus.bytes === next.bytes
    )
      return;
    helpStatus = next;
    helpStatusPage = page;
    render();
  }

  const sameHeadings = (
    left: readonly view.HeadingBreadcrumb[],
    right: readonly view.HeadingBreadcrumb[],
  ): boolean =>
    left.length === right.length &&
    left.every(
      (heading, index) =>
        heading.id === right[index].id &&
        heading.title === right[index].title &&
        heading.level === right[index].level,
    );

  function onMissingAnchor(anchor: string): void {
    state.showError(`E486: Pattern not found: ${anchor}`);
    render();
  }

  const adapter = {
    async invokeMethodAsync(method: string, ...args: unknown[]): Promise<unknown> {
      switch (method) {
        case "OnKeyDown":
          return onKeyDown(args[0] as string, args[1] as boolean);
        case "OnPreviewPosition":
          return onPreviewPosition(
            args[0] as number,
            args[1] as number,
            args[2] as number,
            args[3] as string,
            args[4] as view.HeadingBreadcrumb[],
            args[5] as string | null,
          );
        case "OnHelpPosition":
          return onHelpPosition(
            args[0] as number,
            args[1] as number,
            args[2] as number,
            args[3] as string,
            args[4] as number,
            args[5] as string,
          );
        case "OnInternalRepositoryLink":
          return openRepository(args[0] as string);
        case "OnMissingAnchor":
          return onMissingAnchor(args[0] as string);
        case "OnLayoutChanged":
          return onLayoutChanged(args[0] as boolean);
        case "OnDrawerDismissed":
          return onDrawerDismissed();
        case "OnHelpKey":
          return onHelpKey(args[0] as string);
        case "OnVisualMode":
          return onVisualMode(args[0] as view.VisualMode | null, args[1] as boolean);
        case "OnYank":
          return onYank(args[0] as number, args[1] as boolean);
        case "OnFlashPrompt":
          return onFlashPrompt(args[0] as string | null);
        case "GetPickMenu":
          return getPickMenu(args[0] as string);
        default:
          throw new Error(`Unknown callback: ${method}`);
      }
    },
  };

  // ------------------------------------------------------------ DOM events

  const ACTIONS: Record<string, () => unknown> = {
    "toggle-explorer": () => {
      state.isExplorerOpen = !state.isExplorerOpen;
      render();
    },
    "close-document": () => closeDocument(),
    back: goParent,
    "toggle-keys": toggleKeyboard,
    "toggle-theme": toggleTheme,
    find: showFinder,
    help: () => openHelpTag(resolveHelpTag(state.helpTags, "") ?? helpFileTag(HELP_INDEX_PAGE)),
    "close-help": closeHelp,
    "help-search": () => {
      beginHelpSearch();
      // Only offered while help is the current window, so the search returns there.
      commandFromHelp = true;
    },
    "help-back": () => (helpStack.length > 0 ? helpBack() : closeHelp()),
    "help-topics": () => openHelpTag("help-topics"),
    "help-retry": () => showHelp({ push: false }),
    "close-explorer": () => {
      state.isExplorerOpen = false;
      render();
    },
    "open-explorer": () => {
      state.isExplorerOpen = true;
      render();
    },
    "focus-explorer": () => {
      state.isExplorerOpen = true;
      render();
      focusExplorer();
    },
    "open-readme": () => openRepository(""),
    "open-featured": () => openRepository("featured.md"),
    outline: () => {
      outlineOpen = true;
      render();
      outlineDialog.querySelector<HTMLElement>("a")?.focus();
    },
    "close-outline": closeOutline,
    "copy-link": copyLink,
    "open-selected": openSelected,
    retry: retryReadme,
    "dismiss-open-error": dismissOpenError,
    "toggle-dev": () => {
      handleCommand(state, state.devNotation ? ":set nodev" : ":set dev");
      render();
    },
  };

  document.addEventListener("click", (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    // Modified clicks on links keep their browser meaning: new tab, new window, download.
    const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    if (modified && event.target.closest("a[href]") !== null) return;
    if (outlineOpen) {
      if (event.target === outlineDialog) {
        closeOutline();
        return;
      }
      if (event.target.closest(".outline-dialog a[data-readme-heading]") !== null) closeOutline(false);
    }
    const entry = event.target.closest<HTMLElement>(".entry-list .entry[data-index]");
    if (entry !== null) {
      event.preventDefault();
      state.selectIndex(Number(entry.dataset.index));
      void openSelected();
      return;
    }
    const helpLink = event.target.closest<HTMLElement>(".help-pane a[data-help-tag]");
    if (helpLink !== null) {
      event.preventDefault();
      void openHelpTag(helpLink.dataset.helpTag ?? "");
      return;
    }
    const button = event.target.closest<HTMLElement>("[data-action]");
    const action = button?.dataset.action;
    if (action !== undefined && Object.hasOwn(ACTIONS, action)) {
      if (button instanceof HTMLAnchorElement) event.preventDefault();
      void ACTIONS[action]();
    }
  });

  commandForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitCommand();
  });
  commandForm.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    state.commandText = event.target.value;
    render();
  });
  commandForm.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) handleCommandKey(event);
  });
  commandForm.addEventListener("focusin", beginCommandFromInput);
  commandForm.addEventListener("focusout", endCommandFromInput);
  // The window focused last is the current one; the tabline and command line leave it unchanged.
  shell.addEventListener("focusin", (event) => {
    if (!(event.target instanceof Node) || tabline.element.contains(event.target) || commandForm.contains(event.target))
      return;
    const inHelp = helpPane.contains(event.target);
    if (inHelp === helpFocused) return;
    helpFocused = inHelp;
    if (state.isHelpOpen && !narrowLayout) render();
  });
  outlineDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeOutline();
  });
  window.addEventListener("popstate", onPopState);

  // ------------------------------------------------------------ startup

  const helpData = document.querySelector("#help-tags")?.textContent;
  if (helpData) state.helpTags = JSON.parse(helpData) as HelpTags;
  const initialHelp = applyHelpLocation();
  if (initialHelp) {
    const article = helpScroll.querySelector(".help-content");
    if (article !== null) {
      helpHtml = article.outerHTML;
      helpFragments.set(state.helpPage, helpHtml);
      renderedHelp = view.renderHelpContent(model());
    }
    helpShown = { page: state.helpPage, tag: state.helpTag ?? helpFileTag(state.helpPage) };
    shell.dataset.help = "open";
  }
  const initial = initialHelp ? undefined : entryFromPath(location.pathname);
  if (initial) {
    state.navigateTo(initial.repository);
    const key = documentKey(initial);
    const [bytes, lines] = metrics[key] ?? [0, 1];
    const article = preview.querySelector(".readme-content");
    documentBytes = bytes;
    totalLines = Math.max(1, lines);
    if (article !== null) {
      documentHtml = article.innerHTML;
      fragments.set(key, documentHtml);
    }
  }
  // The server already rendered this preview; adopt it instead of replacing it.
  previewKey = view.previewKey(model());
  previewDocument = view.documentLoaded(model()) ? (state.currentDocument?.repository ?? null) : null;

  home.initialize(adapter, state.keyboardEnabled, state.leader);
  initializeExplorer();
  render();
  if (initialHelp && helpShown !== null) {
    positionHelp(helpShown.tag);
    helpScroll.focus({ preventScroll: true });
  }
  if (previewDocument !== null) {
    home.refreshPreview();
    if (state.currentDocument !== null) prefetchSource(state.currentDocument);
  }
}
