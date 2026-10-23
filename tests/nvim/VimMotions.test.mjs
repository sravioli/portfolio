import assert from "node:assert/strict";
import test from "node:test";
import {
  createMotionParser,
  isModifierKey,
} from "../../src/nvim/vim-motions.js";

let now = 0;

function parse(...keys) {
  const parser = createMotionParser({ now: () => now });
  return keys.map((key) => {
    const result = parser.feed(key);
    now += 10;
    return result.status === "motion"
      ? [result.motion, result.count, result.hasCount, result.argument].filter(
          (value) => value !== undefined,
        )
      : result.status;
  });
}

test("single-key motions map to cursor commands", () => {
  const keys = [
    "h",
    "l",
    "j",
    "k",
    "0",
    "^",
    "$",
    "|",
    "+",
    "_",
    "w",
    "W",
    "b",
    "B",
    "e",
    "E",
    "G",
    "H",
    "M",
    "L",
    "(",
    ")",
    "{",
    "}",
    "%",
    ";",
    ",",
    "n",
    "N",
  ];
  assert.deepEqual(
    parse(...keys).map((result) => result[0]),
    [
      "left",
      "right",
      "down",
      "up",
      "lineStart",
      "firstNonBlank",
      "lineEnd",
      "column",
      "nextLineStart",
      "currentLineStart",
      "wordForward",
      "bigWordForward",
      "wordBackward",
      "bigWordBackward",
      "wordEnd",
      "bigWordEnd",
      "goToLineOrBottom",
      "screenTop",
      "screenMiddle",
      "screenBottom",
      "sentenceBackward",
      "sentenceForward",
      "paragraphBackward",
      "paragraphForward",
      "matchOrPercent",
      "repeatFind",
      "repeatFindReverse",
      "searchNext",
      "searchPrevious",
    ],
  );
});

test("counts n and N search-match motions", () => {
  assert.deepEqual(parse("1", "0", "N", "n"), [
    "pending",
    "pending",
    ["searchPrevious", 10, true],
    ["searchNext", 1, false],
  ]);
});

test("counts prefix motions and zero continues a count", () => {
  assert.deepEqual(parse("1", "0", "j"), [
    "pending",
    "pending",
    ["down", 10, true],
  ]);
  assert.deepEqual(parse("0"), [["lineStart", 1, false]]);
  assert.deepEqual(parse("5", "0", "%"), [
    "pending",
    "pending",
    ["matchOrPercent", 50, true],
  ]);
});

test("g, bracket, find and mark prefixes take a second key", () => {
  assert.deepEqual(
    parse("g", "g", "g", "e", "g", "_", "g", "m", "g", "M", "g", "x").filter(
      Array.isArray,
    ),
    [
      ["goToLineOrTop", 1, false],
      ["wordEndBackward", 1, false],
      ["lastNonBlank", 1, false],
      ["screenColumnMiddle", 1, false],
      ["textMiddle", 1, false],
      ["followLink", 1, false],
    ],
  );
  assert.deepEqual(
    parse("]", "]", "[", "[", "]", "[", "[", "]", "[", "(", "]", "}")
      .filter(Array.isArray)
      .map((result) => result[0]),
    [
      "headingForward",
      "headingBackward",
      "sectionEndForward",
      "sectionEndBackward",
      "unmatchedParenBackward",
      "unmatchedBraceForward",
    ],
  );
  assert.deepEqual(parse("2", "t", ")"), [
    "pending",
    "pending",
    ["tillForward", 2, true, ")"],
  ]);
  assert.deepEqual(parse("F", " "), [
    "pending",
    ["findBackward", 1, false, " "],
  ]);
  assert.deepEqual(parse("m", "a", "'", "a", "`", "Z", "'", "'"), [
    "pending",
    ["setMark", 1, false, "a"],
    "pending",
    ["markLine", 1, false, "a"],
    "pending",
    ["markExact", 1, false, "Z"],
    "pending",
    ["markLine", 1, false, "'"],
  ]);
});

test("z prefixes scroll the cursor line", () => {
  assert.deepEqual(
    parse(
      "z",
      "z",
      "z",
      "t",
      "z",
      "b",
      "z",
      "Enter",
      "z",
      ".",
      "z",
      "-",
    ).filter(Array.isArray),
    [
      ["scrollCursorMiddle", 1, false],
      ["scrollCursorTop", 1, false],
      ["scrollCursorBottom", 1, false],
      ["scrollLineTop", 1, false],
      ["scrollLineMiddle", 1, false],
      ["scrollLineBottom", 1, false],
    ],
  );
  assert.deepEqual(parse("1", "2", "z", "z"), [
    "pending",
    "pending",
    "pending",
    ["scrollCursorMiddle", 12, true],
  ]);
  assert.deepEqual(parse("z", "q"), ["pending", "cancelled"]);
});

