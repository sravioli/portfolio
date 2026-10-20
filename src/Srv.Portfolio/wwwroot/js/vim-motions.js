// Parses Vim normal-mode motion keys (`:help motion.txt`) into commands for the README cursor.
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
const MARK_ARGUMENT = { m: "setMark", "'": "markLine", "`": "markExact" };

const Z_PREFIXED = {
  z: "scrollCursorMiddle",
  t: "scrollCursorTop",
  b: "scrollCursorBottom",
  Enter: "scrollLineTop",
  ".": "scrollLineMiddle",
  "-": "scrollLineBottom",
};

export function isModifierKey(key) {
  return key === "AltGraph" || isCommonModifierKey(key);
}

export function createMotionParser({ now = () => performance.now() } = {}) {
  let count = "";
  let prefix = "";
  let prefixAt = 0;

  function reset() {
    count = "";
    prefix = "";
    prefixAt = 0;
  }

  function emit(motion, argument) {
    const result = {
      status: "motion",
      motion,
      count: Math.max(1, Number(count) || 1),
      hasCount: count !== "",
    };
    if (argument !== undefined) result.argument = argument;
    reset();
    return result;
  }

  function feed(key) {
    if (isModifierKey(key))
      return { status: prefix || count ? "pending" : "none" };
    if (key === "Escape") {
      const wasPending = prefix !== "" || count !== "";
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
      if (pending === "g")
        return key in G_PREFIXED ? emit(G_PREFIXED[key]) : cancel();
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
    if (key in SINGLE) return emit(SINGLE[key]);
    reset();
    return { status: "none" };
  }

  function cancel() {
    reset();
    return { status: "cancelled" };
  }

  function awaitsArgument() {
    return prefix in CHARACTER_ARGUMENT || prefix in MARK_ARGUMENT;
  }

  return {
    feed,
    reset,
    awaitsArgument,
    isPending: () => prefix !== "" || count !== "",
  };
}
