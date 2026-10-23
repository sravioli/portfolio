import assert from "node:assert/strict";
import test from "node:test";
import { byteLength, copiedLineCount, countLines, splitRawLines, stripBom } from "../../src/lib/format.ts";

test("stripBom removes only one leading BOM", () => {
  assert.equal(stripBom(""), "");
  assert.equal(stripBom("\uFEFFbody"), "body");
  assert.equal(stripBom("\uFEFF\uFEFFbody"), "\uFEFFbody");
  assert.equal(stripBom("a\uFEFFb"), "a\uFEFFb");
});

test("byteLength measures UTF-8 bytes including BOMs and line endings", () => {
  assert.equal(byteLength(""), 0);
  assert.equal(byteLength("abc"), 3);
  assert.equal(byteLength("\uFEFF\u00e9\u{1f600}\r\n"), 11);
});

test("raw, source, and copied lines retain their distinct newline rules", () => {
  const source = "first\r\nsecond\rthird\n\n";
  assert.deepEqual(splitRawLines(source), ["first", "second\rthird", "", ""]);
  assert.equal(countLines(source), 4);
  assert.equal(copiedLineCount(source), 3);
  assert.deepEqual(splitRawLines(""), [""]);
  assert.equal(countLines(""), 1);
  assert.equal(copiedLineCount(""), 1);
});
