import assert from "node:assert/strict";
import test from "node:test";
import { importHomeModule } from "./helpers/import-source-module.mjs";

const cursorStub = [
  "move",
  "motion",
  "jumpHeading",
  "jump",
  "followLink",
  "imageUnderCursor",
  "refresh",
  "sync",
  "position",
  "placeAt",
  "jumpToElement",
  "invalidate",
  "setNavigator",
  "setMoveListener",
  "setModeListener",
  "visualMode",
  "toggleVisual",
  "endVisual",
  "swapVisual",
  "reselectVisual",
  "yank",
  "yankVisual",
  "selectObject",
  "dispose",
  "recordJump",
]
  .map(
    (name) =>
      `export function ${name}(...args) { globalThis.cursorCalls?.push(["${name}", ...args]); return false; }`,
  )
  .join("\n")
  .concat(
    "\nexport function createCursor() { return new Proxy({}, { get: (_, name) => (...args) => { if (name !== 'visualMode' && name !== 'endVisual') globalThis.helpCursorCalls?.push([name, ...args]); return false; } }); }",
  );
const cursorModule = `data:text/javascript;base64,${Buffer.from(cursorStub).toString("base64")}`;
const realWhichKey = new URL(
  "../../src/nvim/which-key.js",
  import.meta.url,
).href;
const whichKeyStub = `export { DELAY, leaderMaps, entries } from ${JSON.stringify(realWhichKey)};
const state = globalThis.whichKey;
export function isOpen() { return state.open; }
export function hide() { state.open = false; }
export function show(title, items, handlers) { state.open = true; state.titles.push(title); state.handlers = handlers; }`;
const whichKeyModule = `data:text/javascript;base64,${Buffer.from(whichKeyStub).toString("base64")}`;
const realPick = new URL("../../src/nvim/pick-menu.js", import.meta.url).href;
const pickStub = `export * from ${JSON.stringify(realPick)};
export function start() { globalThis.pickStarts++; return false; }`;
const pickModule = `data:text/javascript;base64,${Buffer.from(pickStub).toString("base64")}`;
const whichKey = (globalThis.whichKey = {
  open: false,
  titles: [],
  handlers: null,
});
const timers = new Map();
let nextTimer = 1;
globalThis.setTimeout = (callback, delay) => {
  timers.set(nextTimer, { callback, delay });
  return nextTimer++;
};
globalThis.clearTimeout = (id) => timers.delete(id);
function flushTimers() {
  for (const [id, { callback }] of [...timers]) {
    timers.delete(id);
    callback();
  }
}
const module = await importHomeModule({
  "../nvim/nvim-cursor.js": cursorModule,
  "../nvim/which-key.js": whichKeyModule,
  "../nvim/pick-menu.js": pickModule,
});
let now = 100;
let helpOpen = false;
let helpScroll = {};
let reading = true;
let welcome = false;
const listeners = new Map();
const calls = [];
const allCursorCalls = (globalThis.cursorCalls = []);
const helpCursorCalls = (globalThis.helpCursorCalls = []);
const cursorCalls = {
  get length() {
    return motionCalls().length;
  },
  map: (...args) => motionCalls().map(...args),
};
const motionCalls = () => allCursorCalls.filter((call) => call[0] === "motion");
globalThis.performance = { now: () => now };
globalThis.Element = class {
  closest() {
    return null;
  }
};
globalThis.HTMLElement = class extends Element {};
const target = new HTMLElement();
// An element inside the help window.
const helpTarget = new HTMLElement();
helpTarget.closest = (query) => (query === ".help-pane" ? helpTarget : null);
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = {
  addEventListener: (event, handler) => listeners.set(event, handler),
  removeEventListener() {},
  querySelector: (selector) =>
    selector === ".help-scroll"
      ? helpScroll
      : selector === ".portfolio-shell"
        ? {
            dataset: {
              reading: String(reading),
              help: helpOpen ? "open" : "closed",
            },
          }
        : selector === ".preview-scroll"
          ? {
              addEventListener() {},
              focus() {},
              dataset: { welcome: String(welcome) },
            }
          : null,
};

function initialize(leader = "\\", enabled = true) {
  globalThis.pickStarts = 0;
  calls.length = 0;
  allCursorCalls.length = 0;
  helpCursorCalls.length = 0;
  helpOpen = false;
  helpScroll = { addEventListener() {} };
  reading = true;
  welcome = false;
  timers.clear();
  Object.assign(whichKey, { open: false, titles: [], handlers: null });
  module.initialize(
    { invokeMethodAsync: async (...args) => calls.push(args) },
    enabled,
    leader,
  );
  // Setup calls such as setMoveListener are not motions.
  helpCursorCalls.length = 0;
}

