import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  documentFileName,
  find,
  getAncestry,
  getListing,
  getPickMenu,
  isRoot,
  isStandaloneDocument,
  pickKey,
  rootEntry,
} from "../../src/lib/catalog.ts";

describe("PortfolioCatalog", () => {
  test("get listing root returns readme then projects in order", () => {
    const names = getListing(rootEntry).map((item) => item.name);

    assert.deepEqual(names, ["README.md", "featured.md", "chrono/", "nvim/", "wezterm/", "wezterm-plugins/"]);
  });

  test("featured.md is a standalone document named after itself", () => {
    const featured = find("featured.md")!;

    assert.equal(isStandaloneDocument(featured), true);
    assert.equal(documentFileName(featured), "featured.md");
    assert.equal(getListing(rootEntry)[1].kind, "projectFile");
    assert.equal(documentFileName(find("chrono")!), "README.md");
  });

  test("get listing plugin folder returns parent readme and all plugins", () => {
    const folder = find("wezterm-plugins")!;
    const listing = getListing(folder);

    assert.equal(listing[0].name, "../");
    assert.equal(listing[1].name, "README.md");
    assert.equal(listing.length - 2, 11);
    assert.ok(listing.some((item) => item.name === "memo.wz" && item.kind === "projectFile"));
    assert.equal(find("nap.wz")!.readmePath, "README.md");
  });

  test("get listing nvim publishes its local readme", () => {
    const listing = getListing(find("nvim")!);

    assert.deepEqual(
      listing.map((item) => item.kind),
      ["parent", "readme"],
    );
  });

  test("get ancestry plugin file returns root to entry", () => {
    const ancestry = getAncestry(find("memo.wz")!);

    assert.deepEqual(
      ancestry.map((entry) => entry.name),
      ["sravioli", "wezterm-plugins", "memo.wz"],
    );
    assert.equal(isRoot(ancestry[0]), true);
  });

  test("get pick menu root lists readme and folders with child indicators", () => {
    const menu = getPickMenu("");

    assert.deepEqual(
      menu.map((item) => item.label),
      ["README.md", "featured.md", "chrono", "nvim", "wezterm", "wezterm-plugins"],
    );
    assert.deepEqual(menu[0], {
      key: "readme:",
      label: "README.md",
      repository: "",
      kind: "readme",
      hasChildren: false,
    });
    const plugins = menu.filter((item) => item.label === "wezterm-plugins");
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0].hasChildren, true);
    const nvim = menu.filter((item) => item.label === "nvim");
    assert.equal(nvim.length, 1);
    assert.equal(nvim[0].hasChildren, true);
  });

  test("get pick menu plugin folder uses keys matching breadcrumb segments", () => {
    const menu = getPickMenu("wezterm-plugins");
    const memo = find("memo.wz")!;

    assert.ok(menu.some((item) => item.key === pickKey(memo) && item.kind === "file"));
    assert.equal(menu[0].key, "readme:wezterm-plugins");
    assert.deepEqual(getPickMenu("missing"), []);
  });
});
