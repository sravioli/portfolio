import assert from "node:assert/strict";
import test from "node:test";
import { importHomeModule } from "../helpers/import-source-module.mjs";

const cursorStub = [
    "move", "motion", "jumpHeading", "jump", "followLink", "imageUnderCursor", "refresh", "sync", "position", "placeAt",
    "jumpToElement", "invalidate", "setNavigator", "setMoveListener", "dispose", "recordJump"
].map(name => `export function ${name}(...args) { globalThis.cursorCalls?.push(["${name}", ...args]); return false; }`).join("\n");
const cursorModule = `data:text/javascript;base64,${Buffer.from(cursorStub).toString("base64")}`;
const realWhichKey = new URL("../../../src/Srv.Portfolio/wwwroot/js/which-key.js", import.meta.url).href;
const whichKeyStub = `export { DELAY, leaderMaps, entries } from ${JSON.stringify(realWhichKey)};
const state = globalThis.whichKey;
export function isOpen() { return state.open; }
export function hide() { state.open = false; }
export function show(title, items, handlers) { state.open = true; state.titles.push(title); state.handlers = handlers; }`;
const whichKeyModule = `data:text/javascript;base64,${Buffer.from(whichKeyStub).toString("base64")}`;
const whichKey = globalThis.whichKey = { open: false, titles: [], handlers: null };
const timers = new Map();
let nextTimer = 1;
globalThis.setTimeout = (callback, delay) => { timers.set(nextTimer, { callback, delay }); return nextTimer++; };
globalThis.clearTimeout = id => timers.delete(id);
function flushTimers() {
    for (const [id, { callback }] of [...timers]) {
        timers.delete(id);
        callback();
    }
}
const module = await importHomeModule({
    "../js/nvim-cursor.js": cursorModule,
    "../js/which-key.js": whichKeyModule
});
let now = 100;
let helpOpen = false;
let helpDialog = {};
let reading = true;
let welcome = false;
const listeners = new Map();
const calls = [];
const allCursorCalls = globalThis.cursorCalls = [];
const cursorCalls = { get length() { return motionCalls().length; }, map: (...args) => motionCalls().map(...args) };
const motionCalls = () => allCursorCalls.filter(call => call[0] === "motion");
globalThis.performance = { now: () => now };
globalThis.Element = class {
    closest() { return null; }
};
globalThis.HTMLElement = class extends Element {};
const target = new HTMLElement();
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = {
    addEventListener: (event, handler) => listeners.set(event, handler),
    removeEventListener() {},
    querySelector: selector => selector === "dialog[open]" ? (helpOpen ? helpDialog : null)
        : selector === ".portfolio-shell" ? { dataset: { reading: String(reading) } }
            : selector === ".preview-scroll"
                ? { addEventListener() {}, focus() {}, dataset: { welcome: String(welcome) } } : null
};

function initialize(leader = "\\", enabled = true) {
    calls.length = 0;
    allCursorCalls.length = 0;
    helpOpen = false;
    helpDialog = {};
    reading = true;
    welcome = false;
    timers.clear();
    Object.assign(whichKey, { open: false, titles: [], handlers: null });
    module.initialize({ invokeMethodAsync: async (...args) => calls.push(args) }, enabled, leader);
}

async function key(value, extras = {}) {
    const event = { key: value, target, preventDefault() { this.prevented = true; }, ...extras };
    await listeners.get("keydown")(event);
    now += 10;
    return event;
}

test("help opens in the modal top layer and closes without redundant calls", () => {
    const calls = [];
    const dialog = {
        open: false,
        showModal() { this.open = true; calls.push("showModal"); },
        close() { this.open = false; calls.push("close"); }
    };
    module.setHelpOpen(dialog, false);
    module.setHelpOpen(dialog, true);
    module.setHelpOpen(dialog, true);
    assert.equal(dialog.open, true);
    module.setHelpOpen(dialog, false);
    module.setHelpOpen(dialog, false);
    assert.equal(dialog.open, false);
    assert.deepEqual(calls, ["showModal", "close"]);
});

test("leader ff opens search and consumes both f keys", async () => {
    initialize(" ");
    assert.equal((await key(" ")).prevented, true);
    assert.equal((await key("f")).prevented, true);
    assert.equal(calls.length, 0);
    await key("f");
    assert.deepEqual(calls, [["OnKeyDown", "<leader>ff", false]]);
});

