import assert from "node:assert/strict";
import test from "node:test";
import { openInNewTab } from "../../src/Srv.Portfolio/wwwroot/js/browser-links.js";
import { importHomeModule } from "./helpers/import-source-module.mjs";

test("new tabs preserve the URL, target, isolation features, and native return value", t => {
    const previous = globalThis.window;
    t.after(() => { globalThis.window = previous; });
    const calls = [];
    const opened = {};
    globalThis.window = { open: (...args) => { calls.push(args); return opened; } };
    const url = "https://example.test/path?q=one%20two#section";

    assert.equal(openInNewTab(url), opened);
    assert.deepEqual(calls, [[url, "_blank", "noopener,noreferrer"]]);
    window.open = () => null;
    assert.equal(openInNewTab(url), null);
});

test("new-tab failures propagate rather than becoming handled successes", t => {
    const previous = globalThis.window;
    t.after(() => { globalThis.window = previous; });
    const error = new Error("Window unavailable");
    globalThis.window = { open() { throw error; } };

    assert.throws(() => openInNewTab("https://example.test"), value => value === error);
});

test("following the welcome link keeps its handled result even if a popup is blocked", async t => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    t.after(() => {
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    });
    const calls = [];
    globalThis.window = { open: (...args) => { calls.push(args); return null; } };
    globalThis.document = {
        querySelector(selector) {
            assert.equal(selector, ".preview-scroll[data-welcome='true'] .welcome-screen a[href]");
            return { href: "https://github.com/sravioli" };
        }
    };
    const home = await importHomeModule();

    assert.equal(home.followLink(false), true);
    assert.equal(home.followLink(true), true);
    assert.deepEqual(calls, [
        ["https://github.com/sravioli", "_blank", "noopener,noreferrer"],
        ["https://github.com/sravioli", "_blank", "noopener,noreferrer"]
    ]);
});
