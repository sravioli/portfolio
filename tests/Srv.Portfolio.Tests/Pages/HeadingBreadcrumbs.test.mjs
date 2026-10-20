import assert from "node:assert/strict";
import test from "node:test";
import { importHomeModule } from "../helpers/import-source-module.mjs";

const { getActiveHeadings } = await importHomeModule();
const headings = [
  { id: "intro", title: "Intro", level: 1, top: 10 },
  { id: "contribute", title: "Contribute", level: 2, top: 100 },
  { id: "bugs", title: "Reporting bugs", level: 3, top: 200 },
  { id: "report", title: "Good report", level: 4, top: 300 },
  { id: "features", title: "Features", level: 2, top: 400 },
  { id: "features-1", title: "Features", level: 3, top: 500 },
  { id: "thanks", title: "Thanks", level: 1, top: 600 },
];
const ids = (top) =>
  getActiveHeadings(headings, top).map((heading) => heading.id);

test("before the first heading and an empty document have no active path", () => {
  assert.deepEqual(ids(0), []);
  assert.deepEqual(getActiveHeadings([], 100), []);
});

test("nested sections include all active ancestors and exclude following sections", () => {
  assert.deepEqual(ids(300), ["intro", "contribute", "bugs", "report"]);
});

test("a sibling replaces the previous section and its descendants", () => {
  assert.deepEqual(ids(450), ["intro", "features"]);
});

test("a new root replaces the entire path", () => {
  assert.deepEqual(ids(600), ["thanks"]);
});

test("duplicate titles retain their distinct anchor IDs", () => {
  assert.deepEqual(ids(500), ["intro", "features", "features-1"]);
});

test("scrolling back up restores the correct hierarchy", () => {
  ids(600);
  assert.deepEqual(ids(200), ["intro", "contribute", "bugs"]);
});

test("skipped heading levels do not create nonexistent ancestors", () => {
  assert.deepEqual(getActiveHeadings([headings[0], headings[3]], 350), [
    { id: "intro", title: "Intro", level: 1 },
    { id: "report", title: "Good report", level: 4 },
  ]);
});
