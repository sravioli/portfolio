import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { KeymapHandler, type KeyAction } from "../../src/nvim/keymap.ts";
import { NavigationState } from "../../src/lib/navigation-state.ts";

describe("NeovimKeymap", () => {
  describe("handle reading maps return expected action", () => {
    const cases: [key: string, expected: KeyAction][] = [
      ["<C-d>", "HalfPageDown"],
      ["<C-u>", "HalfPageUp"],
      ["]]", "NextHeading"],
      ["[[", "PreviousHeading"],
      ["<C-l>", "FocusPreview"],
      ["<C-h>", "FocusExplorer"],
      ["<C-p>", "OpenFileFinder"],
      ["<leader>bx", "CloseDocument"],
      ["<C-c>", "CopyDocument"],
    ];
    for (const [key, expected] of cases) {
      test(`${key} -> ${expected}`, () => {
        const state = new NavigationState();
        state.navigateTo("memo.wz");

        assert.equal(new KeymapHandler().handle(state, key), expected);
      });
    }
  });

  describe("handle reading only maps on splash are ignored", () => {
    for (const key of ["<C-d>", "<C-u>", "]]", "[[", "<C-l>", "<leader>bx", "<C-c>"]) {
      test(key, () => {
        assert.equal(new KeymapHandler().handle(new NavigationState(), key), "Ignored");
      });
    }
  });

  describe("handle cursor maps in preview return cursor action", () => {
    const cases: [key: string, expected: KeyAction][] = [
      ["h", "CursorLeft"],
      ["l", "CursorRight"],
      ["w", "WordForward"],
      ["b", "WordBackward"],
      ["e", "WordEnd"],
      ["0", "LineStart"],
      ["$", "LineEnd"],
      ["Enter", "OpenLink"],
      ["<C-o>", "JumpBack"],
      ["<C-i>", "JumpForward"],
    ];
    for (const [key, expected] of cases) {
      test(`${key} -> ${expected}`, () => {
        const state = new NavigationState();
        state.navigateTo("memo.wz");

        assert.equal(new KeymapHandler().handle(state, key), expected);
        assert.equal(state.isReading, true);
      });
    }
  });

  test("handle gx in preview follows link", () => {
    const state = new NavigationState();
    state.navigateTo("memo.wz");
    const keymap = new KeymapHandler();

    assert.equal(keymap.handle(state, "g"), "Changed");
    assert.equal(keymap.handle(state, "x"), "FollowLink");
    assert.equal(keymap.handle(state, "x"), "Ignored");
  });

  describe("handle cursor maps on splash are ignored", () => {
    for (const key of ["w", "<C-o>", "$"]) {
      test(key, () => {
        assert.equal(new KeymapHandler().handle(new NavigationState(), key), "Ignored");
      });
    }
  });

  describe("handle removed search help maps are ignored", () => {
    for (const key of ["<leader>sk", "<leader>sh"]) {
      test(key, () => {
        const state = new NavigationState();

        assert.equal(new KeymapHandler().handle(state, key), "Ignored");
        assert.equal(state.isHelpOpen, false);
      });
    }
  });
});
