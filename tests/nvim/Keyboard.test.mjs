import assert from "node:assert/strict";
import test from "node:test";
import {
  PREFIX_TIMEOUT_MS,
  isModifierKey,
} from "../../src/nvim/keyboard.js";

test("prefix timeout is the shared one-second boundary", () => {
  assert.equal(PREFIX_TIMEOUT_MS, 1000);
});

test("common modifiers are exact key names and exclude AltGraph and case variants", () => {
  for (const key of ["Shift", "Control", "Alt", "Meta", "CapsLock"])
    assert.equal(isModifierKey(key), true, `${key} is a common modifier`);
  for (const key of ["AltGraph", "a", "shift", "control", "ALT", "Capslock"])
    assert.equal(isModifierKey(key), false, `${key} is not a common modifier`);
});
