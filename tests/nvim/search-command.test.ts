import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { handleCommand } from "../../src/nvim/commands.ts";
import { KeymapHandler, type KeyAction } from "../../src/nvim/keymap.ts";
import { NavigationState } from "../../src/lib/navigation-state.ts";

const createState = (init: Partial<NavigationState> = {}): NavigationState =>
  Object.assign(new NavigationState(), init);

describe("SearchCommand", () => {
  test("handle slash command with open document starts readme search", () => {
    const state = createState({ isCommandMode: true, commandText: "/needle" });
    state.openSelected();

    const result = handleCommand(state, state.commandText);

    assert.equal(result, "SearchReadme");
    assert.equal(state.searchQuery, "needle");
    assert.equal(state.isCommandMode, false);
  });

  describe("handle no highlight command preserves search and clears command mode", () => {
    for (const command of [":nohl", ":nohlsearch", ":nohls"]) {
      test(command, () => {
        const state = createState({ isCommandMode: true, searchQuery: "needle" });

        const result = handleCommand(state, command);

        assert.equal(result, "ClearSearchHighlight");
        assert.equal(state.searchQuery, "needle");
        assert.equal(state.isCommandMode, false);
      });
    }
  });

  test("handle empty slash command with previous search repeats search", () => {
    const state = createState({ isCommandMode: true, commandText: "/", searchQuery: "needle" });
    state.openSelected();

    const result = handleCommand(state, state.commandText);

    assert.equal(result, "SearchReadme");
    assert.equal(state.searchQuery, "needle");
  });

  describe("handle slash command without pattern shows error", () => {
    for (const command of ["/", "/   "]) {
      test(JSON.stringify(command), () => {
        const state = createState({ isCommandMode: true });

        const result = handleCommand(state, command);

        assert.equal(result, "Invalid");
        assert.equal(state.message, "E35: No previous regular expression");
        assert.equal(state.isErrorMessage, true);
        assert.equal(state.isCommandMode, false);
      });
    }
  });

  test("handle slash command without open document shows error", () => {
    const state = createState({ isCommandMode: true });

    const result = handleCommand(state, "/needle");

    assert.equal(result, "Invalid");
    assert.equal(state.message, "E486: Pattern not found: needle");
    assert.equal(state.isErrorMessage, true);
  });

  test("handle slash key enters search command mode", () => {
    const state = new NavigationState();

    const result = new KeymapHandler().handle(state, "/");

    assert.equal(result, "FocusCommand");
    assert.equal(state.isCommandMode, true);
    assert.equal(state.commandText, "/");
  });

  test("handle slash key when keyboard disabled still enters search command mode", () => {
    const state = createState({ keyboardEnabled: false });

    const result = new KeymapHandler().handle(state, "/");

    assert.equal(result, "FocusCommand");
    assert.equal(state.isCommandMode, true);
    assert.equal(state.commandText, "/");
  });

  describe("handle search navigation when search exists moves through matches", () => {
    const cases: [key: string, expected: KeyAction][] = [
      ["n", "NextSearchMatch"],
      ["N", "PreviousSearchMatch"],
    ];
    for (const [key, expected] of cases) {
      test(`${key} -> ${expected}`, () => {
        const state = createState({ searchQuery: "needle" });
        state.openSelected();

        assert.equal(new KeymapHandler().handle(state, key), expected);
      });
    }
  });
});
