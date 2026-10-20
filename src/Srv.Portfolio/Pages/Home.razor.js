import * as cursor from "../js/nvim-cursor.js";
import * as readmeSearch from "../js/readme-search.js";
import * as pick from "../js/pick-menu.js";
import * as viewer from "../js/image-viewer.js";
import * as whichKey from "../js/which-key.js";
import { createMotionParser, isModifierKey } from "../js/vim-motions.js";
import { PREFIX_TIMEOUT_MS } from "../js/keyboard.js";
import {
  createHeadingIndex,
  getActiveHeadings,
} from "../js/readme-headings.js";
import { openInNewTab } from "../js/browser-links.js";

export { getActiveHeadings };

const ON_KEY_DOWN = "OnKeyDown";
const ON_POSITION = "OnPreviewPosition";
const ON_INTERNAL_REPOSITORY = "OnInternalRepositoryLink";
const ON_MISSING_ANCHOR = "OnMissingAnchor";
const ON_LAYOUT_CHANGED = "OnLayoutChanged";
const ON_DRAWER_DISMISSED = "OnDrawerDismissed";
// Keep in sync with the narrow-layout media query in app.css.
const NARROW_QUERY = "(max-width: 700px)";

const LEADER_MAPS = whichKey.leaderMaps();
const CTRL_MAPS = ["d", "u", "h", "l", "p", "c", "o", "i"];

let dotNetRef;
let positionFrame = 0;
let positionTimer = 0;
let lastPositionReport = 0;
let keyboardEnabled = true;
let leader = " ";
let leaderPressedAt = 0;
let leaderSuffix = "";
let pendingBracket = "";
let bracketPressedAt = 0;
let whichKeyTimer = 0;
const motions = createMotionParser();
const POSITION_REPORT_INTERVAL = 100;
let highlighterPromise;
let headingRoot;
let headingIndex;
let narrowMedia;
let drawerEntry = false;

function getHighlighter() {
  return /** @type {Window & { hljs?: { getLanguage: (name: string) => unknown, highlightElement: (element: Element) => void } }} */ (
    window
  ).hljs;
}

function loadHighlighter() {
  if (getHighlighter()) return Promise.resolve();
  if (!highlighterPromise) {
    highlighterPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(
        "../lib/highlight/highlight.min.js",
        import.meta.url,
      ).href;
      script.onload = resolve;
      script.onerror = () => {
        highlighterPromise = undefined;
        reject(new Error("Unable to load README syntax highlighting."));
      };
      document.head.append(script);
    });
  }
  return highlighterPromise;
}

function resetLeader() {
  leaderPressedAt = 0;
  leaderSuffix = "";
  clearTimeout(whichKeyTimer);
  whichKeyTimer = 0;
  whichKey.hide();
}

// The sequence never times out while the which-key popup is showing, like Neovim.
function leaderPending() {
  return (
    leaderPressedAt !== 0 &&
    (whichKey.isOpen() ||
      performance.now() - leaderPressedAt < PREFIX_TIMEOUT_MS)
  );
}

function scheduleWhichKey() {
  clearTimeout(whichKeyTimer);
  whichKeyTimer = 0;
  if (whichKey.isOpen()) showWhichKey();
  else whichKeyTimer = setTimeout(showWhichKey, whichKey.DELAY);
}

function showWhichKey() {
  whichKeyTimer = 0;
  const items = leaderPressedAt ? whichKey.entries(leaderSuffix) : null;
  if (!items) return;
  whichKey.show(`<leader>${leaderSuffix}`, items, {
    onSelect: (key) => void runLeaderKey(key),
    onBack: leaderBack,
    onClose: resetLeader,
  });
}

function leaderBack() {
  if (!leaderSuffix) {
    resetLeader();
    return;
  }
  leaderSuffix = leaderSuffix.slice(0, -1);
  leaderPressedAt = performance.now();
  scheduleWhichKey();
}

