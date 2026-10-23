import * as cursor from "../nvim/nvim-cursor.js";
import * as readmeSearch from "../nvim/readme-search.js";
import * as pick from "../nvim/pick-menu.js";
import * as viewer from "./js/image-viewer.js";
import * as whichKey from "../nvim/which-key.js";
import { leaderAction } from "../nvim/leader-bindings.ts";
import { createMotionParser, isModifierKey } from "../nvim/vim-motions.js";
import { createFlash } from "../nvim/flash.js";
import { PREFIX_TIMEOUT_MS } from "../nvim/keyboard.js";
import {
  createHeadingIndex,
  getActiveHeadings,
} from "./js/readme-headings.js";
import { openInNewTab } from "./js/browser-links.js";
import { readStorage, writeStorage } from "./storage.ts";
import { NARROW_QUERY } from "../lib/layout.ts";

export { getActiveHeadings };

const ON_KEY_DOWN = "OnKeyDown";
const ON_POSITION = "OnPreviewPosition";
const ON_INTERNAL_REPOSITORY = "OnInternalRepositoryLink";
const ON_MISSING_ANCHOR = "OnMissingAnchor";
const ON_LAYOUT_CHANGED = "OnLayoutChanged";
const ON_DRAWER_DISMISSED = "OnDrawerDismissed";
const ON_HELP_KEY = "OnHelpKey";
const ON_HELP_POSITION = "OnHelpPosition";
const ON_VISUAL_MODE = "OnVisualMode";
const ON_YANK = "OnYank";
const ON_FLASH = "OnFlashPrompt";

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
const motions = createMotionParser({
  visual: () => !!cursor.visualMode(),
});
const POSITION_REPORT_INTERVAL = 100;
let headingRoot;
let headingIndex;
let narrowMedia;
let drawerEntry = false;

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
    if (leaderAction(sequence) === "PickBreadcrumb") {
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

// The help window has its own cursor and motions, so moving in help keeps the README position.
const helpCursor = cursor.createCursor({
  viewport: ".help-scroll",
  root: ".help-content",
  headings: (root) => [...root.querySelectorAll("h1, h2, h3")],
  documentOf: (element) => element.dataset.helpPage ?? "",
});
const helpMotions = createMotionParser({
  visual: () => !!helpCursor.visualMode(),
});
let helpFrame = 0;

/** Copies yanked text to the clipboard and lets the app report it like Vim; returns whether it was copied. */
async function reportYank(yanked) {
  if (!yanked) return false;
  const ok = await copyText(yanked.text);
  try {
    await dotNetRef?.invokeMethodAsync(ON_YANK, yanked.lines, ok);
  } catch {
    // The component can be disposed while a yank is in flight.
  }
  return ok;
}

function endAllVisual() {
  cursor.endVisual();
  helpCursor.endVisual();
}

// Set when a mouse drag became a Visual selection, so the click that ends the drag keeps it.
let mouseSelected = false;

function onMouseDown() {
  mouseSelected = false;
  flash.cancel();
  flash.hideChar();
  motions.reset();
  helpMotions.reset();
}

// flash.nvim (`:help flash`): `s` jumps to a labelled match in any window on screen; f and t highlight targets.
const flash = createFlash({
  prompt(text) {
    void dotNetRef?.invokeMethodAsync(ON_FLASH, text).catch(() => {
      // The component can be disposed while the prompt changes.
    });
  },
});
const readmeWindow = {
  cursor,
  viewport: () =>
    /** @type {HTMLElement | null} */ (document.querySelector(".preview-scroll")),
};
const helpWindow = {
  cursor: helpCursor,
  viewport: () =>
    /** @type {HTMLElement | null} */ (document.querySelector(".help-scroll")),
};
/** @type {{ windows: (typeof readmeWindow)[], operator: boolean } | null} */
let flashJob = null;

/** Starts a flash jump from the README or help; other windows join unless an operator or Visual mode is active. */
function startFlash(result, inHelp) {
  const [own, other] = inHelp ? [helpWindow, readmeWindow] : [readmeWindow, helpWindow];
  const windows = [own];
  const otherShown = helpOpen() && !narrowMedia?.matches;
  if (!result.operator && !own.cursor.visualMode() && otherShown) windows.push(other);
  flash.hideChar();
  flashJob = { windows, operator: !!result.operator };
  flash.start(windows);
}

async function finishFlash(result) {
  const job = flashJob;
  if (result.status === "pending") return;
  flashJob = null;
  if (result.status !== "jump" || !job) return;
  const window = job.windows[result.window];
  const options = { target: result.position };
  if (job.operator) {
    await reportYank(window.cursor.yank("flashJump", 1, options));
    return;
  }
  if (result.window !== 0) {
    job.windows[0].cursor.endVisual();
    window.viewport()?.focus({ preventScroll: true });
  }
  if (!window.cursor.motion("flashJump", 1, options) && window.cursor.placeOn(null))
    window.cursor.motion("flashJump", 1, options);
}

/** Shows flash's char-mode highlights while f, F, t, or T can be repeated in a window. */
function syncCharFlash(parser, window) {
  if (flash.active()) return;
  if (parser.charActive()) flash.showChar(window);
  else flash.hideChar();
}

/**
 * Dragging, double-clicking, or triple-clicking text in the README or help starts Visual mode like Vim with
 * 'mouse' set: the browser selection becomes the cursor's selection, and a triple-click selects lines.
 * Touch keeps the browser's selection so its handles still work.
 */
function onMouseUp(event) {
  if (event.button !== 0 || touchInput) return;
  const selected = window.getSelection?.();
  if (!selected || selected.isCollapsed || !selected.rangeCount) return;
  const range = selected.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element =
    container instanceof Element ? container : container.parentElement;
  const inHelp = !!element?.closest(".help-pane");
  const [target, other] = inHelp ? [helpCursor, cursor] : [cursor, helpCursor];
  const forward =
    selected.anchorNode === range.startContainer &&
    selected.anchorOffset === range.startOffset;
  other.endVisual();
  if (!target.selectRange(range, forward, event.detail >= 3 ? "line" : "char"))
    return;
  selected.removeAllRanges();
  mouseSelected = true;
  /** @type {HTMLElement | null} */ (
    document.querySelector(inHelp ? ".help-scroll" : ".preview-scroll")
  )?.focus({ preventScroll: true });
}

/**
 * Runs the `y` operator, Visual-mode keys, and text objects on a cursor; returns whether the result was one
 * of them. Only one window has a Visual selection at a time, like Vim.
 */
async function runEdit(target, other, result) {
  const options = { hasCount: result.hasCount, argument: result.argument };
  if (result.status === "operator") {
    await reportYank(target.yank(result.motion, result.count, options));
    return true;
  }
  if (result.status === "motion" && result.motion === "textObject") {
    target.selectObject(result.argument, result.count);
    return true;
  }
  if (result.status !== "command") return false;
  switch (result.command) {
    case "visualChar":
    case "visualLine":
      other.endVisual();
      target.toggleVisual(result.command === "visualChar" ? "char" : "line");
      break;
    case "reselectVisual":
      other.endVisual();
      target.reselectVisual();
      break;
    case "swapVisual":
      target.swapVisual();
      break;
    case "yank":
    case "yankLines":
      await reportYank(
        target.yankVisual(result.command === "yankLines" || undefined),
      );
      break;
  }
  return true;
}

function onVisualMode(kind, inHelp) {
  void dotNetRef?.invokeMethodAsync(ON_VISUAL_MODE, kind, inHelp).catch(() => {
    // The component can be disposed while the mode changes.
  });
}

function onHelpScroll() {
  if (helpFrame) return;
  helpFrame = requestAnimationFrame(() => {
    helpFrame = 0;
    helpCursor.sync();
    void reportHelpPosition();
  });
}

/** Vim's scroll position of a window: All, Top, Bot, or a percentage. */
function scrollPercent(viewport) {
  const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  if (maxScroll === 0) return "All";
  if (viewport.scrollTop <= 1) return "Top";
  if (viewport.scrollTop >= maxScroll - 1) return "Bot";
  return `${Math.round((viewport.scrollTop / maxScroll) * 100)}%`;
}

/** Reports the help cursor's place for the statusline while help is the current window. */
async function reportHelpPosition() {
  const viewport = /** @type {HTMLElement | null} */ (
    document.querySelector(".help-scroll")
  );
  const article = /** @type {HTMLElement | null} */ (
    viewport?.querySelector(".help-content") ?? null
  );
  if (!viewport || !article || !dotNetRef) return;
  const total = Math.max(1, Number(article.dataset.totalLines || 1));
  const cursorPosition = helpCursor.position();
  try {
    await dotNetRef.invokeMethodAsync(
      ON_HELP_POSITION,
      Math.min(total, Math.max(1, cursorPosition?.line ?? 1)),
      cursorPosition?.column ?? 1,
      total,
      scrollPercent(viewport),
      Number(article.dataset.bytes || 0),
      article.dataset.helpPage ?? "",
    );
  } catch {
    // The component can be disposed while a scroll callback is in flight.
  }
}

async function runHelpMotion(result) {
  await runHelpResult(result);
  syncCharFlash(helpMotions, helpWindow);
}

async function runHelpResult(result) {
  if (result.status === "flash") {
    startFlash(result, true);
    return;
  }
  if (await runEdit(helpCursor, cursor, result)) return;
  if (result.status !== "motion") return;
  if (result.motion === "searchNext" || result.motion === "searchPrevious") {
    await invokeHelp(
      result.motion === "searchNext" ? "next-match" : "previous-match",
    );
    return;
  }
  if (result.motion === "followLink") {
    helpCursor.followLink();
    return;
  }
  helpCursor.motion(result.motion, result.count, {
    hasCount: result.hasCount,
    argument: result.argument,
  });
}

const helpOpen = () =>
  /** @type {HTMLElement | null} */ (document.querySelector(".portfolio-shell"))
    ?.dataset.help === "open";

/**
 * Whether a key belongs to the help window: focus is inside it, it covers the README on a narrow screen,
 * or nothing else has focus. Keys from the README or explorer beside it keep their usual meaning.
 */
function helpTarget(target) {
  if (!helpOpen()) return false;
  if (target instanceof Element && target.closest(".help-pane")) return true;
  if (narrowMedia?.matches) return true;
  return !(target instanceof Element) || target === document.body || target === document.documentElement;
}

async function invokeHelp(action) {
  try {
    await dotNetRef.invokeMethodAsync(ON_HELP_KEY, action);
  } catch {
    // The component can be disposed while a key callback is in flight.
  }
}

/** Keys of the help window; returns whether the key was used. */
async function onHelpKey(event, ctrlOnly) {
  const key = event.key;
  // f/t/m/' take any character, including q, : and /, as their argument.
  if (!ctrlOnly && keyboardEnabled && helpMotions.awaitsArgument()) {
    await runHelpMotion(helpMotions.feed(key));
    return true;
  }
  if (key === "Escape" && (helpMotions.isPending() || helpMotions.charActive())) {
    helpMotions.reset();
    flash.hideChar();
    return true;
  }
  if (key === "Escape" && helpCursor.visualMode()) {
    helpCursor.endVisual();
    return true;
  }
  if (key === "Escape" || (key === "q" && !ctrlOnly && keyboardEnabled)) {
    helpMotions.reset();
    helpCursor.endVisual();
    await invokeHelp("close");
    return true;
  }
  if (!ctrlOnly && (key === ":" || key === "/")) {
    helpMotions.reset();
    if (key === ":") {
      helpCursor.endVisual();
      await invokeKey(":", false);
    }
    else await invokeHelp("search");
    return true;
  }
  if (!keyboardEnabled) return false;
  if (ctrlOnly) {
    helpMotions.reset();
    const letter = key.toLowerCase();
    if (letter === "c" && helpCursor.visualMode()) {
      await reportYank(helpCursor.yankVisual());
      return true;
    }
    if (letter === "d" || letter === "u") {
      helpCursor.move(letter === "d" ? "halfDown" : "halfUp");
      return true;
    }
    if (key === "]") {
      const link = document.activeElement?.closest?.(".help-pane a[data-help-tag]");
      if (link) link.click();
      else if (!helpCursor.followLink()) await invokeHelp("no-identifier");
      return true;
    }
    if (letter === "t" || letter === "o") {
      await invokeHelp("back");
      return true;
    }
    if (letter === "l") {
      helpCursor.endVisual();
      await invokeHelp("leave");
      return true;
    }
    return false;
  }
  const result = helpMotions.feed(key);
  if (result.status === "none") return false;
  await runHelpMotion(result);
  return true;
}

async function onKeyDown(event) {
  if (isModifierKey(event.key)) return;
  if (flash.active()) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || event.altKey) {
      flash.cancel();
      flashJob = null;
      return;
    }
    await finishFlash(flash.key(event.key));
    return;
  }
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
  // The outline is an ordinary list of links: Tab, Enter, and Esc behave natively.
  if (document.querySelector("dialog.outline-dialog[open]")) {
    resetLeader();
    resetBracket();
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
  const inHelp = helpTarget(event.target);
  if (inHelp && !isTextEntry(event.target)) {
    resetLeader();
    resetBracket();
    // Enter and Space keep activating the focused link or button.
    if (
      !ctrlOnly &&
      ["Enter", " ", "Spacebar", "Tab"].includes(event.key)
    )
      return;
    if (await onHelpKey(event, ctrlOnly)) event.preventDefault();
    return;
  }
  if (
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
    target?.closest("button, a, summary") &&
    ["Enter", " ", "Spacebar"].includes(event.key)
  ) {
    resetLeader();
    resetBracket();
    return;
  }
  const motionsActive = reading && !entryButton;
  if (ctrlOnly) {
    resetLeader();
    resetBracket();
    const letter = key.toLowerCase();
    if (!CTRL_MAPS.includes(letter)) return;
    // CTRL-C copies the Visual selection; otherwise it copies the whole document.
    if (letter === "c" && cursor.visualMode()) {
      event.preventDefault();
      await reportYank(cursor.yankVisual());
      return;
    }
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
  } else if (leaderPending()) {
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
    if (key === leader) {
      event.preventDefault();
      resetBracket();
      if (!event.repeat) {
        leaderPressedAt = performance.now();
        scheduleWhichKey();
      }
      return;
    }
    if (motionsActive && cursor.visualMode() && (key === "Escape" || key === ":")) {
      motions.reset();
      cursor.endVisual();
      if (key === "Escape") {
        event.preventDefault();
        return;
      }
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
      ? helpOpen()
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
  await runReadmeResult(result);
  syncCharFlash(motions, readmeWindow);
}

async function runReadmeResult(result) {
  if (result.status === "flash") {
    startFlash(result, false);
    return;
  }
  if (await runEdit(cursor, helpCursor, result)) return;
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
    ? (cursor.rawLineCount(raw) ?? raw.querySelectorAll(".raw-line").length)
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
  const percent = scrollPercent(viewport);
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
    helpCursor.sync();
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
  if (mouseSelected) {
    mouseSelected = false;
    return;
  }
  // A click ends Visual mode and places the cursor, like Vim with 'mouse' set.
  if (event.detail > 0) endAllVisual();
  // The app routes help links and actions itself.
  if (target?.closest(".help-pane")) {
    if (event.detail > 0 && target.closest(".help-content"))
      helpCursor.placeAt(event.clientX, event.clientY, target);
    return;
  }
  if (target?.closest(".code-wrap-toggle")) {
    event.preventDefault();
    toggleCodeWrap();
    return;
  }
  const codeCopy = target?.closest(".code-copy");
  if (codeCopy) {
    event.preventDefault();
    await copyCodeBlock(codeCopy);
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
  helpCursor.setMoveListener(onHelpScroll);
  cursor.setModeListener((kind) => onVisualMode(kind, false));
  helpCursor.setModeListener((kind) => onVisualMode(kind, true));
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
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("mouseup", onMouseUp);
  applyCodeWrap(readCodeWrap());
  document.addEventListener("error", onImageError, true);
  document
    .querySelector(".preview-scroll")
    ?.addEventListener("scroll", schedulePosition, { passive: true });
  document
    .querySelector(".help-scroll")
    ?.addEventListener("scroll", onHelpScroll, { passive: true });
  window.addEventListener("resize", schedulePosition);
  document.addEventListener("load", onContentLoad, true);
  document.addEventListener("toggle", onDisclosureToggle, true);
}

function onDisclosureToggle(event) {
  if (event.target instanceof HTMLElement && event.target.closest(".readme-content details")) {
    headingRoot = null;
    headingIndex = null;
    cursor.refresh();
    schedulePosition();
  }
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
  return readStorage(CODE_WRAP_KEY) === "on";
}

function applyCodeWrap(wrap) {
  codeWrap = wrap;
  document.documentElement?.toggleAttribute("data-code-wrap", wrap);
  for (const toggle of document.documentElement?.querySelectorAll(
    ".code-wrap-toggle",
  ) ?? [])
    toggle.setAttribute("aria-pressed", String(wrap));
}

const CODE_COPIED_MS = 1500;

/**
 * The copy button of a code block copies its code without the final newline. Like a yank, the command line
 * reports more than two lines or a denied clipboard, and the button shows a check mark for a moment.
 */
async function copyCodeBlock(button) {
  const code = button.closest(".code-block")?.querySelector("pre");
  if (!code) return;
  const text = code.textContent.replace(/\n$/, "");
  const ok = await reportYank({ text, lines: text.split("\n").length, linewise: false });
  focusPreview();
  if (!ok) return;
  clearTimeout(Number(button.dataset.copiedTimer));
  button.setAttribute("data-copied", "");
  button.setAttribute("aria-label", "Copied");
  button.dataset.copiedTimer = String(
    setTimeout(() => {
      button.removeAttribute("data-copied");
      button.removeAttribute("data-copied-timer");
      button.setAttribute("aria-label", "Copy code");
    }, CODE_COPIED_MS),
  );
}

function toggleCodeWrap() {
  const wrap = !codeWrap;
  applyCodeWrap(wrap);
  writeStorage(CODE_WRAP_KEY, wrap ? "on" : "off");
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

// Code blocks are highlighted at build time, so a refresh only rebuilds the cursor and heading caches.
export function refreshPreview() {
  headingRoot = null;
  headingIndex = null;
  readmeSearch.clear();
  applyCodeWrap(codeWrap);
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

const helpSearch = readmeSearch.createSearch(".help-content");

/** Highlights `query` in the help window; returns the match count. */
export function searchHelp(query) {
  const count = helpSearch.search(query);
  helpCursor.invalidate();
  if (count > 0) helpCursor.jumpToElement(helpSearch.activeMatch());
  return count;
}

/** Moves to the next or previous help match; returns `{ index, count }` with `index` from 1. */
export function moveHelpMatch(direction) {
  helpSearch.move(direction);
  helpCursor.jumpToElement(helpSearch.activeMatch());
  return helpSearch.position();
}

export function clearHelpSearch() {
  helpSearch.clear();
  helpCursor.invalidate();
}

/** Re-reads the help text after the help window shows another file. */
export function refreshHelpCursor() {
  helpCursor.refresh();
  onHelpScroll();
}

/** Puts the help cursor on `element`, such as the tag a `:help` jumped to, or near the top of the view. */
export function placeHelpCursor(element) {
  helpCursor.placeOn(element);
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

/**
 * Hands the drawer's history entry over to a page navigation, which replaces it instead of pushing.
 * Returns whether an entry was handed over.
 */
export function consumeDrawerEntry() {
  if (!drawerEntry) return false;
  drawerEntry = false;
  return true;
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
  document.removeEventListener("mousedown", onMouseDown, true);
  document.removeEventListener("mouseup", onMouseUp);
  mouseSelected = false;
  document.removeEventListener("error", onImageError, true);
  document
    .querySelector(".preview-scroll")
    ?.removeEventListener("scroll", schedulePosition);
  document
    .querySelector(".help-scroll")
    ?.removeEventListener("scroll", onHelpScroll);
  window.removeEventListener("resize", schedulePosition);
  document.removeEventListener("load", onContentLoad, true);
  document.removeEventListener("toggle", onDisclosureToggle, true);
  if (positionFrame) cancelAnimationFrame(positionFrame);
  positionFrame = 0;
  if (positionTimer) clearTimeout(positionTimer);
  positionTimer = 0;
  lastPositionReport = 0;
  headingRoot = null;
  headingIndex = null;
  flash.cancel();
  flash.hideChar();
  flashJob = null;
  motions.reset();
  cursor.dispose();
  helpCursor.dispose();
  helpMotions.reset();
  if (helpFrame) cancelAnimationFrame(helpFrame);
  helpFrame = 0;
  narrowMedia?.removeEventListener("change", onLayoutChange);
  window.removeEventListener("popstate", onPopState);
  document.removeEventListener("pointerdown", onPointerInput, true);
  document.removeEventListener("keydown", onKeyInput, true);
  drawerEntry = false;
  dotNetRef = undefined;
}