async function key(value, extras = {}) {
  const event = {
    key: value,
    target,
    preventDefault() {
      this.prevented = true;
    },
    ...extras,
  };
  await listeners.get("keydown")(event);
  now += 10;
  return event;
}

test("leader ff opens search and consumes both f keys", async () => {
  initialize(" ");
  assert.equal((await key(" ")).prevented, true);
  assert.equal((await key("f")).prevented, true);
  assert.equal(calls.length, 0);
  await key("f");
  assert.deepEqual(calls, [["OnKeyDown", "<leader>ff", false]]);
});

test("native controls keep Enter and Space activation even with a Space leader", async () => {
  for (const selector of ["button", "a", "summary"]) {
    initialize(" ");
    const control = new HTMLElement();
    control.closest = (query) => query.split(", ").includes(selector) ? control : null;
    for (const value of ["Enter", " ", "Spacebar"]) {
      const event = await key(value, { target: control });
      assert.equal(event.prevented, undefined, `${selector}: ${value}`);
    }
    await key("f");
    assert.equal(whichKey.open, false);
    assert.deepEqual(calls, []);
  }
});

test("Space and comma leaders work with ff and existing e mapping", async () => {
  for (const leader of [" ", ","]) {
    initialize(leader);
    await key(leader);
    await key("f");
    await key("f");
    await key(leader);
    await key("e");
    assert.deepEqual(
      calls.map((call) => call[1]),
      ["<leader>ff", "<leader>e"],
    );
  }
});

test("timeout resets between leader and f and between the two f keys", async () => {
  initialize();
  await key("\\");
  now += 1001;
  await key("f");
  await key("f");
  assert.equal(calls.length, 0);
  await key("\\");
  await key("f");
  now += 1001;
  await key("f");
  assert.equal(calls.length, 0);
});

test("Escape and unknown suffix cancel the sequence", async () => {
  initialize();
  await key("\\");
  await key("f");
  await key("Escape");
  await key("f");
  await key("\\");
  await key("x");
  await key("f");
  await key("f");
  assert.equal(calls.length, 0);
});

test("disabled keyboard, help, text fields and modal controls do not trigger search", async () => {
  initialize("\\", false);
  await key("\\");
  await key("f");
  await key("f");
  assert.equal(calls.length, 0);
  initialize();
  helpOpen = true;
  await key("\\", { target: helpTarget });
  await key("f", { target: helpTarget });
  await key("f", { target: helpTarget });
  assert.equal(calls.length, 0);
  helpOpen = false;
  for (const selector of [
    "input, textarea, select, [contenteditable='true']",
    ".file-finder",
  ]) {
    const control = new HTMLElement();
    control.closest = (query) => (query === selector ? {} : null);
    await key("\\", { target: control });
    await key("f", { target: control });
    await key("f", { target: control });
    assert.equal(calls.length, 0);
  }
});

test("which-key shows after the delay and keeps the sequence alive", async () => {
  initialize(" ");
  await key(" ");
  assert.deepEqual(
    [...timers.values()].map((timer) => timer.delay),
    [300],
  );
  flushTimers();
  assert.deepEqual(whichKey.titles, ["<leader>"]);
  now += 5000;
  await key("f");
  assert.deepEqual(whichKey.titles, ["<leader>", "<leader>f"]);
  now += 5000;
  await key("f");
  assert.equal(whichKey.open, false);
  assert.deepEqual(calls, [["OnKeyDown", "<leader>ff", false]]);
});

test("which-key Backspace goes back and Escape closes", async () => {
  initialize(" ");
  await key(" ");
  flushTimers();
  await key("f");
  assert.equal((await key("Backspace")).prevented, true);
  assert.deepEqual(whichKey.titles, ["<leader>", "<leader>f", "<leader>"]);
  await key("e");
  assert.deepEqual(
    calls.map((call) => call[1]),
    ["<leader>e"],
  );
  await key(" ");
  flushTimers();
  await key("Escape");
  assert.equal(whichKey.open, false);
  now += 5000;
  await key("e");
  assert.equal(calls.length, 1);
});

test("which-key rows run the selected key", async () => {
  initialize(" ");
  await key(" ");
  flushTimers();
  whichKey.handlers.onSelect("f");
  assert.deepEqual(whichKey.titles, ["<leader>", "<leader>f"]);
  whichKey.handlers.onSelect("f");
  await Promise.resolve();
  assert.deepEqual(calls, [["OnKeyDown", "<leader>ff", false]]);
  assert.equal(whichKey.open, false);
});

