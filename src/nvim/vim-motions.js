// Parses Vim normal-mode motion keys (`:help motion.txt`), the `y` operator, and Visual-mode keys into
// commands for the README cursor.
import {
  PREFIX_TIMEOUT_MS,
  isModifierKey as isCommonModifierKey,
} from "./keyboard.js";

const SINGLE = {
  h: "left",
  ArrowLeft: "left",
  Backspace: "left",
  l: "right",
  ArrowRight: "right",
  j: "down",
  ArrowDown: "down",
  k: "up",
  ArrowUp: "up",
  0: "lineStart",
  Home: "lineStart",
  "^": "firstNonBlank",
  $: "lineEnd",
  End: "lineEnd",
  "|": "column",
  "+": "nextLineStart",
  _: "currentLineStart",
  w: "wordForward",
  W: "bigWordForward",
  b: "wordBackward",
  B: "bigWordBackward",
  e: "wordEnd",
  E: "bigWordEnd",
  G: "goToLineOrBottom",
  H: "screenTop",
  M: "screenMiddle",
  L: "screenBottom",
  "(": "sentenceBackward",
  ")": "sentenceForward",
  "{": "paragraphBackward",
  "}": "paragraphForward",
  "%": "matchOrPercent",
  ";": "repeatFind",
  ",": "repeatFindReverse",
  n: "searchNext",
  N: "searchPrevious",
};

const G_PREFIXED = {
  g: "goToLineOrTop",
  j: "down",
  ArrowDown: "down",
  k: "up",
  ArrowUp: "up",
  e: "wordEndBackward",
  E: "bigWordEndBackward",
  _: "lastNonBlank",
  0: "lineStart",
  Home: "lineStart",
  "^": "firstNonBlank",
  $: "lineEnd",
  End: "lineEnd",
  m: "screenColumnMiddle",
  M: "textMiddle",
  x: "followLink",
};

const BRACKET_PREFIXED = {
  "[": {
    "[": "headingBackward",
    "]": "sectionEndBackward",
    "(": "unmatchedParenBackward",
    "{": "unmatchedBraceBackward",
  },
  "]": {
    "]": "headingForward",
    "[": "sectionEndForward",
    ")": "unmatchedParenForward",
    "}": "unmatchedBraceForward",
  },
};

const CHARACTER_ARGUMENT = {
  f: "findForward",
  F: "findBackward",
  t: "tillForward",
  T: "tillBackward",
};
const FIND_KEYS = Object.fromEntries(
  Object.entries(CHARACTER_ARGUMENT).map(([key, motion]) => [motion, key]),
);
const MARK_ARGUMENT = { m: "setMark", "'": "markLine", "`": "markExact" };

const Z_PREFIXED = {
  z: "scrollCursorMiddle",
  t: "scrollCursorTop",
  b: "scrollCursorBottom",
  Enter: "scrollLineTop",
  ".": "scrollLineMiddle",
  "-": "scrollLineBottom",
};

// Text objects (`:help text-objects`) after `i` or `a`, in Visual mode or after an operator.
const TEXT_OBJECTS = new Set([
  "w", "W", "s", "p", "(", ")", "b", "[", "]", "{", "}", "B", "<", ">", '"', "'", "`",
]);

// Motions an operator cannot take: they search, open, scroll, or set marks rather than move over text.
const NOT_OPERATOR_MOTIONS = new Set([
  "searchNext",
  "searchPrevious",
  "followLink",
  "setMark",
  ...Object.values(Z_PREFIXED),
]);

export function isModifierKey(key) {
  return key === "AltGraph" || isCommonModifierKey(key);
}

/**
 * `visual` tells whether the cursor is in Visual mode, where `y`, `o`, and text objects act on the selection.
 * Results have a `status`: "motion", "operator" (`y{motion}`, `yy`, `Y`), "command" (Visual-mode keys and
 * `gv`), "flash" (`s`, a flash.nvim jump, `:help flash`), "pending", "cancelled", or "none".
 *
 * After `f`, `F`, `t`, or `T`, the same key repeats the search like flash.nvim's char mode
 * (`:help flash-char`): the lowercase key goes on in the search's direction, the uppercase key goes back.
 */
