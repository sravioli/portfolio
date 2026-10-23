import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("closing the explorer keeps the tab content-sized and the spacer flexible", async () => {
  const css = await readFile(new URL("../../src/styles/app.css", import.meta.url), "utf8");
  const layouts = [...css.matchAll(
    /\.portfolio-shell\[data-explorer="closed"\] \.tabline \{([^}]+)\}/g,
  )];
  assert.equal(layouts.length, 2, "desktop and narrow layouts both handle the closed explorer");
  for (const [, declarations] of layouts) {
    assert.match(
      declarations,
      /grid-template-columns: auto minmax\(0, max-content\) minmax\(0, 1fr\) auto;/,
    );
  }
});