test("changing leader clears a pending ff sequence", async () => {
  initialize();
  await key("\\");
  await key("f");
  module.applyLeader(",");
  await key("f");
  assert.equal(calls.length, 0);
  await key("Escape");
  await key(",");
  await key("f");
  await key("f");
  assert.equal(calls[0][1], "<leader>ff");
});

test("Neovim-style ctrl, bracket and extended leader maps dispatch", async () => {
  initialize(" ");
  for (const letter of ["d", "u", "h", "l", "p", "c"]) {
    assert.equal((await key(letter, { ctrlKey: true })).prevented, true);
  }
  await key("]");
  await key("]");
  await key("[");
  await key("[");
  await key(" ");
  await key("b");
  await key("x");
  assert.deepEqual(
    calls.map((call) => call[1]),
    [
      "<C-d>",
      "<C-u>",
      "<C-h>",
      "<C-l>",
      "<C-p>",
      "<C-c>",
      "<leader>bx",
    ],
  );
  assert.deepEqual(
    cursorCalls.map((call) => call[1]),
    ["headingForward", "headingBackward"],
  );
});

test("vim motions run in JS with counts while reading, gx and jumplist keys reach .NET", async () => {
  initialize(" ");
  for (const value of ["w", "3", "j", "f", "x", ";", "2", "g", "g", "g", "x"]) {
    assert.equal((await key(value)).prevented, true);
  }
  assert.equal((await key("o", { ctrlKey: true })).prevented, true);
  assert.equal((await key("i", { ctrlKey: true })).prevented, true);
  assert.deepEqual(
    calls.map((call) => call[1]),
    ["gx", "<C-o>", "<C-i>"],
  );
  assert.deepEqual(
    cursorCalls.map(([, motion, count, options]) => [
      motion,
      count,
      options.hasCount,
      options.argument,
    ]),
    [
      ["wordForward", 1, false, undefined],
      ["down", 3, true, undefined],
      ["findForward", 1, false, "x"],
      ["repeatFind", 1, false, undefined],
      ["goToLineOrTop", 2, true, undefined],
    ],
  );
});

test("y operators and Visual mode keys reach the README cursor", async () => {
  initialize(" ");
  for (const value of ["y", "y", "2", "y", "w", "y", "i", "w", "v", "V", "g", "v"])
    assert.equal((await key(value)).prevented, true);
  const edits = allCursorCalls
    .filter(([name]) => ["yank", "toggleVisual", "reselectVisual"].includes(name))
    .map(([name, ...args]) => [name, args[0], args[1]]);
  assert.deepEqual(edits, [
    ["yank", "line", 1],
    ["yank", "wordForward", 2],
    ["yank", "textObject", 1],
    ["toggleVisual", "char", undefined],
    ["toggleVisual", "line", undefined],
    ["reselectVisual", undefined, undefined],
  ]);
  assert.deepEqual(calls, []);
});

test("character arguments win over the leader and shift is ignored", async () => {
  initialize(" ");
  await key("f");
  await key(" ");
  await key("t");
  await key("Shift");
  await key("A", { shiftKey: true });
  await key(" ");
  await key("f");
  await key("f");
  assert.deepEqual(
    cursorCalls.map((call) => [call[1], call[3].argument]),
    [
      ["findForward", " "],
      ["tillForward", "A"],
    ],
  );
  assert.deepEqual(
    calls.map((call) => call[1]),
    ["<leader>ff"],
  );
});

test("explorer keys still reach .NET while reading", async () => {
  initialize(" ");
  const entry = new HTMLElement();
  entry.closest = (query) => (query === ".entry" ? entry : null);
  await key("j", { target: entry });
  for (const value of ["Enter", "p", "-", "?"]) await key(value);
  assert.deepEqual(
    calls.map((call) => call.slice(1)),
    [
      ["j", true],
      ["Enter", false],
      ["p", false],
      ["-", false],
      ["?", false],
    ],
  );
  assert.equal(cursorCalls.length, 0);
});

