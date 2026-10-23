import assert from "node:assert/strict";
import test from "node:test";
import { importSourceModule } from "../client/helpers/import-source-module.mjs";

const cursorUrl = new URL(
  "../../src/nvim/nvim-cursor.js",
  import.meta.url,
);
let nextRepository = 1;

class RawText {
  constructor(data, parentElement) {
    this.nodeType = 3;
    this.data = data;
    this.parentElement = parentElement;
  }
}

class RawLine {
  constructor(text, lineIndex, viewport) {
    this.nodeType = 1;
    this.textNode = text.length ? new RawText(text, this) : null;
    this.children = this.textNode ? [this.textNode] : [];
    this.textContent = text;
    this.lineIndex = lineIndex;
    this.viewport = viewport;
    this.parentElement = null;
    this.dataset = {};
    this.classList = { contains: (name) => name === "raw-line" };
  }
  matches(selector) {
    return selector === ".raw-line";
  }
  closest(selector) {
    return selector === ".raw-line" ? this : null;
  }
  contains(node) {
    return node === this || node === this.textNode;
  }
  getBoundingClientRect() {
    const top =
      this.viewport.bounds.top +
      10 +
      this.lineIndex * 20 -
      this.viewport.scrollTop;
    return { left: 10, right: 18, top, bottom: top + 20, width: 8, height: 20 };
  }
}

class RawRoot {
  constructor(lines, viewport) {
    this.nodeType = 1;
    this.lines = lines.map((text, index) => new RawLine(text, index, viewport));
    this.lines.forEach((line) => {
      line.parentElement = this;
    });
    this.dataset = { repository: `fixture-${nextRepository++}` };
    this.classList = { contains: (name) => name === "raw-readme" };
    this.isConnected = true;
    this.viewport = viewport;
    this.textContent = lines.join("");
  }
  querySelectorAll(selector) {
    return selector === ".raw-line" ? this.lines : [];
  }
  matches(selector) {
    return selector === ".raw-readme";
  }
  contains(node) {
    return this.lines.some((line) => line.contains(node));
  }
  getBoundingClientRect() {
    const top = this.viewport.bounds.top + 10 - this.viewport.scrollTop;
    const height = this.lines.length * 20;
    return {
      left: 10,
      right: 510,
      top,
      bottom: top + height,
      width: 500,
      height,
    };
  }
}

function createRange() {
  let node;
  let start = 0;
  return {
    setStart(value, offset) {
      node = value;
      start = offset;
    },
    setEnd() {},
    getClientRects() {
      const line = node.parentElement;
      const left = 10 + start * 10;
      const top =
        line.viewport.bounds.top +
        10 +
        line.lineIndex * 20 -
        line.viewport.scrollTop;
      return [
        {
          left,
          right: left + 10,
          top,
          bottom: top + 20,
          width: 10,
          height: 20,
        },
      ];
    },
    getBoundingClientRect() {
      const rect = this.getClientRects()[0];
      return (
        rect ?? {
          left: 10,
          right: 10,
          top: 30,
          bottom: 50,
          width: 0,
          height: 20,
        }
      );
    },
  };
}

async function createCursor(lines, { cursorElement = null } = {}) {
  const previous = {
    document: globalThis.document,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
    getComputedStyle: globalThis.getComputedStyle,
  };
  const viewport = {
    bounds: {
      left: 10,
      right: 510,
      top: 20,
      bottom: 320,
      width: 500,
      height: 300,
    },
    isConnected: true,
    clientHeight: 300,
    clientWidth: 500,
    clientLeft: 0,
    clientTop: 0,
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: Math.max(300, lines.length * 20),
    scrollWidth: 500,
    getBoundingClientRect() {
      return this.bounds;
    },
    querySelector(selector) {
      if (selector === ".nvim-cursor") return cursorElement;
      return selector === ".readme-content, .raw-readme" ||
        selector === ".help-content"
        ? this.root
        : null;
    },
    scrollTo({ top }) {
      this.scrollTop = Math.max(
        0,
        Math.min(top, this.scrollHeight - this.clientHeight),
      );
    },
  };
  const root = new RawRoot(lines, viewport);
  viewport.root = root;
  const document = {
    querySelector(selector) {
      return selector === ".preview-scroll" || selector === ".help-scroll"
        ? viewport
        : null;
    },
    createRange,
    createTreeWalker(_root, _whatToShow, filter) {
      const nodes = root.lines
        .flatMap((line) => (line.textNode ? [line.textNode] : [line]))
        .filter((node) => filter.acceptNode(node) === 1);
      let index = 0;
      return { nextNode: () => nodes[index++] ?? null };
    },
  };
  globalThis.document = document;
  globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  globalThis.NodeFilter = {
    SHOW_ELEMENT: 1,
    SHOW_TEXT: 4,
    FILTER_ACCEPT: 1,
    FILTER_REJECT: 2,
    FILTER_SKIP: 3,
  };
  globalThis.getComputedStyle = () => ({
    fontSize: "16px",
    lineHeight: "20px",
    overflowX: "visible",
  });
  const cursor = await importSourceModule(cursorUrl, {}, cursorUrl);
  cursor.refresh();
  return {
    cursor,
    root,
    restore() {
      cursor.dispose();
      globalThis.document = previous.document;
      globalThis.Node = previous.Node;
      globalThis.NodeFilter = previous.NodeFilter;
      globalThis.getComputedStyle = previous.getComputedStyle;
    },
  };
}