export function createMotionParser({
  now = () => performance.now(),
  visual = () => false,
} = {}) {
  let count = "";
  let prefix = "";
  let prefixAt = 0;
  let operator = "";
  let operatorCount = "";
  // The f, F, t, or T key whose search can be repeated by pressing it again, or "" when none is active.
  let charMotion = "";

  function reset() {
    count = "";
    prefix = "";
    prefixAt = 0;
    operator = "";
    operatorCount = "";
  }

  function totalCount() {
    return Math.max(1, (Number(operatorCount) || 1) * (Number(count) || 1));
  }

  function emit(motion, argument) {
    if (operator && NOT_OPERATOR_MOTIONS.has(motion)) return cancel();
    const result = {
      status: operator ? "operator" : "motion",
      motion,
      count: totalCount(),
      hasCount: count !== "" || operatorCount !== "",
    };
    if (operator) result.operator = "yank";
    if (argument !== undefined) result.argument = argument;
    if (!operator && motion in FIND_KEYS) charMotion = FIND_KEYS[motion];
    reset();
    return result;
  }

  function command(name) {
    const result = { status: "command", command: name, count: totalCount() };
    reset();
    return result;
  }

  function feed(key) {
    if (isModifierKey(key))
      return { status: prefix || count || operator ? "pending" : "none" };
    const repeating = charMotion;
    charMotion = "";
    if (repeating && !prefix && !count && !operator) {
      if (key === "Escape") return { status: "cancelled" };
      if (key === ";" || key === ",") {
        charMotion = repeating;
        return emit(SINGLE[key]);
      }
      if (key.toLowerCase() === repeating.toLowerCase()) {
        charMotion = repeating;
        return emit(key === key.toLowerCase() ? "repeatFind" : "repeatFindReverse");
      }
    }
    if (key === "Escape") {
      const wasPending = prefix !== "" || count !== "" || operator !== "";
      reset();
      return { status: wasPending ? "cancelled" : "none" };
    }
    if (prefix && !awaitsArgument() && now() - prefixAt >= PREFIX_TIMEOUT_MS) {
      prefix = "";
    }
    if (prefix) {
      const pending = prefix;
      prefix = "";
      if (pending in CHARACTER_ARGUMENT) {
        return key.length === 1 || key === "Tab"
          ? emit(CHARACTER_ARGUMENT[pending], key === "Tab" ? "\t" : key)
          : cancel();
      }
      if (pending in MARK_ARGUMENT) {
        const valid =
          /^[a-zA-Z]$/.test(key) ||
          (pending !== "m" && (key === "'" || key === "`"));
        return valid ? emit(MARK_ARGUMENT[pending], key) : cancel();
      }
      if (pending === "i" || pending === "a")
        return TEXT_OBJECTS.has(key) ? emit("textObject", pending + key) : cancel();
      if (pending === "g") {
        if (key === "v" && !operator) return command("reselectVisual");
        return key in G_PREFIXED ? emit(G_PREFIXED[key]) : cancel();
      }
      if (pending === "z")
        return key in Z_PREFIXED ? emit(Z_PREFIXED[key]) : cancel();
      return key in BRACKET_PREFIXED[pending]
        ? emit(BRACKET_PREFIXED[pending][key])
        : cancel();
    }
    if (/^[1-9]$/.test(key) || (key === "0" && count)) {
      count = (count + key).slice(0, 6);
      return { status: "pending" };
    }
    const inVisual = visual();
    if (key === "y") {
      if (inVisual) return command("yank");
      if (operator) return emit("line");
      operator = "y";
      operatorCount = count;
      count = "";
      return { status: "pending" };
    }
    if (key === "Y") {
      if (inVisual) return command("yankLines");
      if (operator) return cancel();
      // Neovim maps `Y` to `y$`.
      operator = "y";
      return emit("lineEnd");
    }
    if (key === "v" || key === "V") {
      if (operator) return cancel();
      return command(key === "v" ? "visualChar" : "visualLine");
    }
    if ((key === "o" || key === "O") && inVisual && !operator)
      return command("swapVisual");
    if ((key === "i" || key === "a") && (operator || inVisual)) {
      prefix = key;
      prefixAt = now();
      return { status: "pending" };
    }
    if (
      key === "g" ||
      key === "z" ||
      key === "[" ||
      key === "]" ||
      key in CHARACTER_ARGUMENT ||
      key in MARK_ARGUMENT
    ) {
      prefix = key;
      prefixAt = now();
      return { status: "pending" };
    }
    if (key === "s") {
      // flash.nvim's jump (`:help flash-jump`); the caller reads the search pattern and labels.
      const result = { status: "flash", count: totalCount() };
      if (operator) result.operator = "yank";
      reset();
      return result;
    }
    if (key in SINGLE) return emit(SINGLE[key]);
    if (operator) return cancel();
    reset();
    return { status: "none" };
  }

  function cancel() {
    reset();
    return { status: "cancelled" };
  }

  // Character, mark, and text-object arguments take any key and never time out.
  function awaitsArgument() {
    return (
      prefix in CHARACTER_ARGUMENT ||
      prefix in MARK_ARGUMENT ||
      prefix === "i" ||
      prefix === "a"
    );
  }

  return {
    feed,
    reset() {
      reset();
      charMotion = "";
    },
    awaitsArgument,
    isPending: () => prefix !== "" || count !== "" || operator !== "",
    /** Whether f, F, t, or T can be repeated by pressing it again (`:help flash-char`). */
    charActive: () => charMotion !== "",
  };
}
