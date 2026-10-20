import assert from "node:assert/strict";
import test from "node:test";
import * as pickMenu from "../../src/Srv.Portfolio/wwwroot/js/pick-menu.js";
const { buildHeadingTree, headingItems } = pickMenu;

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

test("a nested heading belongs to its nearest shallower heading, not its sibling", () => {
    const tree = buildHeadingTree([
        { id: "installation", level: 2 },
        { id: "features", level: 2 },
        { id: "flexible", level: 3 },
        { id: "thanks", level: 2 }
    ]);

    assert.deepEqual(tree.map(node => node.parent), [null, null, "features", null]);
});

test("clicking a heading with children opens its submenu", async () => {
    class MockElement {
        children = [];
        dataset = {};
        listeners = new Map();
        style = {};
        classList = { toggle() { } };
        offsetWidth = 180;
        offsetHeight = 80;

        setAttribute() { }
        append(...children) { this.children.push(...children); }
        addEventListener(name, listener) { this.listeners.set(name, listener); }
        remove() { }
        scrollIntoView() { }
        getBoundingClientRect() { return { left: 10, right: 190, top: 20, bottom: 40 }; }
    }

    const feature = { id: "features", title: "Features", level: 2 };
    const segment = new MockElement();
    segment.dataset.readmeHeading = "features";
    const body = new MockElement();
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;
    globalThis.document = {
        body,
        createElement: () => new MockElement(),
        querySelector: selector => selector === ".readme-content"
            ? { querySelectorAll: () => [
                { id: "installation", textContent: "Installation", tagName: "H2" },
                { id: feature.id, textContent: feature.title, tagName: "H2" },
                { id: "flexible", textContent: "Flexible styling", tagName: "H3" },
                { id: "thanks", textContent: "Thanks", tagName: "H2" }
            ] }
            : null,
        querySelectorAll: selector => selector === ".breadcrumb [data-readme-heading]" ? [segment] : []
    };
    globalThis.window = { innerWidth: 800, innerHeight: 600 };
    pickMenu.configure({ jump() { assert.fail("Parent heading should open its submenu"); } });

    try {
        await pickMenu.openSegment(segment);
        const parentMenu = body.children[0];
        await parentMenu.children[1].listeners.get("click")({ stopPropagation() { } });

        assert.equal(body.children.length, 2);
        assert.match(body.children[1].children[0].children[1].textContent, /Flexible styling/);
    } finally {
        pickMenu.cancel();
        globalThis.document = previousDocument;
        globalThis.window = previousWindow;
    }
});
