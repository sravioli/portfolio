import assert from "node:assert/strict";
import test from "node:test";
import { importSourceModule } from "../../helpers/import-source-module.mjs";

const cursorUrl = new URL(
  "../../../../src/Srv.Portfolio/wwwroot/js/nvim-cursor.js",
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
      return selector === ".readme-content, .raw-readme" ? this.root : null;
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
      return selector === ".preview-scroll" ? viewport : null;
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
