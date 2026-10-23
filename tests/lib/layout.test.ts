import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { NARROW_QUERY } from "../../src/lib/layout.ts";
import { EXPLORER_SCRIPT, NARROW_QUERY as viewQuery } from "../../src/lib/view.ts";

test("layout query stays compatible with the view export and CSS breakpoint", async () => {
  assert.equal(NARROW_QUERY, "(max-width: 700px)");
  assert.equal(viewQuery, NARROW_QUERY);
  const css = await readFile(new URL("../../src/styles/app.css", import.meta.url), "utf8");
  assert.ok(css.includes(`@media ${NARROW_QUERY} {`));
});

test("explorer bootstrap uses the shared query without changing saved-state defaults", () => {
  for (const narrow of [false, true]) {
    for (const saved of [null, "open", "closed", "invalid"]) {
      for (const blocked of [false, true]) {
        const shell = { dataset: { explorer: "pending" } };
        runInNewContext(EXPLORER_SCRIPT, {
          localStorage: { getItem: () => {
            if (blocked) throw new Error("Storage unavailable");
            return saved;
          } },
          document: { querySelector: () => shell },
          matchMedia: (query: string) => {
            assert.equal(query, NARROW_QUERY);
            return { matches: narrow };
          },
        });
        assert.equal(shell.dataset.explorer, narrow || (!blocked && saved === "closed") ? "closed" : "open");
      }
    }
  }
});
