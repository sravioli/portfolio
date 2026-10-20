import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cursorModule = new URL("../../src/Srv.Portfolio/wwwroot/js/nvim-cursor.js", import.meta.url).href;
const pickModule = new URL("../../src/Srv.Portfolio/wwwroot/js/pick-menu.js", import.meta.url).href;
const viewerModule = new URL("../../src/Srv.Portfolio/wwwroot/js/image-viewer.js", import.meta.url).href;
const motionsModule = new URL("../../src/Srv.Portfolio/wwwroot/js/vim-motions.js", import.meta.url).href;
const source = (await readFile(new URL("../../src/Srv.Portfolio/Pages/Home.razor.js", import.meta.url), "utf8"))
    .replace("\"../js/nvim-cursor.js\"", JSON.stringify(cursorModule))
    .replace("\"../js/pick-menu.js\"", JSON.stringify(pickModule))
    .replace("\"../js/image-viewer.js\"", JSON.stringify(viewerModule))
    .replace("\"../js/which-key.js\"", JSON.stringify(new URL("../../src/Srv.Portfolio/wwwroot/js/which-key.js", import.meta.url).href))
    .replace("\"../js/vim-motions.js\"", JSON.stringify(motionsModule));
const { getActiveHeadings } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const headings = [
    { id: "intro", title: "Intro", level: 1, top: 10 },
    { id: "contribute", title: "Contribute", level: 2, top: 100 },
    { id: "bugs", title: "Reporting bugs", level: 3, top: 200 },
    { id: "report", title: "Good report", level: 4, top: 300 },
    { id: "features", title: "Features", level: 2, top: 400 },
    { id: "features-1", title: "Features", level: 3, top: 500 },
    { id: "thanks", title: "Thanks", level: 1, top: 600 }
];
const ids = top => getActiveHeadings(headings, top).map(heading => heading.id);

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
        { id: "report", title: "Good report", level: 4 }
    ]);
});
