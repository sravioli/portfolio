// Neovim-style block cursor for the README preview, with a Neovide-like corner animation.
import { getHeadingElements } from "../client/js/readme-headings.js";
import { openInNewTab } from "../client/js/browser-links.js";
import { canPreview } from "../client/js/image-viewer.js";

const FAST_MS = 55;
const SLOW_MS = 140;
const SIZE_SNAP_RATIO = 2.5;
const SCROLLOFF_LINES = 3;
const JUMP_LIMIT = 100;
// Like `vim.hl.on_yank()`, which flashes the yanked text for 150ms.
const YANK_FLASH_MS = 150;

/**
 * Creates a block cursor over the text in `root` inside the scrolling `viewport`.
 * `headings` lists the elements `]]`/`[[` stop at; `documentOf` names the shown document,
 * so a new document starts at its top.
 */
export function createCursor({
  viewport: viewportSelector = ".preview-scroll",
  root: rootSelector = ".readme-content, .raw-readme",
  headings = null,
  documentOf = (element) => element.dataset.repository ?? "",
} = {}) {
  let viewport;
  let root;
  let cursorElement;
  let drawnElement = null;
  let drawnBox = null;
  let atoms = [];
  let starts = [];
  let nodeIndex = new Map();
  let rawLineIndex = new Map();
  let rawParagraph = new Map();
  let total = 0;
  let index = -1;
  let desiredX = 0;
  let range;
  let corners = null;
  let animation = null;
  let frame = 0;
  let documentKey = null;
  let lastLocation = null;
  let pendingRestore = null;
  let columnCache = null;
  let paragraphCache = null;
  let lastFind = null;
  /** @type {{ text: string, lower: string } | null} */
  let textCache = null;
  /** @type {{ anchor: number, kind: "char" | "line" } | null} */
  let visual = null;
  let lastVisual = null;
  let visualRange = null;
  let yankRange = null;
  let yankTimer = 0;
  let modeChanged = (_kind) => {};
  const localMarks = new Map();
  const globalMarks = new Map();
  let navigate = (_repository) => {};
  let moved = () => {};
  const back = [];
  const forward = [];

  function setNavigator(callback) {
    navigate = callback;
  }

  function setMoveListener(callback) {
    moved = callback;
  }

  /** Called with "char", "line", or null whenever Visual mode starts, changes kind, or ends. */
  function setModeListener(callback) {
    modeChanged = callback;
  }

  function box(left, top, width, height) {
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    };
  }

  function build() {
    atoms = [];
    starts = [];
    nodeIndex = new Map();
    rawLineIndex = new Map();
    rawParagraph = new Map();
    columnCache = null;
    paragraphCache = null;
    textCache = null;
    total = 0;
    if (!root) return;
    let paragraph = 0;
    let previousBlank = true;
    root.querySelectorAll(".raw-line").forEach((line, lineNumber) => {
      rawLineIndex.set(line, lineNumber);
      // Blank lines get their own negative id so paragraph motions can stop on them like Vim.
      const blank = !line.textContent.trim();
      if (!blank && previousBlank) paragraph++;
      rawParagraph.set(line, blank ? -(lineNumber + 1) : paragraph);
      previousBlank = blank;
    });
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            return /** @type {Text} */ (node).data.length &&
              !node.parentElement?.closest("svg, script, style")
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
          const element = /** @type {Element} */ (node);
          if (element.matches("img, video")) return NodeFilter.FILTER_ACCEPT;
          if (element.matches("script, style, template, svg"))
            return NodeFilter.FILTER_REJECT;
          if (element.matches(".raw-line") && !element.textContent)
            return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        },
      },
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const isText = node.nodeType === Node.TEXT_NODE;
      const atom = {
        node,
        start: total,
        length: isText ? /** @type {Text} */ (node).data.length : 1,
        element: !isText,
      };
      atoms.push(atom);
      starts.push(total);
      nodeIndex.set(node, atom);
      total += atom.length;
    }
  }

  function atomIndex(position) {
    let low = 0;
    let high = atoms.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= position) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  function locate(position) {
    return atoms[atomIndex(position)];
  }

  function charAt(position) {
    if (position < 0 || position >= total) return null;
    const atom = locate(position);
    return atom.element ? null : atom.node.data[position - atom.start];
  }

  function charWidth(node) {
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return (Number.parseFloat(getComputedStyle(element).fontSize) || 16) * 0.6;
  }

  function isHighSurrogate(code) {
    return code >= 0xd800 && code <= 0xdbff;
  }

  function rectAt(position) {
    if (position < 0 || position >= total) return null;
    const atom = locate(position);
    if (atom.element) {
      const rect = atom.node.getBoundingClientRect();
      if (rect.width < 0.5 || rect.height < 0.5) return null;
      return atom.node.matches(".raw-line")
        ? box(rect.left, rect.top, charWidth(atom.node), rect.height)
        : rect;
    }
    const offset = position - atom.start;
    const data = atom.node.data;
    const code = data.charCodeAt(offset);
    if (
      code >= 0xdc00 &&
      code <= 0xdfff &&
      offset > 0 &&
      isHighSurrogate(data.charCodeAt(offset - 1))
    )
      return null;
    range ??= document.createRange();
    if (data[offset] === "\n") {
      if (
        !atom.node.parentElement?.closest("pre") ||
        charAt(position - 1) !== "\n"
      )
        return null;
      range.setStart(atom.node, offset);
      range.setEnd(atom.node, offset);
      const caret = range.getBoundingClientRect();
      return caret.height < 0.5
        ? null
        : box(caret.left, caret.top, charWidth(atom.node), caret.height);
    }
    range.setStart(atom.node, offset);
    range.setEnd(
      atom.node,
      Math.min(data.length, offset + (isHighSurrogate(code) ? 2 : 1)),
    );
    for (const rect of range.getClientRects()) {
      if (rect.width > 0.5 && rect.height > 0.5) return rect;
    }
    return null;
  }

  function nextVisible(position, direction) {
    for (
      let candidate = position + direction;
      candidate >= 0 && candidate < total;
      candidate += direction
    ) {
      const rect = rectAt(candidate);
      if (rect) return [candidate, rect];
    }
    return null;
  }

  function sameLine(first, second) {
    const overlap =
      Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
    return overlap > Math.min(first.height, second.height) * 0.5;
  }

  function centerY(rect) {
    return (rect.top + rect.bottom) / 2;
  }

  function classOf(position) {
    const character = charAt(position);
    if (character === null) return 3;
    if (/\s/.test(character)) return 0;
    return /[\p{L}\p{N}_]/u.test(character) ? 1 : 2;
  }

  function lineHeight() {
    return Number.parseFloat(getComputedStyle(root ?? viewport).lineHeight) || 24;
  }

  function scrollMargin() {
    return Math.min(SCROLLOFF_LINES * lineHeight(), viewport.clientHeight / 4);
  }

  function distance(rect) {
    if (desiredX === Infinity) return -rect.right;
    const left = viewport.getBoundingClientRect().left;
    return Math.abs((rect.left + rect.right) / 2 - left - desiredX);
  }

  function pickOnLine(position, lineRect) {
    let best = position;
    let bestDistance = distance(lineRect);
    for (const direction of [-1, 1]) {
      let current = position;
      let next;
      while (
        (next = nextVisible(current, direction)) &&
        sameLine(next[1], lineRect)
      ) {
        current = next[0];
        const candidate = distance(next[1]);
        if (candidate < bestDistance) {
          best = current;
          bestDistance = candidate;
        }
      }
    }
    return best;
  }

  function lineEdge(position, direction) {
    const lineRect = rectAt(position);
    if (!lineRect) return position;
    let edge = position;
    let next;
    while ((next = nextVisible(edge, direction)) && sameLine(next[1], lineRect))
      edge = next[0];
    return edge;
  }

  function lineStep(position, direction) {
    const rect = rectAt(position);
    if (!rect) return position;
    const center = centerY(rect);
    let next;
    let current = position;
    while ((next = nextVisible(current, direction))) {
      current = next[0];
      const nextCenter = centerY(next[1]);
      if (
        !sameLine(next[1], rect) &&
        (direction > 0 ? nextCenter > center : nextCenter < center)
      )
        break;
    }
    return next ? pickOnLine(next[0], next[1]) : position;
  }

  function positionAtY(y) {
    let low = 0;
    let high = total;
    while (low < high) {
      const middle = (low + high) >> 1;
      const next = nextVisible(middle - 1, 1);
      if (!next) high = middle;
      else if (next[1].bottom < y) low = next[0] + 1;
      else high = middle;
    }
    const found = nextVisible(low - 1, 1) ?? nextVisible(total, -1);
    return found ? pickOnLine(found[0], found[1]) : -1;
  }

  function wordForward(position, kindOf = classOf) {
    const start = kindOf(position);
    let previous = rectAt(position);
    let separated = false;
    let next;
    let current = position;
    while ((next = nextVisible(current, 1))) {
      current = next[0];
      const kind = kindOf(current);
      if (previous && !sameLine(next[1], previous)) separated = true;
      previous = next[1];
      if (kind === 0) {
        separated = true;
        continue;
      }
      if (separated || kind !== start || kind === 3) return current;
    }
    return current;
  }

  function wordEnd(position, kindOf = classOf) {
    let next = nextVisible(position, 1);
    while (next && kindOf(next[0]) === 0) next = nextVisible(next[0], 1);
    if (!next) return position;
    let [end, rect] = next;
    const kind = kindOf(end);
    if (kind === 3) return end;
    while (
      (next = nextVisible(end, 1)) &&
      kindOf(next[0]) === kind &&
      sameLine(next[1], rect)
    )
      [end, rect] = next;
    return end;
  }

  function wordBackward(position, kindOf = classOf) {
    let previous = nextVisible(position, -1);
    while (previous && kindOf(previous[0]) === 0)
      previous = nextVisible(previous[0], -1);
    if (!previous) return position;
    let [start, rect] = previous;
    const kind = kindOf(start);
    if (kind === 3) return start;
    while (
      (previous = nextVisible(start, -1)) &&
      kindOf(previous[0]) === kind &&
      sameLine(previous[1], rect)
    ) {
      [start, rect] = previous;
    }
    return start;
  }

  function bigClassOf(position) {
    const kind = classOf(position);
    return kind === 2 ? 1 : kind;
  }

  function wordEndBackward(position, kindOf = classOf) {
    const kind = kindOf(position);
    let rect = rectAt(position);
    let previous = nextVisible(position, -1);
    if (kind === 1 || kind === 2) {
      while (
        previous &&
        kindOf(previous[0]) === kind &&
        rect &&
        sameLine(previous[1], rect)
      ) {
        rect = previous[1];
        previous = nextVisible(previous[0], -1);
      }
    }
    while (previous && kindOf(previous[0]) === 0)
      previous = nextVisible(previous[0], -1);
    return previous ? previous[0] : position;
  }

  function isRaw() {
    return root?.classList.contains("raw-readme") ?? false;
  }

  function isBlankAt(position) {
    const character = charAt(position);
    return character !== null && /\s/.test(character);
  }

  function firstNonBlank(position) {
    return nonBlankEdge(position, -1);
  }

  function lastNonBlank(position) {
    return nonBlankEdge(position, 1);
  }

  function nonBlankEdge(position, direction) {
    const lineRect = rectAt(position);
    let current = lineEdge(position, direction);
    let next;
    while (
      lineRect &&
      isBlankAt(current) &&
      (next = nextVisible(current, -direction)) &&
      sameLine(next[1], lineRect)
    ) {
      current = next[0];
    }
    return current;
  }

  function columnOnLine(position, column) {
    const lineRect = rectAt(position);
    let current = lineEdge(position, -1);
    let next;
    for (
      let step = 1;
      step < column &&
      (next = nextVisible(current, 1)) &&
      sameLine(next[1], lineRect);
      step++
    )
      current = next[0];
    return current;
  }

  function atX(position, x) {
    const rect = rectAt(position);
    if (!rect) return position;
    desiredX = x;
    return pickOnLine(position, rect);
  }

  function repeat(position, count, step) {
    let current = position;
    for (let iteration = 0; iteration < count; iteration++) {
      const next = step(current);
      if (next < 0 || next === current) break;
      current = next;
    }
    return current;
  }

  // f, F, t, and T search past the end of the line, like flash.nvim's char mode (`:help flash-char`).
  function findCharacter(
    position,
    direction,
    character,
    till,
    count,
    skipAdjacent,
  ) {
    if (!rectAt(position) || !character) return -1;
    const { text } = documentText();
    const matches =
      character === " "
        ? (at) => /\s/.test(text[at])
        : (at) => text.startsWith(character, at);
    for (let at = position + direction; at >= 0 && at < total; at += direction) {
      if (!matches(at) || !rectAt(at)) continue;
      const target = till ? nextVisible(at, -direction)?.[0] : at;
      if (target === undefined || (till && skipAdjacent && target === position))
        continue;
      if (--count === 0) return target;
    }
    return -1;
  }

  /** The document as one string, one character per position, with a lowercase copy of the same length. */
  function documentText() {
    if (textCache) return textCache;
    let text = "";
    for (const atom of atoms) text += atom.element ? "\uFFFC" : atom.node.data;
    let lower = text.toLowerCase();
    if (lower.length !== text.length) {
      lower = "";
      for (const character of text.split("")) {
        const folded = character.toLowerCase();
        lower += folded.length === 1 ? folded : character;
      }
    }
    textCache = { text, lower };
    return textCache;
  }

  // ------------------------------------------------------------ flash.nvim targets

  function screenBounds() {
    const bounds = viewport.getBoundingClientRect();
    const left = bounds.left + viewport.clientLeft;
    const top = bounds.top + viewport.clientTop;
    return {
      left,
      top,
      right: left + viewport.clientWidth,
      bottom: top + viewport.clientHeight,
    };
  }

  /** The first and last positions of the lines on screen, or null when nothing is shown. */
  function screenSpan() {
    if (!viewport?.isConnected || !total) return null;
    const view = screenBounds();
    const top = positionAtY(view.top);
    const bottom = positionAtY(view.bottom);
    if (top < 0 || bottom < 0) return null;
    return {
      view,
      first: Math.min(top, lineEdge(top, -1)),
      last: Math.max(bottom, lineEdge(bottom, 1)),
    };
  }

  // Whether a character is wholly on screen, and not scrolled out of sight inside a code block.
  function onScreen(rect, view, position) {
    const inside = (outer) =>
      rect.top >= outer.top - 1 &&
      rect.bottom <= outer.bottom + 1 &&
      rect.left >= outer.left - 1 &&
      rect.right <= outer.right + 1;
    if (!inside(view)) return false;
    const atom = locate(position);
    const element = atom.element ? atom.node : atom.node.parentElement;
    const scroller = element?.closest?.("pre");
    return !scroller || inside(scroller.getBoundingClientRect());
  }

  /**
   * Matches of `pattern` for flash.nvim-style jumps (`:help flash`). The case is ignored unless the pattern
   * has a capital letter, like 'smartcase', or `exact` is set. `direction` keeps only matches after (1) or
   * before (-1) the cursor. With `visible`, only matches wholly on screen count, each with its box and its
   * distance from the cursor; without it, every match in the document counts.
   * @param {string} pattern
   * @param {{ exact?: boolean, direction?: number, visible?: boolean }} [options]
   */
  function flashMatches(pattern, { exact = false, direction = 0, visible = true } = {}) {
    if (!viewport?.isConnected || !total || !pattern) return [];
    const { text, lower } = documentText();
    const ignoreCase = !exact && pattern === pattern.toLowerCase();
    const haystack = ignoreCase ? lower : text;
    let first = 0;
    let last = total - 1;
    let view = null;
    if (visible) {
      const span = screenSpan();
      if (!span) return [];
      ({ first, last, view } = span);
    }
    if (direction > 0) first = Math.max(first, index + 1);
    if (direction < 0) last = Math.min(last, index - 1);
    const origin = visible && index >= 0 ? rectAt(index) : null;
    const matches = [];
    for (
      let at = haystack.indexOf(pattern, first);
      at >= 0 && at <= last;
      at = haystack.indexOf(pattern, at + 1)
    ) {
      const end = at + pattern.length - 1;
      const match = { start: at, end, next: text[end + 1] ?? "" };
      if (view) {
        const rect = rectAt(at);
        if (!rect || !onScreen(rect, view, at)) continue;
        Object.assign(match, {
          rect,
          endRect: rectAt(end) ?? rect,
          distance: origin
            ? Math.hypot(rect.left - origin.left, rect.top - origin.top)
            : 0,
        });
      }
      matches.push(match);
    }
    return matches;
  }

  /** A DOM range over positions `start` to `end`, clamped to the document, for flash highlights. */
  function flashRange(start, end) {
    if (!total) return null;
    const first = Math.max(0, Math.min(start, total - 1));
    return domRange(first, Math.max(first, Math.min(end, total - 1)));
  }

  /** The positions of the lines on screen, for flash's backdrop. */
  function flashSpan() {
    const span = screenSpan();
    return span ? [span.first, span.last] : null;
  }

  /** The last f, F, t, or T search, for flash's char mode. */
  function charSearch() {
    return lastFind ? { ...lastFind } : null;
  }

  function lineCount() {
    if (isRaw()) return Math.max(1, rawLineIndex.size);
    return Math.max(
      1,
      Math.round(root.getBoundingClientRect().height / lineHeight()),
    );
  }

  /**
   * Returns the indexed raw-line count for the given raw document, or null when the cursor has not indexed it.
   * @param {Element | null} element
   */
  function rawLineCount(element) {
    return element && element === root && root.isConnected
      ? rawLineIndex.size
      : null;
  }

  function lineTarget(line) {
    const clamped = Math.min(Math.max(1, line), lineCount());
    let position;
    if (isRaw()) {
      position = firstVisibleIn([...rawLineIndex.keys()][clamped - 1]);
    } else {
      position = positionAtY(
        root.getBoundingClientRect().top + (clamped - 0.5) * lineHeight(),
      );
    }
    return position >= 0 ? firstNonBlank(position) : -1;
  }

  function screenLine(which, count) {
    const bounds = viewport.getBoundingClientRect();
    const height = lineHeight();
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    const contentBottom = Math.min(
      bounds.bottom,
      root.getBoundingClientRect().bottom,
    );
    let target;
    if (which === "screenTop") {
      const limit = bounds.top + (viewport.scrollTop > 1 ? scrollMargin() : 0);
      target = positionAtY(limit + count * height);
    } else if (which === "screenBottom") {
      const limit =
        contentBottom - (viewport.scrollTop < maxScroll - 1 ? scrollMargin() : 0);
      target = positionAtY(limit - (count - 1) * height);
      const rect = target >= 0 ? rectAt(target) : null;
      if (rect && rect.bottom > limit + 1) target = lineStep(target, -1);
    } else {
      target = positionAtY((bounds.top + contentBottom) / 2);
    }
    return target >= 0 ? firstNonBlank(target) : -1;
  }

  const BLOCK_SELECTOR =
    "p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, td, th, dt, dd, figure, summary";

  // Rendered READMEs have no blank lines, so block elements act as Vim paragraphs and sentence boundaries.
  function blockOf(atom) {
    if (atom.block === undefined) {
      const element = atom.element ? atom.node : atom.node.parentElement;
      if (isRaw())
        atom.block = rawParagraph.get(element?.closest(".raw-line")) ?? null;
      else
        atom.block =
          element?.closest(BLOCK_SELECTOR) ??
          (atom.element ? atom.node : element) ??
          null;
    }
    return atom.block;
  }

  function hasContent(atom) {
    return atom.element || /\S/.test(atom.node.data);
  }

  function paragraphStops() {
    if (paragraphCache) return paragraphCache;
    const raw = isRaw();
    const blocks = [];
    for (const atom of atoms) {
      const key = blockOf(atom);
      if (key === null || (!raw && !hasContent(atom))) continue;
      if (blocks.at(-1)?.key !== key) blocks.push({ key, start: atom.start });
    }
    const blank = (block) => raw && block.key < 0;
    const forward = [];
    const backward = [];
    blocks.forEach((block, blockIndex) => {
      const visible = nextVisible(block.start - 1, 1)?.[0];
      if (visible === undefined) return;
      if (!raw) {
        forward.push(visible);
        backward.push(visible);
        return;
      }
      if (!blank(block)) return;
      if (blockIndex > 0 && !blank(blocks[blockIndex - 1])) forward.push(visible);
      if (blockIndex < blocks.length - 1 && !blank(blocks[blockIndex + 1]))
        backward.push(visible);
    });
    paragraphCache = { forward, backward };
    return paragraphCache;
  }

  function documentEdge(direction) {
    return (
      (direction > 0 ? nextVisible(total, -1) : nextVisible(-1, 1))?.[0] ?? -1
    );
  }

  function paragraphStep(position, direction) {
    const stops = paragraphStops()[direction > 0 ? "forward" : "backward"];
    const stop =
      direction > 0
        ? stops.find((value) => value > position)
        : stops.findLast((value) => value < position);
    return stop ?? documentEdge(direction);
  }

  function isSentenceStart(position) {
    const atom = locate(position);
    if (atom.element) return true;
    if (/\s/.test(atom.node.data[position - atom.start])) return false;
    const block = blockOf(atom);
    let current = position - 1;
    let spaced = false;
    while (current >= 0) {
      const previous = locate(current);
      if (previous.element) return true;
      if (blockOf(previous) !== block) {
        if (hasContent(previous)) return true;
        current = previous.start - 1;
        spaced = true;
        continue;
      }
      if (!/\s/.test(previous.node.data[current - previous.start])) break;
      spaced = true;
      current--;
    }
    if (current < 0) return true;
    if (!spaced) return false;
    while (current > 0 && /[)\]"'’”]/.test(charAt(current))) current--;
    return /[.!?]/.test(charAt(current) ?? "");
  }

  function sentenceStep(position, direction) {
    for (
      let candidate = position + direction;
      candidate >= 0 && candidate < total;
      candidate += direction
    ) {
      if (isSentenceStart(candidate) && rectAt(candidate)) return candidate;
    }
    return documentEdge(direction);
  }

  const OPENERS = { "(": ")", "[": "]", "{": "}" };
  const CLOSERS = { ")": "(", "]": "[", "}": "{" };

  function matchBracket(position) {
    const lineRect = rectAt(position);
    let start = position;
    let next;
    while (!(charAt(start) in OPENERS || charAt(start) in CLOSERS)) {
      if (
        !lineRect ||
        !(next = nextVisible(start, 1)) ||
        !sameLine(next[1], lineRect)
      )
        return -1;
      start = next[0];
    }
    const character = charAt(start);
    const opening = character in OPENERS;
    const mate = opening ? OPENERS[character] : CLOSERS[character];
    const direction = opening ? 1 : -1;
    let depth = 0;
    for (
      let candidate = start + direction;
      candidate >= 0 && candidate < total;
      candidate += direction
    ) {
      const value = charAt(candidate);
      if (value === character) depth++;
      else if (value === mate && depth-- === 0)
        return rectAt(candidate) ? candidate : -1;
    }
    return -1;
  }

  function unmatchedBracket(position, opening, direction) {
    const seek = direction < 0 ? opening : OPENERS[opening];
    const other = direction < 0 ? OPENERS[opening] : opening;
    let depth = 0;
    for (
      let candidate = position + direction;
      candidate >= 0 && candidate < total;
      candidate += direction
    ) {
      const value = charAt(candidate);
      if (value === other) depth++;
      else if (value === seek && depth-- === 0)
        return rectAt(candidate) ? candidate : -1;
    }
    return -1;
  }

  function headingElements() {
    if (headings) return headings(root);
    return root.matches(".readme-content")
      ? getHeadingElements(root)
      : [...root.querySelectorAll(".raw-line")].filter((line) =>
          /^#{1,6}\s/.test(line.textContent),
        );
  }

  // `][` and `[]` land on the last character before a heading, i.e. the end of a README section.
  function sectionEnd(position, direction) {
    const ends = headingElements()
      .map((heading) => firstVisibleIn(heading))
      .filter((start) => start > 0)
      .map((start) => nextVisible(start, -1)?.[0])
      .filter((end) => end !== undefined);
    const end =
      direction > 0
        ? ends.find((value) => value > position)
        : ends.findLast((value) => value < position);
    return end ?? documentEdge(direction);
  }

  function setMark(letter) {
    const location = currentLocation();
    if (!location) return false;
    if (/[A-Z]/.test(letter)) {
      globalMarks.set(letter, location);
    } else {
      if (!localMarks.has(location.repository))
        localMarks.set(location.repository, new Map());
      localMarks.get(location.repository).set(letter, location);
    }
    return true;
  }

  function goToMark(letter, linewise) {
    const current = currentLocation();
    const previousContext = letter === "'" || letter === "`";
    const location = previousContext
      ? back.at(-1)
      : /[A-Z]/.test(letter)
        ? globalMarks.get(letter)
        : localMarks.get(current?.repository)?.get(letter);
    if (!location || !current) return false;
    if (previousContext) {
      back.pop();
      back.push(current);
    } else {
      pushJump(current);
    }
    restore(location);
    if (linewise && location.repository === documentKey?.repository && index >= 0)
      setIndex(firstNonBlank(index));
    return true;
  }

  function scrollTo(top) {
    const before = viewport.scrollTop;
    viewport.scrollTo({ top, behavior: "instant" });
    const moved = viewport.scrollTop - before;
    // Keep the animated cursor where it was on screen so motion-driven scrolls glide like Neovide.
    if (moved && corners) corners = corners.map(([x, y]) => [x, y + moved]);
    if (moved && animation)
      animation = animation.map((corner) => ({
        ...corner,
        from: [corner.from[0], corner.from[1] + moved],
      }));
    return moved;
  }

  function revealHorizontally(position) {
    let element = locate(position).node.parentElement;
    while (element && element !== root && root.contains(element)) {
      if (
        element.scrollWidth > element.clientWidth + 1 &&
        /auto|scroll/.test(getComputedStyle(element).overflowX)
      ) {
        const rect = rectAt(position);
        if (!rect) return;
        const bounds = element.getBoundingClientRect();
        const margin = Math.min(4 * rect.width, element.clientWidth / 4);
        const left = bounds.left + element.clientLeft;
        const right = left + element.clientWidth;
        if (rect.left < left + margin)
          element.scrollLeft -= left + margin - rect.left;
        else if (rect.right > right - margin)
          element.scrollLeft += rect.right - right + margin;
      }
      element = element.parentElement;
    }
  }

  function ensureVisible(rect) {
    const bounds = viewport.getBoundingClientRect();
    const margin = scrollMargin();
    if (
      rect.height > viewport.clientHeight - 2 * margin ||
      rect.top < bounds.top + margin
    ) {
      scrollTo(viewport.scrollTop + rect.top - bounds.top - margin);
    } else if (rect.bottom > bounds.bottom - margin) {
      scrollTo(viewport.scrollTop + rect.bottom - bounds.bottom + margin);
    }
  }

  function reducedMotion() {
    return (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    );
  }

  function cornerBox(points) {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return box(
      left,
      top,
      Math.max(1, Math.max(...xs) - left),
      Math.max(1, Math.max(...ys) - top),
    );
  }

  function containsBox(outer, inner) {
    return (
      inner.left >= outer.left &&
      inner.top >= outer.top &&
      inner.right <= outer.right &&
      inner.bottom <= outer.bottom
    );
  }

  function unionBox(first, second) {
    const left = Math.min(first.left, second.left);
    const top = Math.min(first.top, second.top);
    return box(
      left,
      top,
      Math.max(first.right, second.right) - left,
      Math.max(first.bottom, second.bottom) - top,
    );
  }

  function draw() {
    if (!cursorElement?.isConnected)
      cursorElement = viewport?.querySelector(".nvim-cursor");
    if (!cursorElement || !corners) return;
    if (drawnElement !== cursorElement) {
      drawnElement = cursorElement;
      drawnBox = null;
    }
    let frameBox = cornerBox(corners);
    // Resizing this absolutely positioned element relayouts the scroll container, so a solid cursor keeps
    // one box per animation and only its clip path changes per frame. Media outlines are inset shadows at
    // the box edge and keep an exact box.
    if (animation && !cursorElement.classList.contains("on-media")) {
      frameBox =
        drawnBox && containsBox(drawnBox, frameBox)
          ? drawnBox
          : unionBox(frameBox, cornerBox(animation.map(({ to }) => to)));
    }
    if (
      !drawnBox ||
      drawnBox.left !== frameBox.left ||
      drawnBox.top !== frameBox.top ||
      drawnBox.width !== frameBox.width ||
      drawnBox.height !== frameBox.height
    ) {
      cursorElement.style.transform = `translate(${frameBox.left}px, ${frameBox.top}px)`;
      cursorElement.style.width = `${frameBox.width}px`;
      cursorElement.style.height = `${frameBox.height}px`;
      drawnBox = frameBox;
    }
    cursorElement.style.clipPath = `polygon(${corners.map(([x, y]) => `${x - frameBox.left}px ${y - frameBox.top}px`).join(", ")})`;
    if (cursorElement.dataset.visible !== "true")
      cursorElement.dataset.visible = "true";
  }

  function easeOutCubic(value) {
    return 1 - (1 - value) ** 3;
  }

  function step(now) {
    frame = 0;
    if (!animation) return;
    let running = false;
    corners = animation.map(({ from, to, start, duration }) => {
      const progress = Math.min(1, (now - start) / duration);
      if (progress < 1) running = true;
      const eased = easeOutCubic(progress);
      return [
        from[0] + (to[0] - from[0]) * eased,
        from[1] + (to[1] - from[1]) * eased,
      ];
    });
    // The final frame draws without an animation so the cursor settles on its exact box.
    if (!running) animation = null;
    draw();
    if (running) frame = requestAnimationFrame(step);
  }

  function animateTo(target, instant) {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const current = corners;
    if (instant || !current || reducedMotion()) {
      animation = null;
      corners = target;
      draw();
      return;
    }
    const center = (points) =>
      points.reduce(([x, y], [px, py]) => [x + px / 4, y + py / 4], [0, 0]);
    const [fromX, fromY] = center(current);
    const [toX, toY] = center(target);
    const travel = Math.hypot(toX - fromX, toY - fromY);
    if (travel < 0.5) {
      animation = null;
      corners = target;
      draw();
      return;
    }
    const start = performance.now();
    const size = (points) => [
      points[1][0] - points[0][0],
      points[2][1] - points[1][1],
    ];
    const [fromWidth, fromHeight] = size(current);
    const [toWidth, toHeight] = size(target);
    const ratio = (a, b) => Math.max(a, b) / Math.max(1, Math.min(a, b));
    if (
      ratio(fromWidth, toWidth) > SIZE_SNAP_RATIO ||
      ratio(fromHeight, toHeight) > SIZE_SNAP_RATIO
    ) {
      // Morphing between very different sizes (an image and a text cell) looks like a glitch:
      // take the new size at once. A small cursor slides into place; a large outline just appears.
      if (toWidth * toHeight > fromWidth * fromHeight) {
        animation = null;
        corners = target;
        draw();
        return;
      }
      animation = target.map((corner) => ({
        from: [corner[0] - toX + fromX, corner[1] - toY + fromY],
        to: corner,
        start,
        duration: SLOW_MS,
      }));
      frame = requestAnimationFrame(step);
      return;
    }
    animation = target.map((corner, cornerIndex) => {
      const offsetX = corner[0] - toX;
      const offsetY = corner[1] - toY;
      const alignment =
        (offsetX * (toX - fromX) + offsetY * (toY - fromY)) /
        ((Math.hypot(offsetX, offsetY) || 1) * travel);
      // Leading corners arrive first and trailing corners lag behind, producing the smear.
      const duration = FAST_MS + ((SLOW_MS - FAST_MS) * (1 - alignment)) / 2;
      return { from: current[cornerIndex], to: corner, start, duration };
    });
    frame = requestAnimationFrame(step);
  }

  function targetCorners() {
    const rect = rectAt(index);
    if (!rect) return null;
    const bounds = viewport.getBoundingClientRect();
    const x = rect.left - bounds.left - viewport.clientLeft + viewport.scrollLeft;
    const y = rect.top - bounds.top - viewport.clientTop + viewport.scrollTop;
    return [
      [x, y],
      [x + rect.width, y],
      [x + rect.width, y + rect.height],
      [x, y + rect.height],
    ];
  }

  function render(instant) {
    cursorElement = viewport?.querySelector(".nvim-cursor");
    if (!cursorElement) return;
    const target = index >= 0 ? targetCorners() : null;
    if (!target) {
      delete cursorElement.dataset.visible;
      return;
    }
    const atom = locate(index);
    cursorElement.classList.toggle(
      "on-media",
      atom.element && !atom.node.matches(".raw-line"),
    );
    animateTo(target, instant);
    paintVisual();
  }

  function currentLocation() {
    return documentKey && index >= 0
      ? { ...documentKey, index, scrollTop: viewport.scrollTop }
      : null;
  }

  function setIndex(
    position,
    { scroll = true, instant = false, keepColumn = false } = {},
  ) {
    if (position < 0 || position >= total) return false;
    index = position;
    if (scroll) revealHorizontally(index);
    const rect = rectAt(index);
    if (!rect) return false;
    if (!keepColumn)
      desiredX =
        (rect.left + rect.right) / 2 - viewport.getBoundingClientRect().left;
    if (scroll) ensureVisible(rect);
    render(instant);
    lastLocation = currentLocation();
    moved();
    return true;
  }

  function firstVisibleIn(element) {
    const atom = atoms.find(
      (candidate) =>
        element === candidate.node || element.contains(candidate.node),
    );
    return atom ? (nextVisible(atom.start - 1, 1)?.[0] ?? -1) : -1;
  }

  function pushJump(location) {
    if (!location) return;
    back.push(location);
    if (back.length > JUMP_LIMIT) back.shift();
    forward.length = 0;
  }

  function recordJump() {
    pushJump(currentLocation());
  }

  function restore(location) {
    if (documentKey && location.repository === documentKey.repository) {
      scrollTo(location.scrollTop);
      const target = Math.min(location.index, total - 1);
      if (!setIndex(rectAt(target) ? target : (nextVisible(target, 1)?.[0] ?? 0)))
        placeNearTop();
      return;
    }
    pendingRestore = location;
    navigate(location.repository);
  }

  function placeNearTop() {
    const position = positionAtY(
      viewport.getBoundingClientRect().top + scrollMargin(),
    );
    if (position >= 0) setIndex(position, { scroll: false, instant: true });
  }

  function refresh() {
    viewport = document.querySelector(viewportSelector);
    root = viewport?.querySelector(rootSelector);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    animation = null;
    corners = null;
    const previous = lastLocation;
    build();
    if (!root || !total) {
      index = -1;
      render(true);
      return;
    }
    const key = {
      repository: documentOf(/** @type {HTMLElement} */ (root)),
      raw: root.classList.contains("raw-readme"),
    };
    const sameDocument = documentKey?.repository === key.repository;
    const sameView = sameDocument && documentKey.raw === key.raw;
    const restoring =
      pendingRestore?.repository === key.repository ? pendingRestore : null;
    pendingRestore = null;
    if (!sameView) endVisual();
    documentKey = key;
    if (restoring) {
      restore(restoring);
    } else if (sameView && previous) {
      setIndex(Math.min(previous.index, total - 1), {
        scroll: false,
        instant: true,
        keepColumn: true,
      });
    } else if (sameDocument) {
      placeNearTop();
    } else {
      pushJump(previous);
      scrollTo(0);
      const first = nextVisible(-1, 1);
      if (first) setIndex(first[0], { instant: true });
    }
  }

  function invalidate() {
    if (!root?.isConnected) return;
    const position = index;
    build();
    if (total)
      setIndex(Math.min(position, total - 1), {
        scroll: false,
        instant: true,
        keepColumn: true,
      });
  }

  function move(motion) {
    if (!viewport?.isConnected || index < 0) return false;
    if (!rectAt(index)) placeNearTop();
    let target = index;
    let keepColumn = false;
    switch (motion) {
      case "left":
      case "right": {
        const next = nextVisible(index, motion === "left" ? -1 : 1);
        if (next && sameLine(next[1], rectAt(index))) target = next[0];
        break;
      }
      case "down":
      case "up":
        target = lineStep(index, motion === "down" ? 1 : -1);
        keepColumn = true;
        break;
      case "halfDown":
      case "halfUp": {
        const direction = motion === "halfDown" ? 1 : -1;
        const rect = rectAt(index);
        const half = Math.round(viewport.clientHeight / 2) * direction;
        const moved = scrollTo(viewport.scrollTop + half);
        target = positionAtY(centerY(rect) - moved + half);
        keepColumn = true;
        break;
      }
      case "wordForward":
        target = wordForward(index);
        break;
      case "wordBackward":
        target = wordBackward(index);
        break;
      case "wordEnd":
        target = wordEnd(index);
        break;
      case "lineStart":
        target = lineEdge(index, -1);
        break;
      case "lineEnd":
        target = lineEdge(index, 1);
        desiredX = Infinity;
        keepColumn = true;
        break;
      case "top":
      case "bottom": {
        recordJump();
        const edge =
          motion === "top" ? nextVisible(-1, 1) : nextVisible(total, -1);
        if (!edge) return false;
        scrollTo(motion === "top" ? 0 : viewport.scrollHeight);
        target = motion === "top" ? edge[0] : lineEdge(edge[0], -1);
        break;
      }
      default:
        return false;
    }
    return target >= 0 && setIndex(target, { keepColumn });
  }

  const WORD_MOTIONS = {
    wordForward: [wordForward, classOf],
    bigWordForward: [wordForward, bigClassOf],
    wordBackward: [wordBackward, classOf],
    bigWordBackward: [wordBackward, bigClassOf],
    wordEnd: [wordEnd, classOf],
    bigWordEnd: [wordEnd, bigClassOf],
    wordEndBackward: [wordEndBackward, classOf],
    bigWordEndBackward: [wordEndBackward, bigClassOf],
  };

  const JUMP_MOTIONS = new Set([
    "goToLine",
    "matchOrPercent",
    "screenTop",
    "screenMiddle",
    "screenBottom",
    "sentenceForward",
    "sentenceBackward",
    "paragraphForward",
    "paragraphBackward",
    "sectionEndForward",
    "sectionEndBackward",
    "flashJump",
  ]);

  // Vim motions from `:help motion.txt`; `count` repeats the motion or selects a line, like Neovim.
  /** @param {{ hasCount?: boolean, argument?: string, target?: number }} [options] */
  function motion(name, count = 1, options = {}) {
    const { hasCount = false, argument } = options;
    if (!viewport?.isConnected || index < 0) return false;
    if (!rectAt(index)) placeNearTop();
    if (name === "goToLineOrTop" || name === "goToLineOrBottom") {
      if (!hasCount) return move(name === "goToLineOrTop" ? "top" : "bottom");
      name = "goToLine";
    }
    const forward = /Forward$|^down$|^right$/.test(name);
    const direction = forward ? 1 : -1;
    let target = index;
    let keepColumn = false;
    if (name in WORD_MOTIONS) {
      const [step, kindOf] = WORD_MOTIONS[name];
      target = repeat(index, count, (position) => step(position, kindOf));
    } else {
      switch (name) {
        case "left":
        case "right": {
          const lineRect = rectAt(index);
          target = repeat(index, count, (position) => {
            const next = nextVisible(position, direction);
            return next && sameLine(next[1], lineRect) ? next[0] : position;
          });
          break;
        }
        case "down":
        case "up":
          target = repeat(index, count, (position) =>
            lineStep(position, direction),
          );
          keepColumn = true;
          break;
        case "lineStart":
          target = lineEdge(index, -1);
          break;
        case "firstNonBlank":
          target = firstNonBlank(index);
          break;
        case "lineEnd":
          target = lineEdge(
            repeat(index, count - 1, (position) => lineStep(position, 1)),
            1,
          );
          desiredX = Infinity;
          keepColumn = true;
          break;
        case "lastNonBlank":
          target = lastNonBlank(
            repeat(index, count - 1, (position) => lineStep(position, 1)),
          );
          break;
        case "column":
          target = columnOnLine(index, count);
          break;
        case "nextLineStart":
          target = firstNonBlank(
            repeat(index, count, (position) => lineStep(position, 1)),
          );
          break;
        case "currentLineStart":
          target = firstNonBlank(
            repeat(index, count - 1, (position) => lineStep(position, 1)),
          );
          break;
        case "screenColumnMiddle":
          target = atX(index, viewport.clientWidth / 2);
          break;
        case "textMiddle": {
          const start = rectAt(lineEdge(index, -1));
          const end = rectAt(lineEdge(index, 1));
          const fraction = hasCount ? Math.min(count, 100) / 100 : 0.5;
          if (start && end) {
            target = atX(
              index,
              start.left +
                (end.right - start.left) * fraction -
                viewport.getBoundingClientRect().left,
            );
          }
          break;
        }
        case "findForward":
        case "findBackward":
        case "tillForward":
        case "tillBackward":
          lastFind = {
            direction,
            till: name.startsWith("till"),
            character: argument,
          };
          target = findCharacter(
            index,
            direction,
            argument,
            lastFind.till,
            count,
            false,
          );
          break;
        case "repeatFind":
        case "repeatFindReverse":
          if (!lastFind) return false;
          target = findCharacter(
            index,
            name === "repeatFind" ? lastFind.direction : -lastFind.direction,
            lastFind.character,
            lastFind.till,
            count,
            true,
          );
          break;
        case "goToLine":
          target = lineTarget(count);
          break;
        case "flashJump":
          target = options.target ?? -1;
          break;
        case "matchOrPercent":
          target = hasCount
            ? lineTarget(Math.ceil((Math.min(count, 100) * lineCount()) / 100))
            : matchBracket(index);
          break;
        case "screenTop":
        case "screenMiddle":
        case "screenBottom":
          target = screenLine(name, count);
          break;
        case "sentenceForward":
        case "sentenceBackward":
          target = repeat(index, count, (position) =>
            sentenceStep(position, direction),
          );
          break;
        case "paragraphForward":
        case "paragraphBackward":
          target = repeat(index, count, (position) =>
            paragraphStep(position, direction),
          );
          break;
        case "headingForward":
        case "headingBackward": {
          let jumped = false;
          for (let step = 0; step < count && jumpHeading(direction); step++)
            jumped = true;
          return jumped;
        }
        case "sectionEndForward":
        case "sectionEndBackward":
          target = repeat(index, count, (position) =>
            sectionEnd(position, direction),
          );
          break;
        case "unmatchedParenForward":
        case "unmatchedParenBackward":
          target = repeat(index, count, (position) =>
            unmatchedBracket(position, "(", direction),
          );
          break;
        case "unmatchedBraceForward":
        case "unmatchedBraceBackward":
          target = repeat(index, count, (position) =>
            unmatchedBracket(position, "{", direction),
          );
          break;
        case "setMark":
          return setMark(argument);
        case "markLine":
          return goToMark(argument, true);
        case "markExact":
          return goToMark(argument, false);
        case "scrollCursorTop":
        case "scrollCursorMiddle":
        case "scrollCursorBottom":
        case "scrollLineTop":
        case "scrollLineMiddle":
        case "scrollLineBottom":
          return scrollCursor(name, hasCount ? count : 0);
        default:
          return false;
      }
    }
    if (target < 0 || target === index) return false;
    if (JUMP_MOTIONS.has(name)) recordJump();
    return setIndex(target, { keepColumn });
  }

  // `zt`/`zz`/`zb` (`:help scroll-cursor`) scroll the view around the cursor line, honoring 'scrolloff';
  // the `z<CR>`/`z.`/`z-` "line" forms also move to the first non-blank. A count picks the line first.
  function scrollCursor(name, line) {
    let target = line ? lineTarget(line) : index;
    if (target < 0) return false;
    const leaveColumn = name.startsWith("scrollCursor");
    if (!leaveColumn) target = firstNonBlank(target);
    if (target !== index && !setIndex(target, { keepColumn: leaveColumn }))
      return false;
    const rect = rectAt(index);
    if (!rect) return false;
    const bounds = viewport.getBoundingClientRect();
    const margin = scrollMargin();
    const offset = /Top$/.test(name)
      ? rect.top - bounds.top - margin
      : /Bottom$/.test(name)
        ? rect.bottom - bounds.bottom + margin
        : (rect.top + rect.bottom) / 2 - (bounds.top + viewport.clientHeight / 2);
    scrollTo(viewport.scrollTop + offset);
    return setIndex(index, { scroll: false, keepColumn: true });
  }

  function jumpToElement(element) {
    if (!viewport?.isConnected || !element || !root?.contains(element))
      return false;
    const target = firstVisibleIn(element);
    if (target < 0) return false;
    recordJump();
    const bounds = viewport.getBoundingClientRect();
    scrollTo(
      viewport.scrollTop + element.getBoundingClientRect().top - bounds.top - 16,
    );
    return setIndex(target);
  }

  function jumpHeading(direction) {
    if (!viewport?.isConnected || index < 0) return false;
    const headings = headingElements();

    const top = rectAt(index)?.top ?? viewport.getBoundingClientRect().top;
    const tops = headings.map(
      (heading) => heading.getBoundingClientRect().top - top,
    );
    const found =
      direction > 0
        ? tops.findIndex((offset) => offset > 1)
        : tops.findLastIndex((offset) => offset < -1);
    return found >= 0 && jumpToElement(headings[found]);
  }

  function jump(direction) {
    const source = direction < 0 ? back : forward;
    const target = direction < 0 ? forward : back;
    const location = currentLocation();
    if (!source.length || !location) return false;
    target.push(location);
    restore(source.pop());
    return true;
  }

  function urlUnderCursor(atom) {
    if (atom.element) return null;
    const offset = index - atom.start;
    for (const match of atom.node.data.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
      if (offset < match.index || offset >= match.index + match[0].length)
        continue;
      let url = match[0].replace(/[.,;:!?]+$/, "");
      while (
        /[)\]]$/.test(url) &&
        (url.match(/[(\[]/g)?.length ?? 0) < (url.match(/[)\]]/g)?.length ?? 0)
      ) {
        url = url.slice(0, -1);
      }
      return url;
    }
    return null;
  }

  function imageUnderCursor() {
    if (!viewport?.isConnected || index < 0) return null;
    const atom = locate(index);
    return atom.element && canPreview(atom.node) ? atom.node : null;
  }

  function followLink() {
    if (!viewport?.isConnected || index < 0) return false;
    const atom = locate(index);
    const element = atom.element ? atom.node : atom.node.parentElement;
    const link = element?.closest("a");
    if (link && root.contains(link)) {
      const href = link.getAttribute("href") ?? "";
      if (
        "internalRepo" in link.dataset ||
        "missingAnchor" in link.dataset ||
        "helpTag" in link.dataset
      ) {
        link.click();
        return true;
      }
      if (href.startsWith("#")) {
        return jumpToElement(
          document.getElementById(decodeURIComponent(href.slice(1))),
        );
      }
      if (link.href) {
        openInNewTab(link.href);
        return true;
      }
    }
    if (atom.element && atom.node instanceof HTMLVideoElement) {
      if (atom.node.paused) atom.node.play()?.catch(() => {});
      else atom.node.pause();
      return true;
    }
    if (
      atom.element &&
      atom.node instanceof HTMLImageElement &&
      atom.node.currentSrc
    ) {
      openInNewTab(atom.node.currentSrc);
      return true;
    }
    const url = urlUnderCursor(atom);
    if (!url) return false;
    openInNewTab(url);
    return true;
  }

  function placeAt(x, y, target) {
    if (!viewport?.isConnected || !root?.contains(target) || !total) return false;
    let position = -1;
    const media = target.closest("img, video");
    if (media && nodeIndex.has(media)) {
      position = nodeIndex.get(media).start;
    } else {
      const caret = document.caretPositionFromPoint?.(x, y);
      const fallback = caret ? null : document.caretRangeFromPoint?.(x, y);
      const node = caret?.offsetNode ?? fallback?.startContainer;
      const offset = caret?.offset ?? fallback?.startOffset ?? 0;
      const atom = node && nodeIndex.get(node);
      if (atom && !atom.element) {
        position = atom.start + Math.min(offset, atom.length - 1);
        const previous = rectAt(position - 1);
        if (
          previous &&
          x >= previous.left &&
          x <= previous.right &&
          y >= previous.top &&
          y <= previous.bottom
        )
          position -= 1;
      }
    }
    if (position < 0 || !rectAt(position)) {
      desiredX = x - viewport.getBoundingClientRect().left;
      position = positionAtY(y);
    }
    return position >= 0 && setIndex(position, { scroll: false });
  }

  // Puts the cursor on the first character of `element`, or near the top of the view, without scrolling.
  function placeOn(element) {
    if (!viewport?.isConnected || !total) return false;
    const target = element && root.contains(element) ? firstVisibleIn(element) : -1;
    if (target >= 0) return setIndex(target, { scroll: false, instant: true });
    placeNearTop();
    return index >= 0;
  }

  function sync() {
    if (!viewport?.isConnected || index < 0 || frame) return;
    const target = targetCorners();
    if (!target) return;
    const bounds = viewport.getBoundingClientRect();
    const rect = rectAt(index);
    const margin = scrollMargin() - 2;
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    if (rect.top < bounds.top + margin && viewport.scrollTop > 1) {
      const position = positionAtY(bounds.top + margin);
      if (position >= 0 && position !== index)
        return void setIndex(position, { scroll: false, keepColumn: true });
    } else if (
      rect.bottom > bounds.bottom - margin &&
      viewport.scrollTop < maxScroll - 1
    ) {
      const position = positionAtY(bounds.bottom - margin - lineHeight());
      if (position >= 0 && position !== index)
        return void setIndex(position, { scroll: false, keepColumn: true });
    }
    if (
      corners &&
      corners.every(
        ([x, y], cornerIndex) =>
          Math.abs(x - target[cornerIndex][0]) < 0.5 &&
          Math.abs(y - target[cornerIndex][1]) < 0.5,
      )
    )
      return;
    corners = target;
    draw();
  }

  function position() {
    if (!viewport?.isConnected || index < 0 || !root) return null;
    const rect = rectAt(index);
    if (!rect) return null;
    const atom = locate(index);
    if (documentKey?.raw) {
      const line = atom.element
        ? atom.node
        : atom.node.parentElement?.closest(".raw-line");
      return {
        line: (rawLineIndex.get(line) ?? 0) + 1,
        column: atom.element ? 1 : index - atom.start + 1,
        top: rect.top,
      };
    }
    if (columnCache?.index !== index) {
      let column = 1;
      let current = index;
      let previous;
      while (
        (previous = nextVisible(current, -1)) &&
        sameLine(previous[1], rect)
      ) {
        current = previous[0];
        column++;
      }
      columnCache = { index, column };
    }
    const line =
      Math.floor((rect.top - root.getBoundingClientRect().top) / lineHeight()) +
      1;
    return { line, column: columnCache.column, top: rect.top };
  }

  // ------------------------------------------------------------ Visual mode and yanking

  const LINEWISE_MOTIONS = new Set([
    "down",
    "up",
    "nextLineStart",
    "currentLineStart",
    "goToLine",
    "goToLineOrTop",
    "goToLineOrBottom",
    "screenTop",
    "screenMiddle",
    "screenBottom",
    "markLine",
  ]);

  const INCLUSIVE_MOTIONS = new Set([
    "wordEnd",
    "bigWordEnd",
    "wordEndBackward",
    "bigWordEndBackward",
    "lineEnd",
    "lastNonBlank",
    "findForward",
    "tillForward",
    // flash.nvim jumps are inclusive after an operator.
    "flashJump",
  ]);

  function highlightNamed(name) {
    const registry = globalThis.CSS?.highlights;
    if (!registry || typeof Highlight !== "function") return null;
    let highlight = registry.get(name);
    if (!highlight) {
      highlight = new Highlight();
      registry.set(name, highlight);
    }
    return highlight;
  }

  function domRange(start, end) {
    const result = document.createRange();
    const first = locate(start);
    if (first.element) result.setStartBefore(first.node);
    else result.setStart(first.node, start - first.start);
    const last = locate(end);
    if (last.element) {
      result.setEndAfter(last.node);
    } else {
      const offset = end - last.start;
      const width = isHighSurrogate(last.node.data.charCodeAt(offset)) ? 2 : 1;
      result.setEnd(last.node, Math.min(last.length, offset + width));
    }
    return result;
  }

  function selection(anchor, head, linewise) {
    let start = Math.min(anchor, head);
    let end = Math.max(anchor, head);
    if (linewise) {
      start = lineEdge(start, -1);
      end = lineEdge(end, 1);
    }
    return [start, end];
  }

  function paintVisual() {
    const highlight = highlightNamed("nvim-visual");
    if (!highlight) return;
    if (visualRange) highlight.delete(visualRange);
    visualRange = null;
    if (!visual || index < 0 || !total) return;
    visual.anchor = Math.min(visual.anchor, total - 1);
    visualRange = domRange(...selection(visual.anchor, index, visual.kind === "line"));
    highlight.add(visualRange);
  }

  function flashYank(start, end) {
    const highlight = highlightNamed("nvim-yank");
    if (!highlight) return;
    clearTimeout(yankTimer);
    if (yankRange) highlight.delete(yankRange);
    const flashed = domRange(start, end);
    yankRange = flashed;
    highlight.add(flashed);
    yankTimer = setTimeout(() => {
      highlight.delete(flashed);
      if (yankRange === flashed) yankRange = null;
    }, YANK_FLASH_MS);
  }

  function visualMode() {
    return visual?.kind ?? null;
  }

  function startVisual(kind) {
    if (!viewport?.isConnected || index < 0) return false;
    if (!rectAt(index)) placeNearTop();
    visual = { anchor: index, kind };
    paintVisual();
    modeChanged(kind);
    return true;
  }

  /**
   * Turns a DOM range, such as a mouse selection, into a Visual selection like Vim with 'mouse' set. The
   * cursor goes to the end the user dragged to (`forward` false puts it at the start). Returns false when
   * the range covers no text of this document.
   * @param {Range} domSelection
   * @param {boolean} forward
   * @param {"char" | "line"} kind
   */
  function selectRange(domSelection, forward, kind) {
    if (!viewport?.isConnected || !total || !root?.contains(domSelection.commonAncestorContainer))
      return false;
    let first = -1;
    let last = -1;
    for (const atom of atoms) {
      if (!domSelection.intersectsNode(atom.node)) continue;
      let from = atom.start;
      let to = atom.start + atom.length - 1;
      if (!atom.element) {
        if (atom.node === domSelection.startContainer) from += domSelection.startOffset;
        if (atom.node === domSelection.endContainer)
          to = atom.start + domSelection.endOffset - 1;
      }
      if (to < from) continue;
      if (first < 0) first = from;
      last = to;
    }
    first = first < 0 ? -1 : (nextVisible(first - 1, 1)?.[0] ?? -1);
    last = last < 0 ? -1 : (nextVisible(last + 1, -1)?.[0] ?? -1);
    if (first < 0 || last < first) return false;
    const [anchor, head] = forward ? [first, last] : [last, first];
    if (!setIndex(head, { scroll: false })) return false;
    visual = { anchor, kind };
    paintVisual();
    modeChanged(kind);
    return true;
  }

  /** `v` and `V` inside Visual mode: the same kind ends it, the other kind switches to it. */
  function toggleVisual(kind) {
    if (!visual) return startVisual(kind);
    if (visual.kind === kind) {
      endVisual();
      return true;
    }
    visual.kind = kind;
    paintVisual();
    modeChanged(kind);
    return true;
  }

  function endVisual() {
    if (!visual) return;
    if (documentKey)
      lastVisual = { ...documentKey, anchor: visual.anchor, index, kind: visual.kind };
    visual = null;
    paintVisual();
    modeChanged(null);
  }

  // `o`: the cursor moves to the other end of the selection.
  function swapVisual() {
    if (!visual) return false;
    const other = visual.anchor;
    visual.anchor = index;
    return setIndex(other);
  }

  // `gv`: select the previous Visual area of this document again.
  function reselectVisual() {
    if (
      !viewport?.isConnected ||
      !lastVisual ||
      lastVisual.repository !== documentKey?.repository ||
      lastVisual.raw !== documentKey?.raw
    )
      return false;
    const previous = lastVisual;
    visual = { anchor: Math.min(previous.anchor, total - 1), kind: previous.kind };
    setIndex(Math.min(previous.index, total - 1));
    modeChanged(visual.kind);
    return true;
  }

  function lineOf(position) {
    const atom = locate(position);
    if (isRaw()) {
      const line = atom.element
        ? atom.node
        : atom.node.parentElement?.closest(".raw-line");
      return rawLineIndex.get(line) ?? 0;
    }
    const rect = rectAt(position);
    return rect
      ? Math.floor((rect.top - root.getBoundingClientRect().top) / lineHeight())
      : 0;
  }

  function lineKey(atom) {
    if (!isRaw()) return blockOf(atom);
    return atom.element
      ? atom.node
      : (atom.node.parentElement?.closest(".raw-line") ?? null);
  }

  /**
   * The text from `start` to `end`, inclusive, as the page shows it: rendered blocks become lines, table
   * cells are separated by tabs, and whitespace outside code blocks collapses like the browser renders it.
   */
  function textBetween(start, end) {
    const raw = isRaw();
    let text = "";
    let previousKey;
    let previousCell = null;
    let space = false;
    for (
      let atomAt = atomIndex(start);
      atomAt < atoms.length && atoms[atomAt].start <= end;
      atomAt++
    ) {
      const atom = atoms[atomAt];
      if (atom.element) {
        if (!raw) continue;
        if (previousKey !== undefined) text += "\n";
        previousKey = atom.node;
        continue;
      }
      const preformatted = !raw && !!atom.node.parentElement?.closest("pre");
      let piece = atom.node.data.slice(
        Math.max(start, atom.start) - atom.start,
        Math.min(end + 1, atom.start + atom.length) - atom.start,
      );
      if (!raw && !preformatted) {
        piece = piece.replace(/\s+/g, " ");
        if (piece === " ") {
          space = previousKey !== undefined;
          continue;
        }
      }
      const key = lineKey(atom);
      const cell = raw ? null : (atom.node.parentElement?.closest("td, th") ?? null);
      if (previousKey !== undefined && key !== previousKey) {
        text = text.replace(/[ \t]+$/, "");
        if (cell && previousCell && cell.parentElement === previousCell.parentElement)
          text += "\t";
        else if (!text.endsWith("\n")) text += "\n";
        if (!preformatted) piece = piece.replace(/^ /, "");
      } else if (space && !/^\s/.test(piece) && !/\s$/.test(text)) {
        text += " ";
      }
      if (previousKey === undefined && !preformatted && !raw)
        piece = piece.replace(/^ /, "");
      space = false;
      text += piece;
      previousKey = key;
      previousCell = cell;
    }
    return raw ? text : text.replace(/[ \t]+$/, "");
  }

  /** Screen lines from `start` to `end`; tall headings and block margins still count as one line each. */
  function lineCount(start, end) {
    if (isRaw()) return Math.abs(lineOf(end) - lineOf(start)) + 1;
    let rect = rectAt(start);
    if (!rect) return 1;
    let count = 1;
    let current = start;
    let next;
    while ((next = nextVisible(current, 1)) && next[0] <= end) {
      if (!sameLine(next[1], rect)) {
        count++;
        rect = next[1];
      }
      current = next[0];
    }
    return count;
  }

  function yankResult(start, end, linewise) {
    flashYank(start, end);
    return {
      text: textBetween(start, end) + (linewise ? "\n" : ""),
      lines: lineCount(start, end),
      linewise,
    };
  }

  function markInDocument(letter) {
    const location =
      letter === "'" || letter === "`"
        ? back.at(-1)
        : /[A-Z]/.test(letter)
          ? globalMarks.get(letter)
          : localMarks.get(documentKey?.repository)?.get(letter);
    return location?.repository === documentKey?.repository;
  }

  /**
   * `y{motion}` (`:help y`): copies the text the motion moves over, using Vim's linewise, inclusive, and
   * exclusive rules. The cursor ends at the start of the yanked text. Returns null when nothing is yanked.
   * @param {{ hasCount?: boolean, argument?: string, target?: number }} [options]
   */
  function yank(name, count = 1, options = {}) {
    if (!viewport?.isConnected || index < 0 || visual) return null;
    if (!rectAt(index)) placeNearTop();
    const origin = index;
    let start;
    let end;
    let linewise = false;
    let cursorAt = origin;
    if (name === "line") {
      [start, end] = [origin, repeat(origin, count - 1, (position) => lineStep(position, 1))];
      linewise = true;
    } else if (name === "textObject") {
      const object = textObject(options.argument ?? "", count);
      if (!object) return null;
      [start, end] = object;
      linewise = object.linewise;
      cursorAt = start;
    } else {
      if ((name === "markLine" || name === "markExact") && !markInDocument(options.argument ?? ""))
        return null;
      const findInclusive =
        (name === "repeatFind" || name === "repeatFindReverse") &&
        lastFind !== null &&
        (name === "repeatFind" ? lastFind.direction : -lastFind.direction) > 0;
      const inclusive =
        INCLUSIVE_MOTIONS.has(name) ||
        findInclusive ||
        (name === "matchOrPercent" && !options.hasCount);
      linewise =
        LINEWISE_MOTIONS.has(name) || (name === "matchOrPercent" && !!options.hasCount);
      if (!motion(name, count, options)) {
        // `yl` and `y$` still copy the character under the cursor at the end of a line.
        if (!(inclusive || name === "right") || index !== origin) return null;
        return yankResult(origin, origin, false);
      }
      const target = index;
      start = Math.min(origin, target);
      end = Math.max(origin, target);
      if (linewise) {
        cursorAt = target < origin ? target : origin;
      } else {
        cursorAt = start;
        if (!inclusive) {
          const last = nextVisible(end, -1)?.[0];
          if (last === undefined || last < start) {
            setIndex(origin);
            return null;
          }
          const endsLine = lineEdge(end, -1) === end && lineOf(end) !== lineOf(start);
          end = last;
          if (name === "wordForward" || name === "bigWordForward") {
            // `:help word` special case: `yw` on the last word of a line stops at its end.
            if (lineOf(target) !== lineOf(start))
              while (end > start && isBlankAt(end)) end = nextVisible(end, -1)?.[0] ?? start;
          } else if (endsLine && start <= firstNonBlank(start)) {
            linewise = true;
          }
        }
      }
    }
    if (index !== cursorAt) setIndex(cursorAt);
    if (linewise) [start, end] = selection(start, end, true);
    return yankResult(start, end, linewise);
  }

  /** `y` (or `Y`, linewise) in Visual mode: copy the selection and return to Normal mode. */
  function yankVisual(linewise = visual?.kind === "line") {
    if (!visual || index < 0) return null;
    const [start, end] = selection(visual.anchor, index, linewise);
    const cursorAt = Math.min(visual.anchor, index);
    endVisual();
    setIndex(cursorAt);
    return yankResult(start, end, linewise);
  }

  /** A text object (`:help text-objects`) in Visual mode extends the selection over it. */
  function selectObject(argument, count = 1) {
    if (!visual || index < 0) return false;
    const object = textObject(argument, count);
    if (!object) return false;
    visual.anchor = object[0];
    if (object.linewise && visual.kind !== "line") {
      visual.kind = "line";
      modeChanged("line");
    }
    return setIndex(object[1]);
  }

  function textObject(argument, count) {
    if (!viewport?.isConnected || index < 0 || argument.length !== 2) return null;
    const around = argument[0] === "a";
    const kind = argument[1];
    switch (kind) {
      case "w":
        return wordObject(around, classOf, count);
      case "W":
        return wordObject(around, bigClassOf, count);
      case "s":
        return sentenceObject(around, count);
      case "p":
        return paragraphObject(around, count);
      case "(":
      case ")":
      case "b":
        return bracketObject(around, "(", ")", count);
      case "[":
      case "]":
        return bracketObject(around, "[", "]", count);
      case "{":
      case "}":
      case "B":
        return bracketObject(around, "{", "}", count);
      case "<":
      case ">":
        return bracketObject(around, "<", ">", count);
      case '"':
      case "'":
      case "`":
        return quoteObject(around, kind);
      default:
        return null;
    }
  }

  function wordObject(around, kindOf, count) {
    const lineRect = rectAt(index);
    if (!lineRect) return null;
    const onLine = (next) => next && sameLine(next[1], lineRect);
    const extend = (position, direction) => {
      const kind = kindOf(position);
      let current = position;
      let next;
      while (onLine((next = nextVisible(current, direction))) && kindOf(next[0]) === kind)
        current = next[0];
      return current;
    };
    let start = extend(index, -1);
    let end = extend(index, 1);
    const step = () => {
      const next = nextVisible(end, 1);
      if (!onLine(next)) return false;
      end = extend(next[0], 1);
      return true;
    };
    const blankNext = () => {
      const next = nextVisible(end, 1);
      return onLine(next) && kindOf(next[0]) === 0;
    };
    if (!around) {
      for (let extra = 1; extra < count && step(); extra++);
      return [start, end];
    }
    if (kindOf(index) === 0) {
      step();
    } else if (blankNext()) {
      step();
    } else {
      const previous = nextVisible(start, -1);
      if (onLine(previous) && kindOf(previous[0]) === 0) start = extend(previous[0], -1);
    }
    for (let extra = 1; extra < count && step(); extra++) if (blankNext()) step();
    return [start, end];
  }

  function sentenceObject(around, count) {
    let start = index;
    while (start > 0 && !isSentenceStart(start)) start--;
    start = rectAt(start) ? start : (nextVisible(start, 1)?.[0] ?? index);
    let stop = start;
    for (let step = 0; step < count; step++) {
      const next = sentenceStep(stop, 1);
      if (next <= stop) break;
      stop = next;
    }
    let end = stop > start && isSentenceStart(stop) ? (nextVisible(stop, -1)?.[0] ?? stop) : stop;
    if (!around) while (end > start && isBlankAt(end)) end = nextVisible(end, -1)?.[0] ?? start;
    return [start, end];
  }

  function paragraphObject(around, count) {
    const raw = isRaw();
    const groupOf = (atom) => {
      const block = blockOf(atom);
      return raw && typeof block === "number" && block < 0 ? "blank" : block;
    };
    const skip = (atom) => !raw && !hasContent(atom);
    let low = atomIndex(index);
    let high = low;
    const group = groupOf(atoms[low]);
    if (group === null) return null;
    while (low > 0 && groupOf(atoms[low - 1]) === group) low--;
    while (high < atoms.length - 1 && groupOf(atoms[high + 1]) === group) high++;
    // Moves `high` over the next group, skipping the whitespace between rendered blocks.
    const nextGroup = () => {
      let next = high + 1;
      while (next < atoms.length && skip(atoms[next])) next++;
      if (next >= atoms.length) return false;
      const following = groupOf(atoms[next]);
      high = next;
      while (high < atoms.length - 1 && groupOf(atoms[high + 1]) === following) high++;
      return true;
    };
    const blankAt = (at) => at >= 0 && at < atoms.length && groupOf(atoms[at]) === "blank";
    const extra = around ? count * 2 - 1 : count - 1;
    if (around && group !== "blank" && !blankAt(high + 1)) {
      // `ap` takes the blank lines before the paragraph when none follow it.
      while (blankAt(low - 1)) low--;
      for (let step = 1; step < count && nextGroup(); step++);
    } else {
      for (let step = 0; step < extra && nextGroup(); step++);
    }
    const start = nextVisible(atoms[low].start - 1, 1)?.[0];
    const end = nextVisible(atoms[high].start + atoms[high].length, -1)?.[0];
    if (start === undefined || end === undefined || end < start) return null;
    return Object.assign([start, end], { linewise: true });
  }

  function bracketObject(around, open, close, count) {
    let start = -1;
    let depth = 0;
    let remaining = count;
    for (let position = index; position >= 0; position--) {
      const character = charAt(position);
      if (character === close && position !== index) depth++;
      else if (character === open) {
        if (depth > 0) depth--;
        else if (--remaining === 0) {
          start = position;
          break;
        }
      }
    }
    if (start < 0) return null;
    let end = -1;
    depth = 0;
    for (let position = start + 1; position < total; position++) {
      const character = charAt(position);
      if (character === open) depth++;
      else if (character === close && depth-- === 0) {
        end = position;
        break;
      }
    }
    if (end < 0) return null;
    if (around) return [start, end];
    const inner = nextVisible(start, 1)?.[0];
    const last = nextVisible(end, -1)?.[0];
    return inner === undefined || last === undefined || inner > last ? null : [inner, last];
  }

  function quoteObject(around, quote) {
    const lineRect = rectAt(index);
    if (!lineRect) return null;
    const quotes = [];
    for (
      let current = [lineEdge(index, -1), lineRect], next;
      current && sameLine(current[1], lineRect);
      current = next
    ) {
      if (charAt(current[0]) === quote && charAt(current[0] - 1) !== "\\")
        quotes.push(current[0]);
      next = nextVisible(current[0], 1);
    }
    let pair = null;
    for (let at = 0; at + 1 < quotes.length; at += 2) {
      if (quotes[at] <= index && index <= quotes[at + 1]) pair = [quotes[at], quotes[at + 1]];
      else if (!pair && quotes[at] > index) pair = [quotes[at], quotes[at + 1]];
      if (pair) break;
    }
    if (!pair) return null;
    let [start, end] = pair;
    if (!around) {
      const inner = nextVisible(start, 1)?.[0];
      const last = nextVisible(end, -1)?.[0];
      return inner === undefined || last === undefined || inner > last ? null : [inner, last];
    }
    const onLine = (next) => next && sameLine(next[1], lineRect) && isBlankAt(next[0]);
    let next;
    if (onLine((next = nextVisible(end, 1)))) {
      do end = next[0];
      while (onLine((next = nextVisible(end, 1))));
    } else {
      while (onLine((next = nextVisible(start, -1)))) start = next[0];
    }
    return [start, end];
  }

  function dispose() {
    endVisual();
    clearTimeout(yankTimer);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    animation = null;
    navigate = () => {};
    moved = () => {};
    modeChanged = () => {};
  }

  return {
    setNavigator,
    setMoveListener,
    setModeListener,
    visualMode,
    startVisual,
    toggleVisual,
    endVisual,
    swapVisual,
    reselectVisual,
    selectRange,
    yank,
    yankVisual,
    selectObject,
    flashMatches,
    flashRange,
    flashSpan,
    charSearch,
    rawLineCount,
    recordJump,
    refresh,
    invalidate,
    move,
    motion,
    jumpToElement,
    jumpHeading,
    jump,
    imageUnderCursor,
    followLink,
    placeAt,
    placeOn,
    sync,
    position,
    dispose,
  };
}

// The README preview cursor.
export const {
  setNavigator,
  setMoveListener,
  setModeListener,
  visualMode,
  startVisual,
  toggleVisual,
  endVisual,
  swapVisual,
  reselectVisual,
  selectRange,
  yank,
  yankVisual,
  selectObject,
  flashMatches,
  flashRange,
  flashSpan,
  charSearch,
  rawLineCount,
  recordJump,
  refresh,
  invalidate,
  move,
  motion,
  jumpToElement,
  jumpHeading,
  jump,
  imageUnderCursor,
  followLink,
  placeAt,
  placeOn,
  sync,
  position,
  dispose,
} = createCursor();