// Returns the `<leader>…` key once a map completes, "" while a prefix is pending, or null when consumed.
function continueLeader(key) {
  const sequence = leaderSuffix + key;
  if (LEADER_MAPS.includes(sequence)) {
    resetLeader();
    if (sequence === ";") {
      pick.start();
      return null;
    }
    return `<leader>${sequence}`;
  }
  if (LEADER_MAPS.some((map) => map.startsWith(sequence))) {
    leaderSuffix = sequence;
    leaderPressedAt = performance.now();
    scheduleWhichKey();
    return "";
  }
  resetLeader();
  return null;
}

async function runLeaderKey(key) {
  const mapped = continueLeader(key);
  if (mapped) await invokeKey(mapped, false);
}

function resetBracket() {
  pendingBracket = "";
  bracketPressedAt = 0;
  motions.reset();
}

export function setHelpOpen(dialog, open) {
  if (open && !dialog.open) {
    // Keyboard users see every binding; touch users start with them collapsed.
    const keys = dialog.querySelector?.(".help-keys");
    if (keys) keys.open = !touchInput;
    dialog.showModal();
  } else if (!open && dialog.open) dialog.close();
}

let touchInput = false;

function setInputMode(touch) {
  if (touch === touchInput) return;
  touchInput = touch;
  document.documentElement?.toggleAttribute("data-touch-input", touch);
}

function onPointerInput(event) {
  setInputMode(event.pointerType === "touch");
}

function onKeyInput(event) {
  // Soft keyboards only type into text fields, so keys elsewhere mean a real keyboard.
  if (!isTextEntry(event.target)) setInputMode(false);
}