test("raw-line motions reach first and last nonblank, line start, and line end columns", async (t) => {
  const { cursor, restore } = await createCursor(["  ab  "]);
  t.after(restore);

  assert.deepEqual(
    { line: cursor.position().line, column: cursor.position().column },
    { line: 1, column: 1 },
  );
  assert.equal(cursor.motion("firstNonBlank"), true);
  assert.equal(cursor.position().column, 3);
  assert.equal(cursor.motion("lastNonBlank"), true);
  assert.equal(cursor.position().column, 4);
  assert.equal(cursor.move("lineStart"), true);
  assert.equal(cursor.position().column, 1);
  assert.equal(cursor.move("lineEnd"), true);
  assert.equal(cursor.position().column, 6);
});

test("raw line count comes from the cursor index only for the indexed raw document", async (t) => {
  const { cursor, root, restore } = await createCursor(["a", "", "b"]);
  t.after(restore);

  assert.equal(cursor.rawLineCount(root), 3);
  assert.equal(cursor.rawLineCount({}), null);
  assert.equal(cursor.rawLineCount(null), null);
});

test("cursor animation resizes its box once per motion and otherwise updates only the clip path", async (t) => {
  const previous = {
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  let pendingFrame = null;
  globalThis.window = {};
  globalThis.requestAnimationFrame = (callback) => {
    pendingFrame = callback;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {
    pendingFrame = null;
  };
  const writes = [];
  const style = new Proxy(
    {},
    {
      set(target, key, value) {
        writes.push(key);
        target[key] = value;
        return true;
      },
    },
  );
  const element = {
    isConnected: true,
    style,
    dataset: {},
    classList: { toggle() {}, contains: () => false },
  };
  const { cursor, restore } = await createCursor(["abc", "def"], {
    cursorElement: element,
  });
  t.after(() => {
    restore();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  assert.equal(element.dataset.visible, "true");
  assert.equal(style.transform, "translate(0px, 10px)");
  assert.equal(style.height, "20px");

  writes.length = 0;
  assert.equal(cursor.move("down"), true);
  const start = performance.now();
  let frames = 0;
  for (const offset of [10, 25, 50, 90, 1000]) {
    assert.ok(pendingFrame, `frame ${frames} should be scheduled`);
    const callback = pendingFrame;
    pendingFrame = null;
    callback(start + offset);
    frames++;
    if (frames === 1) {
      // The first frame's box covers the rest of the path down to line 2's bottom edge.
      const top = Number(/translate\(0px, ([\d.]+)px\)/.exec(style.transform)[1]);
      assert.ok(top > 10 && top < 30);
      assert.equal(top + Number.parseFloat(style.height), 50);
    }
  }
  assert.equal(pendingFrame, null);
  assert.equal(writes.filter((key) => key === "height").length, 2);
  assert.equal(writes.filter((key) => key === "width").length, 2);
  assert.equal(writes.filter((key) => key === "clipPath").length, frames);
  assert.equal(style.transform, "translate(0px, 30px)");
  assert.equal(style.width, "10px");
  assert.equal(style.height, "20px");
  assert.equal(
    style.clipPath,
    "polygon(0px 0px, 10px 0px, 10px 20px, 0px 20px)",
  );
});

test("blank and empty raw lines stay within their own line atoms", async (t) => {
  const whitespace = await createCursor(["   ", "word"]);
  t.after(whitespace.restore);
  assert.equal(whitespace.cursor.motion("firstNonBlank"), true);
  assert.deepEqual(
    [whitespace.cursor.position().line, whitespace.cursor.position().column],
    [1, 3],
  );
  assert.equal(whitespace.cursor.motion("lastNonBlank"), true);
  assert.deepEqual(
    [whitespace.cursor.position().line, whitespace.cursor.position().column],
    [1, 1],
  );

  const blankLine = await createCursor(["one", "", "two"]);
  t.after(blankLine.restore);
  assert.equal(blankLine.cursor.move("down"), true);
  assert.deepEqual(
    [blankLine.cursor.position().line, blankLine.cursor.position().column],
    [2, 1],
  );
  assert.equal(blankLine.cursor.move("down"), true);
  assert.deepEqual(
    [blankLine.cursor.position().line, blankLine.cursor.position().column],
    [3, 1],
  );

  const empty = await createCursor([]);
  t.after(empty.restore);
  assert.equal(empty.cursor.position(), null);
  assert.equal(empty.cursor.move("right"), false);
  assert.equal(empty.cursor.motion("down"), false);
});

test("horizontal movement cannot cross line edges and move and motion report unchanged positions differently", async (t) => {
  const { cursor, restore } = await createCursor(["ab", "cd"]);
  t.after(restore);

  assert.equal(cursor.move("left"), true);
  assert.deepEqual([cursor.position().line, cursor.position().column], [1, 1]);
  assert.equal(cursor.motion("left"), false);
  assert.equal(cursor.move("right"), true);
  assert.equal(cursor.move("right"), true);
  assert.deepEqual([cursor.position().line, cursor.position().column], [1, 2]);
  assert.equal(cursor.motion("right"), false);
  assert.deepEqual([cursor.position().line, cursor.position().column], [1, 2]);
  assert.equal(cursor.move("firstNonBlank"), false);
  assert.equal(cursor.motion("unknownMotion"), false);
  assert.equal(cursor.move("down"), true);
  assert.deepEqual([cursor.position().line, cursor.position().column], [2, 2]);
});

test("vertical motion preserves and restores the desired column through short lines and counts", async (t) => {
  const { cursor, restore } = await createCursor(["abcdef", "xy", "uvwxyz"]);
  t.after(restore);

  for (let step = 0; step < 3; step++) assert.equal(cursor.move("right"), true);
  assert.equal(cursor.position().column, 4);
  assert.equal(cursor.motion("down", 2, { hasCount: true }), true);
  assert.deepEqual([cursor.position().line, cursor.position().column], [3, 4]);
});

test("line end uses the last column vertically until horizontal or first-nonblank motion resets it", async (t) => {
  const horizontalReset = await createCursor(["abcdef", "  xy", "uvwxyz"]);
  t.after(horizontalReset.restore);
  assert.equal(horizontalReset.cursor.move("lineEnd"), true);
  assert.equal(horizontalReset.cursor.position().column, 6);
  assert.equal(horizontalReset.cursor.move("down"), true);
  assert.equal(horizontalReset.cursor.position().column, 4);
  assert.equal(horizontalReset.cursor.move("down"), true);
  assert.equal(horizontalReset.cursor.position().column, 6);
  assert.equal(horizontalReset.cursor.move("left"), true);
  assert.equal(horizontalReset.cursor.move("up"), true);
  assert.equal(horizontalReset.cursor.position().column, 4);
  assert.equal(horizontalReset.cursor.move("down"), true);
  assert.equal(horizontalReset.cursor.position().column, 5);

  const firstNonblankReset = await createCursor(["abcdef", "  xy", "uvwxyz"]);
  t.after(firstNonblankReset.restore);
  assert.equal(firstNonblankReset.cursor.move("lineEnd"), true);
  assert.equal(firstNonblankReset.cursor.move("down"), true);
  assert.equal(firstNonblankReset.cursor.position().column, 4);
  assert.equal(firstNonblankReset.cursor.motion("firstNonBlank"), true);
  assert.equal(firstNonblankReset.cursor.position().column, 3);
  assert.equal(firstNonblankReset.cursor.move("down"), true);
  assert.equal(firstNonblankReset.cursor.position().column, 3);
});

test("createCursor makes cursors with their own selectors and position", async (t) => {
  const { cursor, root, restore } = await createCursor(["a", "b", "c"]);
  t.after(restore);
  const help = cursor.createCursor({
    viewport: ".help-scroll",
    root: ".help-content",
    documentOf: () => "help",
  });
  t.after(() => help.dispose());
  help.refresh();

  assert.equal(help.position().line, 1);
  assert.equal(help.motion("down", 2), true);
  assert.equal(help.position().line, 3);
  assert.equal(cursor.position().line, 1);
  assert.equal(help.placeOn(root.lines[1]), true);
  assert.equal(help.position().line, 2);

  const missing = cursor.createCursor({ viewport: ".missing" });
  missing.refresh();
  assert.equal(missing.position(), null);
});

test("yy, counts, Y, and y{motion} yank like Vim", async (t) => {
  const { cursor, restore } = await createCursor(["one two", "three", "four five"]);
  t.after(restore);

  assert.deepEqual(cursor.yank("line", 1), { text: "one two\n", lines: 1, linewise: true });
  assert.deepEqual(cursor.yank("line", 2), { text: "one two\nthree\n", lines: 2, linewise: true });
  assert.equal(cursor.yank("lineEnd", 1).text, "one two");
  assert.equal(cursor.yank("wordForward", 1).text, "one ");
  assert.equal(cursor.yank("wordEnd", 1).text, "one");
  cursor.motion("wordForward", 1, {});
  // `yw` on the last word of a line stops at the end of the line.
  assert.equal(cursor.yank("wordForward", 1).text, "two");
  cursor.motion("lineStart", 1, {});
  assert.deepEqual(cursor.yank("down", 1), { text: "one two\nthree\n", lines: 2, linewise: true });
  assert.equal(cursor.position().line, 1);

  cursor.motion("goToLineOrBottom", 1, {});
  cursor.motion("lineEnd", 1, {});
  // A yank backwards leaves the cursor at the start of the yanked text.
  assert.equal(cursor.yank("wordBackward", 1).text, "fiv");
  assert.equal(cursor.position().column, 6);
  assert.deepEqual(cursor.yank("goToLineOrTop", 1), {
    text: "one two\nthree\nfour five\n",
    lines: 3,
    linewise: true,
  });
  assert.equal(cursor.position().line, 1);
});

test("Y yanks to the end of the line and yl yanks the last character", async (t) => {
  const { cursor, restore } = await createCursor(["abc"]);
  t.after(restore);

  cursor.motion("lineEnd", 1, {});
  assert.equal(cursor.yank("right", 1).text, "c");
  assert.equal(cursor.yank("lineEnd", 1).text, "c");
});

test("text objects yank words, quotes, and brackets", async (t) => {
  const { cursor, restore } = await createCursor(['say "hi there" (a b) now']);
  t.after(restore);

  assert.equal(cursor.yank("textObject", 1, { argument: "iw" }).text, "say");
  assert.equal(cursor.yank("textObject", 1, { argument: "aw" }).text, "say ");
  cursor.motion("findForward", 1, { argument: "h" });
  assert.equal(cursor.yank("textObject", 1, { argument: 'i"' }).text, "hi there");
  assert.equal(cursor.yank("textObject", 1, { argument: 'a"' }).text, '"hi there" ');
  cursor.motion("findForward", 1, { argument: "b" });
  assert.equal(cursor.yank("textObject", 1, { argument: "i(" }).text, "a b");
  assert.equal(cursor.yank("textObject", 1, { argument: "ab" }).text, "(a b)");
  assert.equal(cursor.yank("textObject", 1, { argument: "i{" }), null);
});

test("Visual mode selects from the anchor to the cursor and yanks it", async (t) => {
  const { cursor, restore } = await createCursor(["alpha beta", "gamma"]);
  t.after(restore);
  const modes = [];
  cursor.setModeListener((kind) => modes.push(kind));

  assert.equal(cursor.toggleVisual("char"), true);
  assert.equal(cursor.visualMode(), "char");
  // No yank of a motion while Visual mode is on.
  assert.equal(cursor.yank("line", 1), null);
  cursor.motion("wordEnd", 2, {});
  cursor.swapVisual();
  assert.equal(cursor.position().column, 1);
  assert.deepEqual(cursor.yankVisual(), { text: "alpha beta", lines: 1, linewise: false });
  assert.equal(cursor.visualMode(), null);

  cursor.toggleVisual("line");
  cursor.motion("down", 1, {});
  cursor.toggleVisual("char");
  assert.equal(cursor.visualMode(), "char");
  cursor.toggleVisual("line");
  assert.deepEqual(cursor.yankVisual(), { text: "alpha beta\ngamma\n", lines: 2, linewise: true });
  assert.equal(cursor.position().line, 1);

  assert.equal(cursor.reselectVisual(), true);
  assert.equal(cursor.visualMode(), "line");
  assert.equal(cursor.position().line, 2);
  cursor.toggleVisual("line");
  assert.deepEqual(modes, ["char", null, "line", "char", "line", null, "line", null]);
});

test("a mouse selection becomes a Visual selection", async (t) => {
  const { cursor, root, restore } = await createCursor(["alpha beta", "gamma"]);
  t.after(restore);
  const modes = [];
  cursor.setModeListener((kind) => modes.push(kind));
  const [first, second] = root.lines.map((line) => line.textNode);
  const domRange = (start, startOffset, end, endOffset) => ({
    commonAncestorContainer: start === end ? start : root.lines[0],
    startContainer: start,
    startOffset,
    endContainer: end,
    endOffset,
    intersectsNode: (node) => node === start || node === end,
  });

  // Dragging from "beta" back to "alp": the cursor stays where the drag ended.
  assert.equal(cursor.selectRange(domRange(first, 6, second, 3), false, "char"), true);
  assert.equal(cursor.visualMode(), "char");
  assert.deepEqual(
    { line: cursor.position().line, column: cursor.position().column },
    { line: 1, column: 7 },
  );
  assert.deepEqual(cursor.yankVisual(), { text: "beta\ngam", lines: 2, linewise: false });

  assert.equal(cursor.selectRange(domRange(first, 2, first, 4), true, "line"), true);
  assert.deepEqual(cursor.yankVisual(), { text: "alpha beta\n", lines: 1, linewise: true });
  // A range that covers no character of the document leaves Normal mode alone.
  assert.equal(cursor.selectRange(domRange(first, 3, first, 3), true, "char"), false);
  assert.deepEqual(modes, ["char", null, "line", null]);
});

test("Visual mode text objects extend the selection", async (t) => {
  const { cursor, restore } = await createCursor(["one two three"]);
  t.after(restore);

  cursor.motion("wordForward", 1, {});
  cursor.toggleVisual("char");
  assert.equal(cursor.selectObject("iw", 1), true);
  assert.equal(cursor.yankVisual().text, "two");
  assert.equal(cursor.position().column, 5);
});

test("flash matches ignore case unless the pattern has a capital, nearest first", async (t) => {
  const { cursor, restore } = await createCursor(["Alpha beta", "alpha Beta"]);
  t.after(restore);

  const lower = cursor.flashMatches("alpha");
  assert.deepEqual(lower.map((match) => [match.start, match.end, match.next]), [[0, 4, " "], [10, 14, " "]]);
  assert.ok(lower[0].distance < lower[1].distance);
  assert.deepEqual(cursor.flashMatches("Alpha").map((match) => match.start), [0]);
  assert.deepEqual(cursor.flashMatches("alpha", { exact: true }).map((match) => match.start), [10]);
  assert.deepEqual(cursor.flashMatches("a", { exact: true, direction: 1 }).map((match) => match.start), [4, 9, 10, 14, 19]);
  assert.deepEqual(cursor.flashSpan(), [0, 19]);
});

test("flash jumps move the cursor and yank inclusively", async (t) => {
  const { cursor, restore } = await createCursor(["Alpha beta", "alpha Beta"]);
  t.after(restore);

  assert.equal(cursor.yank("flashJump", 1, { target: 3 }).text, "Alph");
  assert.equal(cursor.motion("flashJump", 1, { target: 10 }), true);
  assert.deepEqual([cursor.position().line, cursor.position().column], [2, 1]);
});

test("f and t search past the end of the line", async (t) => {
  const { cursor, restore } = await createCursor(["Alpha beta", "alpha Beta"]);
  t.after(restore);

  cursor.motion("findForward", 1, { argument: "B" });
  assert.deepEqual([cursor.position().line, cursor.position().column], [2, 7]);
  assert.deepEqual(cursor.charSearch(), { direction: 1, till: false, character: "B" });
  cursor.motion("lineStart", 1, {});
  cursor.motion("findBackward", 1, { argument: "t" });
  assert.deepEqual([cursor.position().line, cursor.position().column], [1, 9]);
  cursor.motion("tillForward", 1, { argument: "B" });
  assert.deepEqual([cursor.position().line, cursor.position().column], [2, 6]);
});