test("unmapped ctrl combos and lone brackets keep browser behavior", async () => {
  initialize(" ");
  assert.notEqual((await key("t", { ctrlKey: true })).prevented, true);
  assert.notEqual(
    (await key("d", { ctrlKey: true, shiftKey: true })).prevented,
    true,
  );
  await key("]");
  now += 1001;
  await key("]");
  now += 1001;
  await key("[");
  await key("j");
  await key("j");
  assert.equal(calls.length, 0);
  assert.deepEqual(
    cursorCalls.map((call) => call[1]),
    ["down"],
  );
});
test("help window moves its own cursor with vim motions and q closes it", async () => {
  initialize(" ");
  helpOpen = true;
  for (const value of ["j", "k", "ArrowDown", "G", "g", "g", "3", "w", "f", "q"]) {
    assert.equal((await key(value, { target: helpTarget })).prevented, true);
  }
  await key("d", { ctrlKey: true, target: helpTarget });
  await key("u", { ctrlKey: true, target: helpTarget });
  const plain = { hasCount: false, argument: undefined };
  assert.deepEqual(helpCursorCalls, [
    ["motion", "down", 1, plain],
    ["motion", "up", 1, plain],
    ["motion", "down", 1, plain],
    ["motion", "goToLineOrBottom", 1, plain],
    ["motion", "goToLineOrTop", 1, plain],
    ["motion", "wordForward", 3, { hasCount: true, argument: undefined }],
    ["motion", "findForward", 1, { hasCount: false, argument: "q" }],
    ["charSearch"],
    ["move", "halfDown"],
    ["move", "halfUp"],
  ]);
  assert.equal(motionCalls().length, 0);
  assert.equal(calls.length, 0);
  assert.equal((await key("q", { target: helpTarget })).prevented, true);
  assert.deepEqual(calls, [["OnHelpKey", "close"]]);
});

test("help window keys: tag stack, search, command line, and no identifier", async () => {
  initialize(" ");
  helpOpen = true;
  const press = (value, extras = {}) => key(value, { target: helpTarget, ...extras });
  await press("t", { ctrlKey: true });
  await press("o", { ctrlKey: true });
  await press("]", { ctrlKey: true });
  await press("/");
  await press("n");
  await press("N");
  await press(":");
  await press("Escape");
  assert.deepEqual(calls, [
    ["OnHelpKey", "back"],
    ["OnHelpKey", "back"],
    ["OnHelpKey", "no-identifier"],
    ["OnHelpKey", "search"],
    ["OnHelpKey", "next-match"],
    ["OnHelpKey", "previous-match"],
    ["OnKeyDown", ":", false],
    ["OnHelpKey", "close"],
  ]);
  calls.length = 0;
  assert.equal((await press("x")).prevented, undefined);
  assert.equal((await press("Enter")).prevented, undefined);
  assert.deepEqual(calls, []);
});

test("keys from the README beside the help window keep their meaning", async () => {
  initialize(" ");
  helpOpen = true;
  await key("j");
  assert.deepEqual(cursorCalls.map((call) => call[1]), ["down"]);
});

test("with keymaps off the help window still closes and searches", async () => {
  initialize(" ", false);
  helpOpen = true;
  await key("j", { target: helpTarget });
  await key("q", { target: helpTarget });
  await key("/", { target: helpTarget });
  await key("Escape", { target: helpTarget });
  assert.deepEqual(calls, [
    ["OnHelpKey", "search"],
    ["OnHelpKey", "close"],
  ]);
  assert.deepEqual(helpCursorCalls, []);
});

test("colon still reaches the command line while keymaps are off", async () => {
  initialize(" ", false);
  await key("j");
  await key("?");
  assert.equal(calls.length, 0);
  assert.equal((await key(":")).prevented, true);
  assert.deepEqual(calls, [["OnKeyDown", ":", false]]);
});

test("gx is forwarded on the welcome screen", async () => {
  initialize(" ");
  reading = false;
  welcome = true;
  await key("g");
  await key("x");
  assert.deepEqual(
    calls.map((call) => call[1]),
    ["g", "x"],
  );
  initialize(" ");
  reading = false;
  await key("x");
  assert.equal(calls.length, 0);
});

test("leader semicolon starts pick mode in JS without calling .NET", async () => {
  initialize(" ");
  await key(" ");
  assert.equal((await key(";")).prevented, true);
  assert.equal(globalThis.pickStarts, 1);
  assert.equal(calls.length, 0);
});

test("which-key picker row starts pick mode locally and closes the popup", async () => {
  initialize(",");
  await key(",");
  flushTimers();
  whichKey.handlers.onSelect(";");
  await Promise.resolve();
  assert.equal(globalThis.pickStarts, 1);
  assert.equal(whichKey.open, false);
  assert.equal(calls.length, 0);
});

test("picker leader binding stays inactive with disabled keys or help focus", async () => {
  initialize(" ", false);
  await key(" ");
  await key(";");
  assert.equal(globalThis.pickStarts, 0);
  assert.equal(calls.length, 0);

  initialize(" ");
  helpOpen = true;
  await key(" ", { target: helpTarget });
  await key(";", { target: helpTarget });
  assert.equal(globalThis.pickStarts, 0);
  assert.equal(calls.some(([method]) => method === "OnKeyDown"), false);
});