test("Space and comma leaders work with ff and existing e mapping", async () => {
    for (const leader of [" ", ","]) {
        initialize(leader);
        await key(leader); await key("f"); await key("f");
        await key(leader); await key("e");
        assert.deepEqual(calls.map(call => call[1]), ["<leader>ff", "<leader>e"]);
    }
});

test("timeout resets between leader and f and between the two f keys", async () => {
    initialize();
    await key("\\"); now += 1001; await key("f"); await key("f");
    assert.equal(calls.length, 0);
    await key("\\"); await key("f"); now += 1001; await key("f");
    assert.equal(calls.length, 0);
});

test("Escape and unknown suffix cancel the sequence", async () => {
    initialize();
    await key("\\"); await key("f"); await key("Escape"); await key("f");
    await key("\\"); await key("x"); await key("f"); await key("f");
    assert.equal(calls.length, 0);
});

test("disabled keyboard, help, text fields and modal controls do not trigger search", async () => {
    initialize("\\", false);
    await key("\\"); await key("f"); await key("f");
    assert.equal(calls.length, 0);
    initialize();
    helpOpen = true;
    await key("\\"); await key("f"); await key("f");
    assert.equal(calls.length, 0);
    helpOpen = false;
    for (const selector of ["input, textarea, select, [contenteditable='true']", ".file-finder"]) {
        const control = new HTMLElement();
        control.closest = query => query === selector ? {} : null;
        await key("\\", { target: control });
        await key("f", { target: control });
        await key("f", { target: control });
        assert.equal(calls.length, 0);
    }
});

test("which-key shows after the delay and keeps the sequence alive", async () => {
    initialize(" ");
    await key(" ");
    assert.deepEqual([...timers.values()].map(timer => timer.delay), [300]);
    flushTimers();
    assert.deepEqual(whichKey.titles, ["<leader>"]);
    now += 5000;
    await key("s");
    assert.deepEqual(whichKey.titles, ["<leader>", "<leader>s"]);
    now += 5000;
    await key("k");
    assert.equal(whichKey.open, false);
    assert.deepEqual(calls, [["OnKeyDown", "<leader>sk", false]]);
});

test("which-key Backspace goes back and Escape closes", async () => {
    initialize(" ");
    await key(" "); flushTimers();
    await key("f");
    assert.equal((await key("Backspace")).prevented, true);
    assert.deepEqual(whichKey.titles, ["<leader>", "<leader>f", "<leader>"]);
    await key("e");
    assert.deepEqual(calls.map(call => call[1]), ["<leader>e"]);
    await key(" "); flushTimers();
    await key("Escape");
    assert.equal(whichKey.open, false);
    now += 5000;
    await key("e");
    assert.equal(calls.length, 1);
});

test("which-key rows run the selected key", async () => {
    initialize(" ");
    await key(" "); flushTimers();
    whichKey.handlers.onSelect("f");
    assert.deepEqual(whichKey.titles, ["<leader>", "<leader>f"]);
    whichKey.handlers.onSelect("f");
    await Promise.resolve();
    assert.deepEqual(calls, [["OnKeyDown", "<leader>ff", false]]);
    assert.equal(whichKey.open, false);
});

test("changing leader clears a pending ff sequence", async () => {
    initialize();
    await key("\\"); await key("f");
    module.applyLeader(",");
    await key("f");
    assert.equal(calls.length, 0);
    await key("Escape");
    await key(","); await key("f"); await key("f");
    assert.equal(calls[0][1], "<leader>ff");
});

test("Neovim-style ctrl, bracket and extended leader maps dispatch", async () => {
    initialize(" ");
    for (const letter of ["d", "u", "h", "l", "p", "c"]) {
        assert.equal((await key(letter, { ctrlKey: true })).prevented, true);
    }
    await key("]"); await key("]");
    await key("["); await key("[");
    await key(" "); await key("b"); await key("x");
    await key(" "); await key("s"); await key("k");
    await key(" "); await key("s"); await key("h");
    assert.deepEqual(calls.map(call => call[1]), [
        "<C-d>", "<C-u>", "<C-h>", "<C-l>", "<C-p>", "<C-c>", "<leader>bx", "<leader>sk", "<leader>sh"]);
    assert.deepEqual(cursorCalls.map(call => call[1]), ["headingForward", "headingBackward"]);
});