function isTextEntry(target) {
  return (
    target instanceof HTMLElement &&
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

let helpPendingG = 0;

function scrollHelp(dialog, event, ctrlOnly) {
  const key = ctrlOnly ? `<C-${event.key.toLowerCase()}>` : event.key;
  const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[key];
  const page = { "<C-d>": 1, "<C-u>": -1 }[key];
  if (key !== "g") helpPendingG = 0;
  if (step) dialog.scrollBy({ top: step * 48, behavior: "instant" });
  else if (page)
    dialog.scrollBy({
      top: (page * dialog.clientHeight) / 2,
      behavior: "instant",
    });
  else if (key === "G")
    dialog.scrollTo({ top: dialog.scrollHeight, behavior: "instant" });
  else if (key === "g") {
    if (helpPendingG && performance.now() - helpPendingG < PREFIX_TIMEOUT_MS) {
      helpPendingG = 0;
      dialog.scrollTo({ top: 0, behavior: "instant" });
    } else {
      helpPendingG = performance.now();
    }
  } else {
    return false;
  }
  return true;
}

async function onKeyDown(event) {
  if (isModifierKey(event.key)) return;
  const ctrlOnly =
    event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  if (
    (event.ctrlKey && !ctrlOnly) ||
    event.metaKey ||
    event.altKey ||
    event.isComposing
  ) {
    resetLeader();
    resetBracket();
    return;
  }
  if (viewer.isOpen()) {
    event.preventDefault();
    resetLeader();
    resetBracket();
    viewer.handleKey(event.key);
    return;
  }
  if (pick.isActive()) {
    event.preventDefault();
    resetLeader();
    resetBracket();
    await pick.handleKey(
      ctrlOnly ? `<C-${event.key.toLowerCase()}>` : event.key,
    );
    return;
  }
  const helpDialog = document.querySelector("dialog[open]");
  const helpOpen = helpDialog !== null;
  if (helpOpen && keyboardEnabled) {
    resetLeader();
    resetBracket();
    if (scrollHelp(helpDialog, event, ctrlOnly)) {
      event.preventDefault();
      return;
    }
    if (event.key === "q" && !ctrlOnly) {
      event.preventDefault();
      await invokeKey("Escape", false);
      return;
    }
  }
  if (
    (helpOpen && event.key !== "Escape") ||
    isTextEntry(event.target) ||
    (event.target instanceof Element && event.target.closest(".file-finder"))
  ) {
    resetLeader();
    resetBracket();
    return;
  }
  if (!keyboardEnabled) {
    resetLeader();
    resetBracket();
    // `:` and `/` remain available when keymaps are disabled.
    if ((event.key === ":" || event.key === "/") && !ctrlOnly) {
      event.preventDefault();
      await invokeKey(event.key, false);
    }
    return;
  }
  const reading =
    /** @type {HTMLElement | null} */ (
      document.querySelector(".portfolio-shell")
    )?.dataset.reading === "true";
  let key = event.key;
  const target = event.target instanceof Element ? event.target : null;
  const entryButton = target?.closest(".entry");
  if (
    !ctrlOnly &&
    !entryButton &&
    target?.closest("button, a") &&
    ["Enter", " ", "Spacebar"].includes(event.key)
  ) {
    resetLeader();
    resetBracket();
    return;
  }
  const motionsActive = reading && !entryButton && !helpOpen;
  if (ctrlOnly) {
    resetLeader();
    resetBracket();
    const letter = key.toLowerCase();
    if (!CTRL_MAPS.includes(letter)) return;
    if (letter === "c" && (!reading || window.getSelection?.()?.toString()))
      return;
    if (letter !== "h" && letter !== "p" && !reading) return;
    key = `<C-${letter}>`;
  } else if (motionsActive && motions.awaitsArgument()) {
    // f/t/m/' take any character, including the leader key, as their argument.
    event.preventDefault();
    resetLeader();
    await runMotion(motions.feed(key));
    return;
  } else if (!helpOpen && leaderPending()) {
    event.preventDefault();
    if (key === "Escape") {
      resetLeader();
      return;
    }
    if (key === "Backspace") {
      leaderBack();
      return;
    }
    const mapped = continueLeader(key);
    if (!mapped) return;
    key = mapped;
  } else {
    resetLeader();
    if (!helpOpen && key === leader) {
      event.preventDefault();
      resetBracket();
      if (!event.repeat) {
        leaderPressedAt = performance.now();
        scheduleWhichKey();
      }
      return;
    }
    if (motionsActive) {
      const result = motions.feed(key);
      if (result.status !== "none") {
        event.preventDefault();
        await runMotion(result);
        return;
      }
    } else if (reading && (key === "]" || key === "[")) {
      event.preventDefault();
      if (
        pendingBracket === key &&
        performance.now() - bracketPressedAt < PREFIX_TIMEOUT_MS
      ) {
        resetBracket();
        key = key + key;
      } else {
        pendingBracket = key;
        bracketPressedAt = performance.now();
        return;
      }
    } else {
      resetBracket();
    }
  }
  const welcome =
    /** @type {HTMLElement | null} */ (
      document.querySelector(".preview-scroll")
    )?.dataset.welcome === "true";
  const handled =
    key === "Escape"
      ? helpOpen
      : key.startsWith("<") ||
        key === "]]" ||
        key === "[[" ||
        [
          "j",
          "k",
          "ArrowDown",
          "ArrowUp",
          "Enter",
          "l",
          "h",
          "-",
          "g",
          "G",
          "n",
          "N",
          ":",
          "/",
          "?",
        ].includes(key) ||
        (reading && key === "p") ||
        (welcome && key === "x");
  if (!handled) return;
  event.preventDefault();
  await invokeKey(key, !!entryButton);
}

async function runMotion(result) {
  if (result.status !== "motion") return;
  if (result.motion === "followLink") {
    await invokeKey("gx", false);
    return;
  }
  if (result.motion === "searchNext" || result.motion === "searchPrevious") {
    moveSearchMatch(result.motion === "searchNext" ? 1 : -1, result.count);
    return;
  }
  cursor.motion(result.motion, result.count, {
    hasCount: result.hasCount,
    argument: result.argument,
  });
}

async function invokeKey(key, explorerFocused) {
  try {
    await dotNetRef.invokeMethodAsync(ON_KEY_DOWN, key, explorerFocused);
  } catch {
    // The component can be disposed while a key callback is in flight.
  }
}

async function reportPosition() {
  const viewport = document.querySelector(".preview-scroll");
  if (!viewport || !dotNetRef) return;

  const raw = viewport.querySelector(".raw-readme");
  const article = /** @type {HTMLElement | null} */ (
    viewport.querySelector(".readme-content")
  );
  const total = raw
    ? raw.querySelectorAll(".raw-line").length
    : Number(article?.dataset.totalLines || 1);
  const lineHeight =
    Number.parseFloat(
      getComputedStyle(raw || article || viewport).lineHeight,
    ) || 24;
  const cursorPosition = cursor.position();
  const line = Math.min(
    total,
    Math.max(
      1,
      cursorPosition?.line ?? Math.floor(viewport.scrollTop / lineHeight) + 1,
    ),
  );
  const column = cursorPosition?.column ?? 1;
  const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const percent =
    maxScroll === 0
      ? "All"
      : viewport.scrollTop <= 1
        ? "Top"
        : viewport.scrollTop >= maxScroll - 1
          ? "Bot"
          : `${Math.round((viewport.scrollTop / maxScroll) * 100)}%`;
  if (headingRoot !== article) {
    headingRoot = article;
    headingIndex = article ? createHeadingIndex(article) : null;
  }
  const headings = headingIndex
    ? headingIndex.active(
        (cursorPosition?.top ?? viewport.getBoundingClientRect().top + 32) + 1,
      )
    : [];

  try {
    await dotNetRef.invokeMethodAsync(
      ON_POSITION,
      line,
      column,
      total,
      percent,
      headings,
      article?.dataset.repository ?? null,
    );
  } catch {
    // The component can be disposed while a scroll callback is in flight.
  }
}

function schedulePosition() {
  if (positionFrame) return;
  positionFrame = requestAnimationFrame(() => {
    positionFrame = 0;
    cursor.sync();
    const delay =
      POSITION_REPORT_INTERVAL - (performance.now() - lastPositionReport);
    if (delay > 0) {
      if (!positionTimer) {
        positionTimer = setTimeout(() => {
          positionTimer = 0;
          lastPositionReport = performance.now();
          void reportPosition();
        }, delay);
      }
      return;
    }
    lastPositionReport = performance.now();
    void reportPosition();
  });
}

async function onClick(event) {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const target = event.target instanceof Element ? event.target : null;
  if (whichKey.isOpen()) resetLeader();
  if (pick.isActive()) pick.cancel();
  if (target?.closest(".code-wrap-toggle")) {
    event.preventDefault();
    toggleCodeWrap();
    return;
  }
  const crumb = target?.closest(".breadcrumb [data-pick-segment]");
  if (crumb) {
    event.preventDefault();
    await pick.openSegment(crumb);
    return;
  }
  if (target && event.detail > 0)
    cursor.placeAt(event.clientX, event.clientY, target);
  if (target?.closest(".readme-content") && viewer.open(target)) {
    event.preventDefault();
    return;
  }
  const headingLink = target?.closest("a[data-readme-heading]");
  const anchorLink = headingLink
    ? null
    : target?.closest(".readme-content a[href^='#']");
  if (headingLink || anchorLink) {
    event.preventDefault();
    const id = headingLink
      ? headingLink.dataset.readmeHeading
      : decodeURIComponent(anchorLink.getAttribute("href").slice(1));
    cursor.jumpToElement(document.getElementById(id));
    /** @type {HTMLElement | null} */ (
      document.querySelector(".preview-scroll")
    )?.focus({ preventScroll: true });
    return;
  }
  const missingAnchor = target?.closest("a[data-missing-anchor]");
  if (missingAnchor) {
    event.preventDefault();
    try {
      await dotNetRef.invokeMethodAsync(
        ON_MISSING_ANCHOR,
        missingAnchor.dataset.missingAnchor,
      );
    } catch {
      // The component can be disposed while a click callback is in flight.
    }
    return;
  }

  const repositoryLink = target?.closest("a[data-internal-repo]");
  if (!repositoryLink) {
    openExternal(event, target);
    return;
  }
  event.preventDefault();
  try {
    await dotNetRef.invokeMethodAsync(
      ON_INTERNAL_REPOSITORY,
      repositoryLink.dataset.internalRepo,
    );
  } catch {
    // The component can be disposed while a click callback is in flight.
  }
}

// Links leaving the portfolio always open in a new tab so the reading position is kept.
function openExternal(event, target) {
  const link = target?.closest("a[href]");
  if (!link || event.defaultPrevented) return;
  let url;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return;
  }
  if (url.origin === location.origin || !/^https?:$/.test(url.protocol)) return;
  event.preventDefault();
  openInNewTab(url.href);
}

function onImageError(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.closest(".readme-content"))
    return;
  image.replaceWith(
    document.createTextNode(`[Image unavailable: ${image.alt}]`),
  );
  cursor.invalidate();
}

