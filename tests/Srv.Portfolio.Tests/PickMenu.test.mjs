import assert from "node:assert/strict";
import test from "node:test";
import { buildHeadingTree, headingItems } from "../../src/Srv.Portfolio/wwwroot/js/pick-menu.js";

const nodes = buildHeadingTree([
    { id: "intro", title: "Intro", level: 1 },
    { id: "start", title: "Quick start", level: 2 },
    { id: "controls", title: "Controls", level: 2 },
    { id: "keys", title: "Keys", level: 3 },
    { id: "customize", title: "Customize", level: 2 },
    { id: "thanks", title: "Thanks", level: 1 }
]);

test("sibling headings share a parent and mark children and the current entry", () => {
    const items = headingItems(nodes, "intro", "controls");
    assert.deepEqual(items.map(item => item.headingId), ["start", "controls", "customize"]);
    assert.deepEqual(items.map(item => item.hasChildren), [false, true, false]);
    assert.deepEqual(items.map(item => item.current), [false, true, false]);
});

test("top-level headings and submenus are listed by parent", () => {
    assert.deepEqual(headingItems(nodes, null, null).map(item => item.headingId), ["intro", "thanks"]);
    assert.deepEqual(headingItems(nodes, "controls", null).map(item => item.label), ["Keys"]);
});

test("skipped levels attach to the nearest shallower heading", () => {
    const tree = buildHeadingTree([{ id: "a", level: 1 }, { id: "b", level: 4 }, { id: "c", level: 2 }]);
    assert.deepEqual(tree.map(node => node.parent), [null, "a", "a"]);
});
