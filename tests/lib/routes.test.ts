import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { allEntries, find, rootEntry } from "../../src/lib/catalog.ts";
import {
  documentKey,
  documentSlug,
  documentUrl,
  entryFromPath,
  fragmentUrl,
  helpFragmentUrl,
  helpPageFromPath,
  helpPageUrl,
  helpTagFromHash,
  helpTagUrl,
  HELP_INDEX_PAGE,
  pageTitle,
  pageDescription,
  rawUrl,
  siteUrl,
  SITE_DESCRIPTION,
} from "../../src/lib/routes.ts";

describe("routes", () => {
  test("help pages have pretty URLs, tag fragments, and fragments to fetch", () => {
    assert.equal(helpPageUrl(HELP_INDEX_PAGE), "/help/");
    assert.equal(helpPageUrl("clipboard"), "/help/clipboard/");
    assert.equal(helpTagUrl("clipboard", "clipboard-errors"), "/help/clipboard/#help-clipboard-errors");
    assert.equal(helpTagUrl("commands", ":help"), "/help/commands/#help-%3Ahelp");
    assert.equal(helpFragmentUrl("clipboard"), "/help-fragments/clipboard.html");
  });

  test("help paths and fragments resolve back to pages and tags", () => {
    assert.equal(helpPageFromPath("/help/"), "help");
    assert.equal(helpPageFromPath("/help"), "help");
    assert.equal(helpPageFromPath("/help/clipboard/"), "clipboard");
    assert.equal(helpPageFromPath("/portfolio/help/clipboard/", "/portfolio/"), "clipboard");
    assert.equal(helpPageFromPath("/help/clipboard/", "/portfolio/"), null);
    assert.equal(helpPageFromPath("/chrono/"), null);
    assert.equal(helpPageFromPath("/help/a/b/"), null);
    assert.equal(helpTagFromHash("#help-clipboard-errors"), "clipboard-errors");
    assert.equal(helpTagFromHash("#help-%3Ahelp"), ":help");
    assert.equal(helpTagFromHash("#help-"), null);
    assert.equal(helpTagFromHash("#intro"), null);
    assert.equal(helpTagFromHash(""), null);
  });

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
