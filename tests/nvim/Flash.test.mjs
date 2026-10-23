import assert from "node:assert/strict";
import test from "node:test";
import { assignLabels, createFlash } from "../../src/nvim/flash.js";

const match = (start, next, distance = start) => ({ start, end: start, next, distance });

test("labels skip letters that could continue the pattern", () => {
  const labels = assignLabels(
    [{ window: 0, match: match(0, "s") }, { window: 0, match: match(5, "d") }],
    "x",
  );
  assert.deepEqual([...labels.values()], ["a", "f"]);
  const exact = assignLabels([{ window: 0, match: match(0, "a") }], "X");
  assert.equal(exact.get("0:0"), "s");
  assert.equal(assignLabels([{ window: 0, match: match(0, "A") }], "X").get("0:0"), "a");
});

test("labels go to the current window first, nearest first, and stay on their matches", () => {
  const matches = [
    { window: 1, match: match(0, "", 1) },
    { window: 0, match: match(9, "", 50) },
    { window: 0, match: match(3, "", 5) },
  ];
  const labels = assignLabels(matches, "x");
  assert.deepEqual([labels.get("0:3"), labels.get("0:9"), labels.get("1:0")], ["a", "s", "d"]);
  const kept = assignLabels([matches[1]], "xy", labels);
  assert.equal(kept.get("0:9"), "s");
});

function withDom(t) {
  const previous = { document: globalThis.document, window: globalThis.window, cancel: globalThis.cancelAnimationFrame };
  const noop = () => {};
  globalThis.document = { addEventListener: noop, removeEventListener: noop };
  globalThis.window = { addEventListener: noop, removeEventListener: noop };
  globalThis.cancelAnimationFrame = noop;
  t.after(() => {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.cancelAnimationFrame = previous.cancel;
  });
}

function fakeWindow(text, cursorAt = 0) {
  return {
    viewport: () => null,
    cursor: {
      flashMatches(pattern, { direction = 0 } = {}) {
        const found = [];
        const haystack = pattern === pattern.toLowerCase() ? text.toLowerCase() : text;
        for (let at = haystack.indexOf(pattern); at >= 0; at = haystack.indexOf(pattern, at + 1)) {
          if (direction > 0 && at <= cursorAt) continue;
          found.push({ start: at, end: at + pattern.length - 1, next: text[at + pattern.length] ?? "", distance: Math.abs(at - cursorAt) });
        }
        return found;
      },
      flashRange: () => null,
      flashSpan: () => null,
      charSearch: () => null,
    },
  };
}

test("a flash jump reads the pattern, then a label or Enter", (t) => {
  withDom(t);
  const prompts = [];
  const flash = createFlash({ prompt: (text) => prompts.push(text) });
  const windows = [fakeWindow("one two one", 4)];

  flash.start(windows);
  assert.equal(flash.active(), true);
  assert.deepEqual(flash.key("o"), { status: "pending" });
  assert.deepEqual(flash.key("n"), { status: "pending" });
  // Labels given for "o" stay on their matches ("two" at 6 got "a").
  assert.deepEqual(flash.targets(), [{ window: 0, start: 0, label: "s" }, { window: 0, start: 8, label: "d" }]);
  assert.deepEqual(flash.key("d"), { status: "jump", window: 0, position: 8 });
  assert.equal(flash.active(), false);
  assert.deepEqual(prompts, ["", "o", "on", null]);

  flash.start(windows);
  flash.key("o");
  // Enter takes the first match after the cursor ("two" at 6).
  assert.deepEqual(flash.key("Enter"), { status: "jump", window: 0, position: 6 });

  flash.start(windows);
  flash.key("t");
  flash.key("w");
  assert.deepEqual(flash.key("Backspace"), { status: "pending" });
  assert.equal(flash.pattern(), "t");
  flash.key("Backspace");
  assert.deepEqual(flash.key("Backspace"), { status: "cancelled" });

  flash.start(windows);
  assert.deepEqual(flash.key("z"), { status: "cancelled" });
  flash.start(windows);
  assert.deepEqual(flash.key("Escape"), { status: "cancelled" });
});