export function initialize(reference, enabled, configuredLeader) {
  dotNetRef = reference;
  keyboardEnabled = enabled;
  leader = configuredLeader;
  resetLeader();
  resetBracket();
  cursor.setNavigator(async (repository) => {
    try {
      await dotNetRef?.invokeMethodAsync(ON_INTERNAL_REPOSITORY, repository);
    } catch {
      // The component can be disposed while a jump is in flight.
    }
  });
  cursor.setMoveListener(schedulePosition);
  pick.configure({
    loadMenu: async (repository) => {
      try {
        return await dotNetRef?.invokeMethodAsync("GetPickMenu", repository);
      } catch {
        return [];
      }
    },
    open: async (repository) => {
      try {
        await dotNetRef?.invokeMethodAsync(ON_INTERNAL_REPOSITORY, repository);
      } catch {
        // The component can be disposed while a pick is in flight.
      }
      focusPreview();
    },
    jump: (id) => {
      cursor.jumpToElement(document.getElementById(id));
      focusPreview();
    },
  });
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("click", onClick);
  applyCodeWrap(readCodeWrap());
  document.addEventListener("error", onImageError, true);
  document
    .querySelector(".preview-scroll")
    ?.addEventListener("scroll", schedulePosition, { passive: true });
  window.addEventListener("resize", schedulePosition);
  document.addEventListener("load", onContentLoad, true);
}

