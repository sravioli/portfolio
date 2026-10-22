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
