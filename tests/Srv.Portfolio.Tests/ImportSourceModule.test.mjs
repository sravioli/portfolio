import assert from "node:assert/strict";
import test from "node:test";
import { importSourceModule } from "./helpers/import-source-module.mjs";

const pickerUrl = new URL("../../src/Srv.Portfolio/wwwroot/js/pick-menu.js", import.meta.url);

test("relative dependencies are resolved without a manually maintained import list", async () => {
    const picker = await importSourceModule(pickerUrl);

    assert.deepEqual(picker.buildHeadingTree([{ id: "root", level: 1 }]), [
        { id: "root", level: 1, parent: null }
    ]);
});

test("explicit overrides replace a relative dependency without changing other suites", async () => {
    const stub = "export function getHeadingElements() {} export function readHeading() {} " +
        "export function buildHeadingTree() { return 'stubbed'; }";
    const picker = await importSourceModule(pickerUrl, {
        "./readme-headings.js": `data:text/javascript;base64,${Buffer.from(stub).toString("base64")}`
    });

    assert.equal(picker.buildHeadingTree([]), "stubbed");
    assert.deepEqual((await importSourceModule(pickerUrl)).buildHeadingTree([]), []);
});