function onContentLoad(event) {
  if (
    event.target instanceof HTMLImageElement &&
    event.target.closest(".readme-content")
  )
    schedulePosition();
}

const CODE_WRAP_KEY = "portfolio.codeWrap";
let codeWrap = false;

function readCodeWrap() {
  try {
    return localStorage.getItem(CODE_WRAP_KEY) === "on";
  } catch {
    return false;
  }
}

function applyCodeWrap(wrap) {
  codeWrap = wrap;
  document.documentElement?.toggleAttribute("data-code-wrap", wrap);
  for (const toggle of document.documentElement?.querySelectorAll(
    ".code-wrap-toggle",
  ) ?? [])
    toggle.setAttribute("aria-pressed", String(wrap));
}

function toggleCodeWrap() {
  const wrap = !codeWrap;
  applyCodeWrap(wrap);
  try {
    localStorage.setItem(CODE_WRAP_KEY, wrap ? "on" : "off");
  } catch {
    // Storage can be unavailable (private mode); the choice still applies to this visit.
  }
  cursor.refresh();
  schedulePosition();
  focusPreview();
}

export function setKeyboardEnabled(enabled) {
  keyboardEnabled = enabled;
  resetLeader();
}

export function applyLeader(configuredLeader) {
  leader = configuredLeader;
  resetLeader();
  focusPreview();
}

export function focusExplorer(explorer) {
  resetLeader();
  const entry = explorer.querySelector(".entry.selected");
  entry?.focus({ preventScroll: true });
  entry?.scrollIntoView({ block: "nearest" });
}

export async function refreshPreview() {
  headingRoot = null;
  headingIndex = null;
  readmeSearch.clear();
  const blocks = [...document.querySelectorAll(".readme-content pre code")];
  applyCodeWrap(codeWrap);
  if (
    blocks.some((block) =>
      [...block.classList].some((name) => name.startsWith("language-")),
    )
  ) {
    try {
      await loadHighlighter();
    } catch (error) {
      console.error(error);
    }
  }
  const highlighter = getHighlighter();
  if (highlighter) {
    for (const block of blocks) {
      const language = [...block.classList]
        .find((name) => name.startsWith("language-"))
        ?.slice("language-".length);
      if (language && highlighter.getLanguage(language))
        highlighter.highlightElement(block);
    }
  }
  cursor.refresh();
  schedulePosition();
}

export function moveCursor(motion) {
  cursor.move(motion);
}

export function jumpHeading(direction) {
  cursor.jumpHeading(direction);
}