test("vim motions run in JS with counts while reading, gx and jumplist keys reach .NET", async () => {
    initialize(" ");
    for (const value of ["w", "3", "j", "f", "x", ";", "2", "g", "g", "g", "x"]) {
        assert.equal((await key(value)).prevented, true);
    }
    assert.equal((await key("o", { ctrlKey: true })).prevented, true);
    assert.equal((await key("i", { ctrlKey: true })).prevented, true);
    assert.deepEqual(calls.map(call => call[1]), ["gx", "<C-o>", "<C-i>"]);
    assert.deepEqual(cursorCalls.map(([, motion, count, options]) => [motion, count, options.hasCount, options.argument]), [
        ["wordForward", 1, false, undefined],
        ["down", 3, true, undefined],
        ["findForward", 1, false, "x"],
        ["repeatFind", 1, false, undefined],
        ["goToLineOrTop", 2, true, undefined]]);
});

test("character arguments win over the leader and shift is ignored", async () => {
    initialize(" ");
    await key("f"); await key(" ");
    await key("t"); await key("Shift"); await key("A", { shiftKey: true });
    await key(" "); await key("f"); await key("f");
    assert.deepEqual(cursorCalls.map(call => [call[1], call[3].argument]), [["findForward", " "], ["tillForward", "A"]]);
    assert.deepEqual(calls.map(call => call[1]), ["<leader>ff"]);
});

test("explorer keys still reach .NET while reading", async () => {
    initialize(" ");
    const entry = new HTMLElement();
    entry.closest = query => query === ".entry" ? entry : null;
    await key("j", { target: entry });
    for (const value of ["Enter", "p", "-", "?"]) await key(value);
    assert.deepEqual(calls.map(call => call.slice(1)), [["j", true], ["Enter", false], ["p", false], ["-", false], ["?", false]]);
    assert.equal(cursorCalls.length, 0);
});

test("unmapped ctrl combos and lone brackets keep browser behavior", async () => {
    initialize(" ");
    assert.notEqual((await key("t", { ctrlKey: true })).prevented, true);
    assert.notEqual((await key("d", { ctrlKey: true, shiftKey: true })).prevented, true);
    await key("]"); now += 1001; await key("]"); now += 1001;
    await key("["); await key("j"); await key("j");
    assert.equal(calls.length, 0);
    assert.deepEqual(cursorCalls.map(call => call[1]), ["down"]);
});
test("help dialog scrolls with vim keys and q closes it", async () => {
    initialize(" ");
    const scrolls = [];
    helpOpen = true;
    helpDialog = {
        clientHeight: 400,
        scrollHeight: 2000,
        scrollBy: options => scrolls.push(["by", options.top]),
        scrollTo: options => scrolls.push(["to", options.top])
    };
    for (const value of ["j", "k", "ArrowDown", "G", "g", "g"]) {
        assert.equal((await key(value)).prevented, true);
    }
    await key("d", { ctrlKey: true });
    await key("u", { ctrlKey: true });
    assert.deepEqual(scrolls, [
        ["by", 48], ["by", -48], ["by", 48], ["to", 2000], ["to", 0], ["by", 200], ["by", -200]]);
    assert.equal(calls.length, 0);
    assert.equal((await key("q")).prevented, true);
    assert.deepEqual(calls, [["OnKeyDown", "Escape", false]]);
});

test("colon still reaches the command line while keymaps are off", async () => {
    initialize(" ", false);
    await key("j"); await key("?");
    assert.equal(calls.length, 0);
    assert.equal((await key(":")).prevented, true);
    assert.deepEqual(calls, [["OnKeyDown", ":", false]]);
});

test("gx is forwarded on the welcome screen", async () => {
    initialize(" ");
    reading = false;
    welcome = true;
    await key("g"); await key("x");
    assert.deepEqual(calls.map(call => call[1]), ["g", "x"]);
    initialize(" ");
    reading = false;
    await key("x");
    assert.equal(calls.length, 0);
});

test("leader semicolon starts pick mode in JS without calling .NET", async () => {
    initialize(" ");
    await key(" ");
    assert.equal((await key(";")).prevented, true);
    assert.equal(calls.length, 0);
});
