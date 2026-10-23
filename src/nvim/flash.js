// A small take on folke/flash.nvim (`:help flash`): `s` labels the matches of a typed pattern in every window
// on screen, and f, F, t, and T highlight the characters they can reach.

export const LABELS = "asdfghjklqwertyuiopzxcvbnm";
const ALL_LABELS = LABELS + LABELS.toUpperCase();
const HIGHLIGHTS = ["flash-backdrop", "flash-match", "flash-current"];

/**
 * @typedef {{ start: number, end: number, next: string, rect?: DOMRect, endRect?: DOMRect, distance?: number }} FlashMatch
 * @typedef {{
 *   flashMatches(pattern: string, options?: { exact?: boolean, direction?: number, visible?: boolean }): FlashMatch[],
 *   flashRange(start: number, end: number): Range | null,
 *   flashSpan(): [number, number] | null,
 *   charSearch(): { direction: number, till: boolean, character: string } | null,
 *   position(): unknown,
 * }} FlashCursor
 * @typedef {{ cursor: FlashCursor, viewport: () => HTMLElement | null }} FlashWindow
 * @typedef {{ window: number, match: FlashMatch, label: string }} Target
 */

/**
 * Gives labels to matches like flash.nvim: the current window's matches first, then the others, each nearest
 * to the cursor first. A label is skipped when typing it could continue the pattern, so it never hides a
 * longer search. Labels stay on the matches that had them before the last key.
 * @param {{ window: number, match: FlashMatch }[]} matches
 * @param {string} pattern
 * @param {Map<string, string>} [previous] Labels from the last key, by "window:start".
 */
export function assignLabels(matches, pattern, previous = new Map()) {
  const ignoreCase = pattern === pattern.toLowerCase();
  const skipped = new Set();
  for (const { match } of matches) {
    if (!match.next) continue;
    skipped.add(match.next);
    if (ignoreCase) {
      skipped.add(match.next.toLowerCase());
      skipped.add(match.next.toUpperCase());
    }
  }
  const available = [...ALL_LABELS].filter((label) => !skipped.has(label));
  const ordered = [...matches].sort(
    (first, second) =>
      Number(first.window !== 0) - Number(second.window !== 0) ||
      first.window - second.window ||
      (first.match.distance ?? 0) - (second.match.distance ?? 0) ||
      first.match.start - second.match.start,
  );
  /** @type {Map<string, string>} */
  const labels = new Map();
  const used = new Set();
  for (const { window, match } of ordered) {
    const key = `${window}:${match.start}`;
    const label = previous.get(key);
    if (label && available.includes(label) && !used.has(label)) {
      labels.set(key, label);
      used.add(label);
    }
  }
  const free = available.filter((label) => !used.has(label));
  for (const { window, match } of ordered) {
    const key = `${window}:${match.start}`;
    if (labels.has(key) || !free.length) continue;
    labels.set(key, /** @type {string} */ (free.shift()));
  }
  return labels;
}

/**
 * @param {{ prompt?: (text: string | null) => void }} [options] `prompt` shows the typed pattern after a
  *   flash icon, or clears it with null.
 */