test("invalid suffixes, Escape and timeouts cancel pending prefixes", () => {
  assert.deepEqual(parse("g", "q"), ["pending", "cancelled"]);
  assert.deepEqual(parse("m", "1"), ["pending", "cancelled"]);
  assert.deepEqual(parse("3", "Escape", "j"), [
    "pending",
    "cancelled",
    ["down", 1, false],
  ]);
  const parser = createMotionParser({ now: () => now });
  parser.feed("g");
  now += 1000;
  assert.deepEqual(parser.feed("j"), {
    status: "motion",
    motion: "down",
    count: 1,
    hasCount: false,
  });
  parser.feed("f");
  now += 5000;
  assert.equal(parser.awaitsArgument(), true);
  assert.equal(parser.feed("x").argument, "x");
});

test("modifier keys keep pending state and unknown keys pass through", () => {
  assert.equal(isModifierKey("Shift"), true);
  assert.deepEqual(parse("f", "Shift", "A"), [
    "pending",
    "pending",
    ["findForward", 1, false, "A"],
  ]);
  assert.deepEqual(parse("Enter", "p", "-", ":", "?"), [
    "none",
    "none",
    "none",
    "none",
    "none",
  ]);
});

test("all modifiers preserve a counted Vim prefix, including Vim-only AltGraph", () => {
  for (const key of [
    "Shift",
    "Control",
    "Alt",
    "Meta",
    "CapsLock",
    "AltGraph",
  ]) {
    assert.equal(isModifierKey(key), true, `${key} is recognized by Vim`);
    const parser = createMotionParser({ now: () => 0 });
    assert.deepEqual(parser.feed("2"), { status: "pending" });
    assert.deepEqual(parser.feed("g"), { status: "pending" });
    assert.deepEqual(parser.feed(key), { status: "pending" });
    assert.deepEqual(parser.feed("e"), {
      status: "motion",
      motion: "wordEndBackward",
      count: 2,
      hasCount: true,
    });
  }
});

test("g-e prefix distinguishes just-before, exact, and just-after timeout boundaries", () => {
  for (const [elapsed, expected] of [
    [999, "wordEndBackward"],
    [1000, "wordEnd"],
    [1001, "wordEnd"],
  ]) {
    let time = 0;
    const parser = createMotionParser({ now: () => time });
    parser.feed("g");
    time = elapsed;
    assert.equal(parser.feed("e").motion, expected, `${elapsed}ms`);
  }
});

test("argument prefixes never expire and ordinary prefix expiry retains the count", () => {
  for (const [prefix, argument, motion] of [
    ["f", "x", "findForward"],
    ["m", "q", "setMark"],
  ]) {
    let time = 0;
    const parser = createMotionParser({ now: () => time });
    parser.feed(prefix);
    time = 10_000;
    assert.equal(parser.awaitsArgument(), true);
    assert.deepEqual(parser.feed(argument), {
      status: "motion",
      motion,
      count: 1,
      hasCount: false,
      argument,
    });
  }

  let time = 0;
  const parser = createMotionParser({ now: () => time });
  parser.feed("3");
  parser.feed("g");
  time = 1000;
  assert.deepEqual(parser.feed("e"), {
    status: "motion",
    motion: "wordEnd",
    count: 3,
    hasCount: true,
  });
});

function operate(keys, { visual = false } = {}) {
  const parser = createMotionParser({ now: () => now, visual: () => visual });
  return keys.map((key) => {
    const result = parser.feed(key);
    now += 10;
    if (result.status === "operator")
      return [result.operator, result.motion, result.count, result.argument].filter(
        (value) => value !== undefined,
      );
    if (result.status === "command") return [result.command, result.count];
    return result.status;
  });
}

