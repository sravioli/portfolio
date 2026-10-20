import assert from "node:assert/strict";
import test from "node:test";
import {
  getHeadingElements,
  readHeading,
  getActiveHeadings,
  createHeadingIndex,
  buildHeadingTree,
} from "../../../../src/Srv.Portfolio/wwwroot/js/readme-headings.js";
import { buildHeadingTree as pickHeadingTree } from "../../../../src/Srv.Portfolio/wwwroot/js/pick-menu.js";
import { importHomeModule } from "../../helpers/import-source-module.mjs";

const { getActiveHeadings: homeActiveHeadings } = await importHomeModule();

test("rendered headings use all six levels with IDs and retain document order", () => {
  const elements = Array.from({ length: 6 }, (_, index) => ({
    id: `heading-${index}`,
    tagName: `H${index + 1}`,
    textContent: `  Title ${index}\n`,
  }));
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, "h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]");
      return elements;
    },
  };

  const headings = getHeadingElements(root).map(readHeading);

  assert.deepEqual(
    headings,
    elements.map((_, index) => ({
      id: `heading-${index}`,
      title: `Title ${index}`,
      level: index + 1,
    })),
  );
});

test("active paths include the exact threshold, omit positional fields, and do not mutate input", () => {
  const headings = Object.freeze([
    Object.freeze({ id: "a", title: "Same", level: 1, top: 10, extra: "keep" }),
    Object.freeze({ id: "b", title: "Same", level: 4, top: 20 }),
    Object.freeze({ id: "c", title: "Sibling", level: 2, top: 30 }),
  ]);

  assert.deepEqual(getActiveHeadings(headings, 20), [
    { id: "a", title: "Same", level: 1 },
    { id: "b", title: "Same", level: 4 },
  ]);
  assert.deepEqual(getActiveHeadings(headings, 30), [
    { id: "a", title: "Same", level: 1 },
    { id: "c", title: "Sibling", level: 2 },
  ]);
  assert.equal(headings[0].extra, "keep");
  assert.equal(headings[1].level, 4);
});

test("heading trees preserve extra metadata without mutating inputs or inventing ancestors", () => {
  const headings = [
    { id: "a", title: "Root", level: 2, extra: "keep" },
    { id: "b", title: "Child", level: 6 },
    { id: "c", title: "Sibling", level: 3 },
    { id: "d", title: "Root", level: 2 },
    { id: "e", title: "Higher", level: 1 },
  ].map(Object.freeze);
  Object.freeze(headings);

  assert.deepEqual(buildHeadingTree(headings), [
    { ...headings[0], parent: null },
    { ...headings[1], parent: "a" },
    { ...headings[2], parent: "a" },
    { ...headings[3], parent: null },
    { ...headings[4], parent: null },
  ]);
  assert.deepEqual(buildHeadingTree([]), []);
  assert.equal("parent" in headings[0], false);
});

test("Home and picker retain their original public exports", () => {
  assert.equal(homeActiveHeadings, getActiveHeadings);
  assert.equal(pickHeadingTree, buildHeadingTree);
});

function headingFixture(levels) {
  const elements = levels.map((level, index) => ({
    id: `heading-${index}`,
    tagName: `H${level}`,
    textContent: `Title ${index}`,
    top: Math.floor(index / 2) * 10,
    getBoundingClientRect() {
      return { top: this.top };
    },
  }));
  return { elements, root: { querySelectorAll: () => elements } };
}

test("indexed paths match linear paths at every boundary, including equal positions and skipped levels", () => {
  const { elements, root } = headingFixture(
    Array.from({ length: 120 }, (_, index) => [2, 6, 3, 1, 5, 6][index % 6]),
  );
  const index = createHeadingIndex(root);
  for (const top of [-1, ...elements.flatMap(({ top }) => [top - 1, top, top + 1]), Infinity]) {
    const expected = getActiveHeadings(
      elements.map((heading) => ({ ...readHeading(heading), top: heading.top })),
      top,
    );
    assert.deepEqual(index.active(top), expected);
  }
  assert.deepEqual(createHeadingIndex({ querySelectorAll: () => [] }).active(100), []);
});

test("indexed paths read live geometry and titles without retaining caller mutations", () => {
  const { elements, root } = headingFixture([1, 3, 2]);
  elements.forEach((element, index) => { element.top = index * 100; });
  const index = createHeadingIndex(root);
  assert.deepEqual(index.active(150).map(({ id }) => id), ["heading-0", "heading-1"]);

  elements[1].top = 180;
  elements[2].top = 300;
  elements[0].textContent = " Updated title ";
  const result = index.active(150);
  assert.deepEqual(result, [{ id: "heading-0", title: "Updated title", level: 1 }]);
  result[0].title = "Caller mutation";
  result.push({ id: "fake", title: "Fake", level: 6 });
  assert.deepEqual(index.active(150), [{ id: "heading-0", title: "Updated title", level: 1 }]);

  elements.forEach((element) => { element.top -= 1000; });
  assert.deepEqual(index.active(-850), [{ id: "heading-0", title: "Updated title", level: 1 }]);
});

test("indexed paths preserve first-future-heading behavior when layout positions are not sorted", () => {
  const { elements, root } = headingFixture([1, 2, 3, 4]);
  [0, 500, 100, 200].forEach((top, index) => { elements[index].top = top; });
  const index = createHeadingIndex(root);
  for (const top of [50, 150, 250, 550]) {
    assert.deepEqual(index.active(top), getActiveHeadings(
      elements.map((heading) => ({ ...readHeading(heading), top: heading.top })), top,
    ));
  }
});

test("indexed reports stop measuring at the first future heading and read only active titles", () => {
  const { elements, root } = headingFixture(Array.from({ length: 2000 }, (_, index) => index % 6 + 1));
  let reads = 0;
  let titles = 0;
  let queries = 0;
  root.querySelectorAll = () => { queries++; return elements; };
  for (const element of elements) {
    element.getBoundingClientRect = () => { reads++; return { top: element.top }; };
    const title = element.textContent;
    Object.defineProperty(element, "textContent", { get: () => { titles++; return title; } });
  }
  const index = createHeadingIndex(root);
  for (const top of [-1, 0, 2500, 9990, Infinity]) {
    reads = 0;
    titles = 0;
    index.active(top);
    const future = elements.findIndex((element) => element.top > top);
    assert.equal(reads, future < 0 ? elements.length : future + 1);
    assert.ok(titles <= 6, `${titles} title reads`);
  }
  assert.equal(queries, 1);
});
