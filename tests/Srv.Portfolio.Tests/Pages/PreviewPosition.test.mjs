import assert from "node:assert/strict";
import test from "node:test";
import { importHomeModule } from "../helpers/import-source-module.mjs";

test("position reports reuse the heading index and reset it across preview lifecycle changes", async (t) => {
  const names = ["document", "window", "performance", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "previewPositionFixture"];
  const previous = new Map(names.map((name) => [name, globalThis[name]]));
  let home;
  t.after(() => {
    home?.dispose();
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  let now = 1000;
  let frame;
  let move;
  let queries = 0;
  let codeBlocks = [];
  const calls = [];
  const heading = (id, level, top) => ({
    id, tagName: `H${level}`, textContent: id,
    getBoundingClientRect: () => ({ top }),
  });
  let elements = [heading("root", 1, 0), heading("child", 2, 100)];
  const article = {
    dataset: { repository: "fixture", totalLines: "40" },
    querySelectorAll() { queries++; return elements; },
  };
  let currentArticle = article;
  const viewport = {
    scrollTop: 0, scrollHeight: 1000, clientHeight: 300,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ top: 0 }),
    querySelector: (selector) => selector === ".readme-content" ? currentArticle : null,
  };
  globalThis.previewPositionFixture = { setMove: (callback) => { move = callback; } };
  globalThis.performance = { now: () => now };
  globalThis.getComputedStyle = () => ({ lineHeight: "24px" });
  globalThis.requestAnimationFrame = (callback) => { frame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => { frame = null; };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = {
    addEventListener() {}, removeEventListener() {},
    querySelector: (selector) => selector === ".preview-scroll" ? viewport : null,
    // Pre-highlighted snapshot blocks are excluded by the selector, so only client work is returned.
    querySelectorAll: (selector) => selector === ".readme-content pre code:not([data-highlighted]):not([data-highlight-skip])" ? codeBlocks : [],
  };
  const stub = `
    export function setNavigator() {}
    export function setMoveListener(callback) { globalThis.previewPositionFixture.setMove(callback); }
    export function refresh() {}
    export function sync() {}
    export function position() { return { line: 5, column: 2, top: 150 }; }
    export function dispose() {}
  `;
  home = await importHomeModule({
    "../js/nvim-cursor.js": `data:text/javascript;base64,${Buffer.from(stub).toString("base64")}`,
  });
  home.initialize({ invokeMethodAsync: async (...args) => calls.push(args) }, true, " ");
  const report = async () => {
    now += 101;
    move();
    const callback = frame;
    frame = null;
    callback();
    await Promise.resolve();
    return calls.at(-1);
  };
  assert.deepEqual((await report())[5].map(({ id }) => id), ["root", "child"]);
  await report();
  assert.equal(queries, 1);

  elements = [heading("replacement", 3, 0)];
  await home.refreshPreview();
  assert.deepEqual((await report())[5], [{ id: "replacement", title: "replacement", level: 3 }]);
  assert.equal(queries, 2);

  elements = [heading("during-highlight", 2, 0)];
  codeBlocks = [{ classList: ["language-csharp"] }];
  const highlighted = [];
  globalThis.window.hljs = { getLanguage: () => true, highlightElement: (block) => highlighted.push(block) };
  const refreshing = home.refreshPreview();
  assert.deepEqual((await report())[5], [{ id: "during-highlight", title: "during-highlight", level: 2 }]);
  await refreshing;
  assert.deepEqual(highlighted, codeBlocks);
  codeBlocks = [];
  assert.equal(queries, 3);

  currentArticle = null;
  assert.deepEqual((await report())[5], []);
  currentArticle = {
    ...article,
    dataset: { repository: "next", totalLines: "12" },
    querySelectorAll: () => [heading("next-root", 1, 0)],
  };
  const next = await report();
  assert.deepEqual(next.slice(0, 5), ["OnPreviewPosition", 5, 2, 12, "Top"]);
  assert.deepEqual(next[5], [{ id: "next-root", title: "next-root", level: 1 }]);
  assert.equal(next[6], "next");

  home.dispose();
  elements = [heading("after-dispose", 2, 0)];
  currentArticle = article;
  home.initialize({ invokeMethodAsync: async (...args) => calls.push(args) }, true, " ");
  assert.deepEqual((await report())[5], [{ id: "after-dispose", title: "after-dispose", level: 2 }]);
  assert.equal(queries, 4);
});