test("y takes a motion, yy and Y yank lines and to the line end, and counts multiply", () => {
  assert.deepEqual(operate(["y", "y"]), ["pending", ["yank", "line", 1]]);
  assert.deepEqual(operate(["3", "y", "y"]), ["pending", "pending", ["yank", "line", 3]]);
  assert.deepEqual(operate(["Y"]), [["yank", "lineEnd", 1]]);
  assert.deepEqual(operate(["2", "y", "3", "w"]), ["pending", "pending", "pending", ["yank", "wordForward", 6]]);
  assert.deepEqual(operate(["y", "f", "y"]), ["pending", "pending", ["yank", "findForward", 1, "y"]]);
  assert.deepEqual(operate(["y", "g", "g"]), ["pending", "pending", ["yank", "goToLineOrTop", 1]]);
  assert.deepEqual(operate(["y", "i", "w"]), ["pending", "pending", ["yank", "textObject", 1, "iw"]]);
  assert.deepEqual(operate(["y", "a", '"']), ["pending", "pending", ["yank", "textObject", 1, 'a"']]);
});

test("y cancels on motions it cannot take and on Escape", () => {
  assert.deepEqual(operate(["y", "n"]), ["pending", "cancelled"]);
  assert.deepEqual(operate(["y", "z", "z"]), ["pending", "pending", "cancelled"]);
  assert.deepEqual(operate(["y", "m", "a"]), ["pending", "pending", "cancelled"]);
  assert.deepEqual(operate(["y", "i", "x"]), ["pending", "pending", "cancelled"]);
  assert.deepEqual(operate(["y", "Escape"]), ["pending", "cancelled"]);
  assert.deepEqual(operate(["y", "v"]), ["pending", "cancelled"]);
  // i and a are not motions outside Visual mode or an operator.
  assert.deepEqual(operate(["i"]), ["none"]);
});

test("v, V, and gv start Visual mode; Visual mode keys yank, swap, and select objects", () => {
  assert.deepEqual(operate(["v"]), [["visualChar", 1]]);
  assert.deepEqual(operate(["V"]), [["visualLine", 1]]);
  assert.deepEqual(operate(["g", "v"]), ["pending", ["reselectVisual", 1]]);
  assert.deepEqual(operate(["y"], { visual: true }), [["yank", 1]]);
  assert.deepEqual(operate(["Y"], { visual: true }), [["yankLines", 1]]);
  assert.deepEqual(operate(["o"], { visual: true }), [["swapVisual", 1]]);
  assert.deepEqual(operate(["O"], { visual: true }), [["swapVisual", 1]]);
  assert.deepEqual(operate(["o"]), ["none"]);
  assert.deepEqual(parseVisual(["i", "w"]), ["pending", ["textObject", 1, false, "iw"]]);
  assert.deepEqual(parseVisual(["j"]), [["down", 1, false]]);
});

function parseVisual(keys) {
  const parser = createMotionParser({ now: () => now, visual: () => true });
  return keys.map((key) => {
    const result = parser.feed(key);
    return result.status === "motion"
      ? [result.motion, result.count, result.hasCount, result.argument].filter(
          (value) => value !== undefined,
        )
      : result.status;
  });
}

test("s starts a flash jump, also after y", () => {
  const parser = createMotionParser({ now: () => now });
  assert.deepEqual(parser.feed("s"), { status: "flash", count: 1 });
  parser.feed("y");
  assert.deepEqual(parser.feed("s"), { status: "flash", count: 1, operator: "yank" });
  assert.equal(parser.isPending(), false);
});

test("f, F, t, and T repeat when pressed again, like flash.nvim's char mode", () => {
  const parser = createMotionParser({ now: () => now });
  parser.feed("f");
  assert.equal(parser.feed("x").motion, "findForward");
  assert.equal(parser.charActive(), true);
  assert.equal(parser.feed("f").motion, "repeatFind");
  assert.equal(parser.feed("F").motion, "repeatFindReverse");
  assert.equal(parser.feed(";").motion, "repeatFind");
  assert.equal(parser.feed(",").motion, "repeatFindReverse");
  assert.equal(parser.charActive(), true);
  assert.equal(parser.feed("w").motion, "wordForward");
  assert.equal(parser.charActive(), false);
  assert.equal(parser.feed("f").status, "pending");

  parser.reset();
  parser.feed("T");
  parser.feed("x");
  // After T, the lowercase key goes on backward and the capital goes forward.
  assert.equal(parser.feed("t").motion, "repeatFind");
  assert.equal(parser.feed("T").motion, "repeatFindReverse");
  assert.equal(parser.feed("Escape").status, "cancelled");
  assert.equal(parser.charActive(), false);

  parser.feed("y");
  parser.feed("f");
  assert.equal(parser.feed("x").status, "operator");
  assert.equal(parser.charActive(), false);
  parser.feed("f");
  parser.feed("x");
  parser.reset();
  assert.equal(parser.charActive(), false);
});
