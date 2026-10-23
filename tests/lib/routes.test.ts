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
  pageDescription,
  rawUrl,
  siteUrl,
  SITE_DESCRIPTION,
} from "../../src/lib/routes.ts";

describe("routes", () => {
  test("page descriptions are project-specific with a site fallback", () => {
    assert.equal(pageDescription(undefined), SITE_DESCRIPTION);
    assert.equal(pageDescription(rootEntry), SITE_DESCRIPTION);
    const chrono = pageDescription(find("chrono")!);
    assert.match(chrono, /^chrono: /);
    assert.match(chrono, /Simone Fidanza's portfolio\.$/);
    assert.doesNotMatch(chrono, /\.\. /);
  });

  test("deployment base prefixes assets and resolves project pages without escaping the site", () => {
    for (const base of ["/portfolio", "/portfolio/"]) {
      assert.equal(siteUrl("", base), "/portfolio/");
      assert.equal(siteUrl("/fonts/font.woff2", base), "/portfolio/fonts/font.woff2");
      assert.equal(siteUrl("fragments/chrono.html", base), "/portfolio/fragments/chrono.html");
      assert.equal(entryFromPath("/portfolio/", base), undefined);
      assert.equal(entryFromPath("/portfolio", base), undefined);
      assert.equal(entryFromPath("/portfolio/readme/", base), rootEntry);
      assert.equal(entryFromPath("/portfolio/wezterm-plugins/nap.wz/", base), find("nap.wz"));
      assert.equal(entryFromPath("/portfolio/missing", base), null);
      assert.equal(entryFromPath("/portfolio-other/readme/", base), null);
      assert.equal(entryFromPath("/readme/", base), null);
    }
  });
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
