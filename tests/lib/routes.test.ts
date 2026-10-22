import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { allEntries, find, rootEntry } from "../../src/lib/catalog.ts";
import {
  documentKey,
  documentSlug,
  documentUrl,
  entryFromPath,
  fragmentUrl,
  pageTitle,
  rawUrl,
} from "../../src/lib/routes.ts";

describe("routes", () => {
  test("root README lives under /readme/", () => {
    assert.equal(documentSlug(rootEntry), "readme");
    assert.equal(documentUrl(rootEntry), "/readme/");
    assert.equal(fragmentUrl(rootEntry), "/fragments/readme.html");
    assert.equal(rawUrl(rootEntry), "/raw/readme.md");
  });

  test("nested documents use their catalog path", () => {
    const plugin = find("nap.wz")!;
    assert.equal(documentSlug(plugin), "wezterm-plugins/nap.wz");
    assert.equal(documentUrl(plugin), "/wezterm-plugins/nap.wz/");
    assert.equal(documentKey(plugin), "nap.wz");
    assert.equal(fragmentUrl(plugin), "/fragments/nap.wz.html");
  });

  test("every document URL resolves back to its entry", () => {
    for (const entry of allEntries()) assert.equal(entryFromPath(documentUrl(entry)), entry);
  });

  test("document keys are unique", () => {
    const keys = allEntries().map(documentKey);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("the site root is the welcome screen", () => {
    assert.equal(entryFromPath("/"), undefined);
    assert.equal(entryFromPath(""), undefined);
  });

  test("paths match case-insensitively without a trailing slash", () => {
    assert.equal(entryFromPath("/README"), rootEntry);
    assert.equal(entryFromPath("/Wezterm-Plugins/NAP.wz"), find("nap.wz"));
  });

  for (const path of ["/bogus/", "/nap.wz/", "/chrono/extra/", "/wezterm/nap.wz/", "/readme/chrono/", "/%E0%A4%A/"])
    test(`unknown path ${path} is not a document`, () => {
      assert.equal(entryFromPath(path), null);
    });

  test("page titles name the open document", () => {
    assert.equal(pageTitle(undefined), "Simone's Portfolio");
    assert.equal(pageTitle(rootEntry), "README | Simone's Portfolio");
    assert.equal(pageTitle(find("chrono")!), "chrono | Simone's Portfolio");
  });
});
