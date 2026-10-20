import assert from "node:assert/strict";
import test from "node:test";
import { getHeadingElements, readHeading, getActiveHeadings, buildHeadingTree } from "../../src/Srv.Portfolio/wwwroot/js/readme-headings.js";
import { buildHeadingTree as pickHeadingTree } from "../../src/Srv.Portfolio/wwwroot/js/pick-menu.js";
import { importHomeModule } from "./helpers/import-source-module.mjs";

const { getActiveHeadings: homeActiveHeadings } = await importHomeModule();

test("rendered headings use all six levels with IDs and retain document order", () => {
    const elements = Array.from({ length: 6 }, (_, index) => ({
        id: `heading-${index}`,
        tagName: `H${index + 1}`,
        textContent: `  Title ${index}\n`
    }));
    const root = {
        querySelectorAll(selector) {
            assert.equal(selector, "h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]");
            return elements;
        }
    };

    const headings = getHeadingElements(root).map(readHeading);

    assert.deepEqual(headings, elements.map((_, index) => ({
        id: `heading-${index}`, title: `Title ${index}`, level: index + 1
    })));
});

test("active paths include the exact threshold, omit positional fields, and do not mutate input", () => {
    const headings = Object.freeze([
        Object.freeze({ id: "a", title: "Same", level: 1, top: 10, extra: "keep" }),
        Object.freeze({ id: "b", title: "Same", level: 4, top: 20 }),
        Object.freeze({ id: "c", title: "Sibling", level: 2, top: 30 })
    ]);

    assert.deepEqual(getActiveHeadings(headings, 20), [
        { id: "a", title: "Same", level: 1 },
        { id: "b", title: "Same", level: 4 }
    ]);
    assert.deepEqual(getActiveHeadings(headings, 30), [
        { id: "a", title: "Same", level: 1 },
        { id: "c", title: "Sibling", level: 2 }
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
        { id: "e", title: "Higher", level: 1 }
    ].map(Object.freeze);
    Object.freeze(headings);

    assert.deepEqual(buildHeadingTree(headings), [
        { ...headings[0], parent: null },
        { ...headings[1], parent: "a" },
        { ...headings[2], parent: "a" },
        { ...headings[3], parent: null },
        { ...headings[4], parent: null }
    ]);
    assert.deepEqual(buildHeadingTree([]), []);
    assert.equal("parent" in headings[0], false);
});

test("Home and picker retain their original public exports", () => {
    assert.equal(homeActiveHeadings, getActiveHeadings);
    assert.equal(pickHeadingTree, buildHeadingTree);
});