export function createFlash({ prompt = () => {} } = {}) {
  /** @type {FlashWindow[]} */
  let windows = [];
  let pattern = "";
  /** @type {"jump" | "char" | ""} */
  let mode = "";
  /** @type {Target[]} */
  let targets = [];
  /** @type {Target | null} */
  let current = null;
  /** @type {Map<string, string>} */
  let labels = new Map();
  /** @type {HTMLElement[]} */
  let layers = [];
  let frame = 0;
  let listening = false;

  function highlights() {
    return typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined"
      ? CSS.highlights
      : null;
  }

  function clearHighlights() {
    const registry = highlights();
    if (!registry) return;
    for (const name of HIGHLIGHTS) registry.delete(name);
  }

  function clearLabels() {
    for (const layer of layers) layer.remove();
    layers = [];
  }

  function paint(backdrop, matches, currentRange) {
    const registry = highlights();
    if (!registry) return;
    const add = (name, ranges, priority) => {
      const valid = ranges.filter(Boolean);
      if (!valid.length) {
        registry.delete(name);
        return;
      }
      const highlight = new Highlight(...valid);
      highlight.priority = priority;
      registry.set(name, highlight);
    };
    add("flash-backdrop", backdrop, 10);
    add("flash-match", matches, 11);
    add("flash-current", currentRange ? [currentRange] : [], 12);
  }

  function backdrops() {
    return windows.map(({ cursor }) => {
      const span = cursor.flashSpan();
      return span ? cursor.flashRange(span[0], span[1]) : null;
    });
  }

  function findTargets() {
    /** @type {{ window: number, match: FlashMatch }[]} */
    const found = [];
    if (pattern) {
      windows.forEach(({ cursor }, window) => {
        for (const match of cursor.flashMatches(pattern)) found.push({ window, match });
      });
    }
    labels = assignLabels(found, pattern, labels);
    targets = found.map(({ window, match }) => ({
      window,
      match,
      label: labels.get(`${window}:${match.start}`) ?? "",
    }));
    // Enter jumps to the first match after the cursor, like flash.nvim's current match.
    const here = targets.filter((target) => target.window === 0);
    const after = pattern
      ? windows[0]?.cursor.flashMatches(pattern, { direction: 1 })[0]
      : undefined;
    current =
      (after && here.find((target) => target.match.start === after.start)) ??
      here.reduce(
        (first, target) =>
          !first || target.match.start < first.match.start ? target : first,
        /** @type {Target | null} */ (null),
      );
  }

  function drawLabels() {
    clearLabels();
    windows.forEach(({ viewport }, window) => {
      const element = viewport();
      const own = targets.filter((target) => target.window === window && target.label);
      if (!element || !own.length) return;
      const bounds = element.getBoundingClientRect();
      const left = bounds.left + element.clientLeft;
      const top = bounds.top + element.clientTop;
      const layer = document.createElement("div");
      layer.className = "flash-labels";
      layer.setAttribute("aria-hidden", "true");
      Object.assign(layer.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${element.clientWidth}px`,
        height: `${element.clientHeight}px`,
      });
      const fontSize = getComputedStyle(element).fontSize;
      for (const { match, label } of own) {
        const rect = match.endRect ?? match.rect;
        if (!rect) continue;
        const span = document.createElement("span");
        span.className = "flash-label";
        span.textContent = label;
        Object.assign(span.style, {
          left: `${rect.right - left}px`,
          top: `${rect.top - top}px`,
          height: `${rect.height}px`,
          lineHeight: `${rect.height}px`,
          fontSize,
        });
        layer.append(span);
      }
      document.body.append(layer);
      layers.push(layer);
    });
  }

  function renderJump() {
    findTargets();
    const ranges = targets.map(({ window, match }) =>
      windows[window].cursor.flashRange(match.start, match.end),
    );
    const currentRange = current
      ? windows[current.window].cursor.flashRange(current.match.start, current.match.end)
      : null;
    paint(backdrops(), ranges, currentRange);
    drawLabels();
  }

  function renderChar() {
    const window = windows[0];
    const search = window?.cursor.charSearch?.();
    if (!search) {
      hideChar();
      return;
    }
    const matches = window.cursor.flashMatches(search.character, {
      exact: true,
      direction: search.direction,
    });
    paint(
      backdrops(),
      matches.map((match) => window.cursor.flashRange(match.start, match.end)),
      null,
    );
  }

  function render() {
    if (mode === "jump") renderJump();
    else if (mode === "char") renderChar();
  }

  function onChange() {
    if (frame || !mode) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function listen(on) {
    if (on === listening) return;
    listening = on;
    const method = on ? "addEventListener" : "removeEventListener";
    document[method]("scroll", onChange, { capture: true, passive: true });
    window[method]("resize", onChange);
  }

  function stop() {
    mode = "";
    pattern = "";
    targets = [];
    current = null;
    labels = new Map();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    listen(false);
    clearHighlights();
    clearLabels();
  }

  /**
   * Starts a jump; the first window is the current one.
   * @param {FlashWindow[]} jumpWindows
   */
  function start(jumpWindows) {
    stop();
    windows = jumpWindows;
    mode = "jump";
    listen(true);
    prompt("");
    render();
  }

  function cancel() {
    const wasJump = mode === "jump";
    stop();
    if (wasJump) prompt(null);
  }

  /**
   * Reads a key while a jump is active.
   * @param {string} key
   * @returns {{ status: "pending" | "cancelled" } | { status: "jump", window: number, position: number }}
   */
  function key(key) {
    if (mode !== "jump") return { status: "cancelled" };
    const jump = (target) => {
      cancel();
      return target
        ? { status: /** @type {const} */ ("jump"), window: target.window, position: target.match.start }
        : { status: /** @type {const} */ ("cancelled") };
    };
    if (key === "Escape") return jump(null);
    if (key === "Enter") return jump(current);
    if (key === "Backspace") {
      if (!pattern) return jump(null);
      pattern = pattern.slice(0, -1);
      prompt(pattern);
      render();
      return { status: "pending" };
    }
    if ([...key].length !== 1) return { status: "pending" };
    const labelled = pattern ? targets.find((target) => target.label === key) : undefined;
    if (labelled) return jump(labelled);
    pattern += key;
    render();
    // Like flash.nvim, a pattern with no matches ends the jump.
    if (!targets.length) return jump(null);
    prompt(pattern);
    return { status: "pending" };
  }

  /**
   * Highlights where the last f, F, t, or T search can go next in a window (`:help flash-char`).
   * @param {FlashWindow} charWindow
   */
  function showChar(charWindow) {
    if (mode === "jump") return;
    stop();
    windows = [charWindow];
    mode = "char";
    listen(true);
    render();
  }

  function hideChar() {
    if (mode === "char") stop();
  }

  return {
    start,
    cancel,
    key,
    showChar,
    hideChar,
    active: () => mode === "jump",
    charActive: () => mode === "char",
    pattern: () => pattern,
    targets: () => targets.map(({ window, match, label }) => ({ window, start: match.start, label })),
  };
}
