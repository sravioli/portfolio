import assert from "node:assert/strict";
import test from "node:test";
import { documentAssetPaths } from "../../src/build/documents.ts";
import { allEntries, find, rootEntry } from "../../src/lib/catalog.ts";
import { getStaticPaths as fragmentPaths } from "../../src/pages/fragments/[key].html.ts";
import { getStaticPaths as rawPaths } from "../../src/pages/raw/[key].md.ts";

test("asset paths enumerate every catalog entry once in catalog order", () => {
  const paths = documentAssetPaths();
  assert.deepEqual(paths.map(({ props }) => props.entry), allEntries());
  const keys = paths.map(({ params }) => params.key);
  assert.equal(new Set(keys).size, allEntries().length);
  assert.ok(keys.every((key) => !key.includes("/")));
  assert.deepEqual(paths[0], { params: { key: "readme" }, props: { entry: rootEntry } });
  assert.deepEqual(paths.find(({ params }) => params.key === "nap.wz"), {
    params: { key: "nap.wz" },
    props: { entry: find("nap.wz") },
  });
  assert.deepEqual(paths.find(({ params }) => params.key === "featured.md"), {
    params: { key: "featured.md" },
    props: { entry: find("featured.md") },
  });
});

test("fragment and raw routes use the shared asset enumeration", () => {
  assert.equal(fragmentPaths, documentAssetPaths);
  assert.equal(rawPaths, documentAssetPaths);
});
