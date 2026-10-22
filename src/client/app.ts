import { getPickMenu, type PortfolioEntry } from "../lib/catalog.ts";
import { CommandHistory } from "../nvim/command-history.ts";
import { handleCommand } from "../nvim/commands.ts";
import { copiedLineCount } from "../lib/format.ts";
import { KeymapHandler, type KeyAction } from "../nvim/keymap.ts";
import { NavigationState } from "../lib/navigation-state.ts";
import { documentKey, documentUrl, entryFromPath, fragmentUrl, pageTitle, rawUrl } from "../lib/routes.ts";
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
  const helpDialog = required<HTMLDialogElement>(document, ".help-dialog");
  const help = new Region(helpDialog);

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
    openErrorHost.update(view.renderOpenError(openError));
    renderPreview(current);
    statusline.className = view.statuslineClass(current);
    status.update(view.SEARCH_POSITION + view.renderStatusline(current));
    commandLine.update(view.renderCommandLine(current));
    const input = commandInput();
    if (input.value !== state.commandText) input.value = state.commandText;
    help.update(view.renderHelp(current));
    syncExplorer();
    if (helpDialog.open !== state.isHelpOpen) home.setHelpOpen(helpDialog, state.isHelpOpen);
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

  const commandInput = (): HTMLInputElement => required<HTMLInputElement>(commandForm, "#command-input");

  // ------------------------------------------------------------ history

  let applyingHistory = false;

  function syncHistory(): void {
    if (applyingHistory) return;
    const target = state.isReading ? state.currentDocument : undefined;
    if (target === null || entryFromPath(location.pathname) === target) return;
    const url = target === undefined ? "/" : documentUrl(target);
    if (home.consumeDrawerEntry()) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    document.title = pageTitle(target);
  }

  function onPopState(event: PopStateEvent): void {
    if ((event.state as { portfolioDrawer?: boolean } | null)?.portfolioDrawer) return;
    const target = entryFromPath(location.pathname);
    if (target === null) {
      location.reload();
      return;
    }
    const showing = state.isReading ? state.currentDocument : state.isWelcome ? undefined : null;
    if (target === showing) return;
    applyingHistory = true;
    try {
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
      if (state.currentDocument === entry) state.showError(`E484: Can't open file README.md: ${errorMessage(error)}`);
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
    else state.showError('clipboard: No provider. Try ":h clipboard".');
    render();
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
        home.focusCommand();
        home.setCommandCaretToEnd();
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

  function beginCommandFromInput(): void {
    if (state.isCommandMode) return;
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
      home.focusPreview();
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
    if (action !== "OpenHelp") home.focusPreview();
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
        case "OnInternalRepositoryLink":
          return openRepository(args[0] as string);
        case "OnMissingAnchor":
          return onMissingAnchor(args[0] as string);
        case "OnLayoutChanged":
          return onLayoutChanged(args[0] as boolean);
        case "OnDrawerDismissed":
          return onDrawerDismissed();
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
    help: () => {
      state.isHelpOpen = true;
      render();
    },
    "close-help": () => {
      state.isHelpOpen = false;
      render();
    },
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
    const entry = event.target.closest<HTMLElement>(".entry-list .entry[data-index]");
    if (entry !== null) {
      state.selectIndex(Number(entry.dataset.index));
      void openSelected();
      return;
    }
    const button = event.target.closest<HTMLElement>("[data-action]");
    const action = button?.dataset.action;
    if (action !== undefined && Object.hasOwn(ACTIONS, action)) void ACTIONS[action]();
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
  helpDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    state.isHelpOpen = false;
    render();
  });
  window.addEventListener("popstate", onPopState);

  // ------------------------------------------------------------ startup

  const initial = entryFromPath(location.pathname);
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
  if (previewDocument !== null) {
    home.refreshPreview();
    if (state.currentDocument !== null) prefetchSource(state.currentDocument);
  }
}
