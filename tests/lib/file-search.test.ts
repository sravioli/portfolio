import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { allEntries, isRoot } from "../../src/lib/catalog.ts";
import { search } from "../../src/lib/file-search.ts";

describe("FileSearch", () => {
  test("search empty query includes every catalog entry once", () => {
    const results = search("");

    assert.equal(results.length, allEntries().length);
    assert.equal(new Set(results.map((result) => result.path)).size, results.length);
    assert.ok(results.some((result) => result.path === "README.md" && isRoot(result.entry)));
    assert.ok(results.some((result) => result.path === "wezterm-plugins/nap.wz/README.md"));
    assert.ok(results.some((result) => result.entry.repository === "nvim"));
    for (const result of results) assert.deepEqual(result.matches, []);
  });

  describe("search fuzzy query finds expected repository", () => {
    const cases: [query: string, repository: string][] = [
      ["chrono", "chrono"],
      ["CHRONO", "chrono"],
      ["chro rd", "chrono"],
      ["chrd", "chord.wz"],
      ["memo", "memo.wz"],
    ];
    for (const [query, repository] of cases) {
      test(`${JSON.stringify(query)} -> ${repository}`, () => {
        const results = search(query);

        const matches = results.filter((item) => item.entry.repository === repository);
        assert.equal(matches.length, 1);
        const [result] = matches;
        const matched = result.matches.map((index) => result.path[index]).join("");
        const expected = [...query].filter((character) => !/\s/u.test(character)).join("");
        assert.equal(matched.toLowerCase(), expected.toLowerCase());
        assert.deepEqual(result.matches, [...result.matches].sort((a, b) => a - b));
      });
    }
  });

  test("search contiguous match ranks ahead of scattered match", () => {
    const result = search("chro");

    assert.equal(result[0].entry.repository, "chrono");
  });

  describe("search no matches returns empty results", () => {
    for (const query of ["no-such-file", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"]) {
      test(query, () => {
        assert.deepEqual(search(query), []);
      });
    }
  });

  test("search whitespace query returns all entries without highlights", () => {
    const results = search(" \t ");

    assert.equal(results.length, allEntries().length);
    for (const result of results) assert.deepEqual(result.matches, []);
  });
});