export function followLink(fallbackDown) {
  const welcomeLink = /** @type {HTMLAnchorElement | null} */ (
    document.querySelector(
      ".preview-scroll[data-welcome='true'] .welcome-screen a[href]",
    )
  );
  if (welcomeLink) {
    openInNewTab(welcomeLink.href);
    return true;
  }
  if (fallbackDown && viewer.open(cursor.imageUnderCursor())) return true;
  if (cursor.followLink()) return true;
  if (fallbackDown) cursor.move("down");
  return fallbackDown;
}

export function jump(direction) {
  cursor.jump(direction);
}
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function focusCommand() {
  /** @type {HTMLInputElement | null} */ (
    document.querySelector("#command-input")
  )?.focus();
}

export function searchReadme(query) {
  const count = readmeSearch.search(query);
  if (count > 0) {
    cursor.invalidate();
    cursor.jumpToElement(readmeSearch.activeMatch());
  }
  return count;
}

export function clearReadmeSearch() {
  readmeSearch.clear();
}

export function hideReadmeSearchHighlights() {
  readmeSearch.hideHighlights();
}

export function moveSearchMatch(direction, count = 1) {
  const index = readmeSearch.move(direction, count);
  if (index >= 0) cursor.jumpToElement(readmeSearch.activeMatch());
  return index;
}

export function setCommandCaretToEnd() {
  requestAnimationFrame(() => {
    const input = /** @type {HTMLInputElement | null} */ (
      document.querySelector("#command-input")
    );
    if (input) input.setSelectionRange(input.value.length, input.value.length);
  });
}

export function focusPreview() {
  /** @type {HTMLElement | null} */ (
    document.querySelector(".preview-scroll")
  )?.focus();
}

function notify(method, ...args) {
  dotNetRef?.invokeMethodAsync(method, ...args).catch(() => {
    // The component can be disposed while a notification is in flight.
  });
}

function onLayoutChange(event) {
  if (drawerEntry) {
    drawerEntry = false;
    history.back();
  }
  notify(ON_LAYOUT_CHANGED, event.matches);
}

function onPopState() {
  if (!drawerEntry || history.state?.portfolioDrawer) return;
  drawerEntry = false;
  notify(ON_DRAWER_DISMISSED);
}

/** Starts tracking the narrow layout; returns whether it currently applies. */
export function initializeLayout() {
  narrowMedia ??= window.matchMedia(NARROW_QUERY);
  narrowMedia.addEventListener("change", onLayoutChange);
  window.addEventListener("popstate", onPopState);
  setInputMode(window.matchMedia("(pointer: coarse)").matches);
  document.addEventListener("pointerdown", onPointerInput, true);
  document.addEventListener("keydown", onKeyInput, true);
  return narrowMedia.matches;
}

/** On narrow layouts the explorer drawer owns a history entry, so Back closes it. */
export function setDrawerOpen(open) {
  if (!narrowMedia?.matches) return;
  if (open && !drawerEntry) {
    history.pushState({ ...(history.state ?? {}), portfolioDrawer: true }, "");
    drawerEntry = true;
  } else if (!open && drawerEntry) {
    drawerEntry = false;
    history.back();
  }
}

export function dispose() {
  resetLeader();
  pick.cancel();
  viewer.close();
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("click", onClick);
  document.removeEventListener("error", onImageError, true);
  document
    .querySelector(".preview-scroll")
    ?.removeEventListener("scroll", schedulePosition);
  window.removeEventListener("resize", schedulePosition);
  document.removeEventListener("load", onContentLoad, true);
  if (positionFrame) cancelAnimationFrame(positionFrame);
  positionFrame = 0;
  if (positionTimer) clearTimeout(positionTimer);
  positionTimer = 0;
  lastPositionReport = 0;
  headingRoot = null;
  headingIndex = null;
  cursor.dispose();
  narrowMedia?.removeEventListener("change", onLayoutChange);
  window.removeEventListener("popstate", onPopState);
  document.removeEventListener("pointerdown", onPointerInput, true);
  document.removeEventListener("keydown", onKeyInput, true);
  drawerEntry = false;
  dotNetRef = undefined;
}
