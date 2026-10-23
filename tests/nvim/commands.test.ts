import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { handleCommand } from "../../src/nvim/commands.ts";
import { NavigationState } from "../../src/lib/navigation-state.ts";

const createState = (init: Partial<NavigationState> = {}): NavigationState =>
  Object.assign(new NavigationState(), init);

const assertStartsWith = (actual: string | null, prefix: string): void =>
  assert.ok(
    actual?.startsWith(prefix),
    `expected ${JSON.stringify(actual)} to start with ${JSON.stringify(prefix)}`,
  );

describe("CommandHandler", () => {
  describe("handle NvimTree commands set explorer", () => {
    const cases: [command: string, initiallyOpen: boolean, expected: boolean][] = [
      [":NvimTreeToggle", true, false],
      [":NvimTreeToggle", false, true],
      [":NvimTreeOpen", false, true],
      [":NvimTreeClose", true, false],
      [":nvimtreeclose", true, false],
    ];
    for (const [command, initiallyOpen, expected] of cases) {
      test(`${command} (initially open: ${initiallyOpen}) -> ${expected}`, () => {
        const state = createState({ isExplorerOpen: initiallyOpen, isCommandMode: true });

        const result = handleCommand(state, command);

        assert.equal(result, "SetExplorer");
        assert.equal(state.isExplorerOpen, expected);
        assert.equal(state.isCommandMode, false);
      });
    }
  });

  test("navigation state default leader is space", () => {
    const state = new NavigationState();

    assert.equal(state.leader, " ");
    assert.equal(state.leaderLabel, "Space");
  });

  describe("handle leader assignment updates leader", () => {
    const cases: [command: string, expected: string][] = [
      [':let mapleader = " "', " "],
      [":let mapleader=','", ","],
      [':let g:mapleader = ";"', ";"],
      [':lua vim.g.mapleader = ","', ","],
      [':let mapleader = "<Space>"', " "],
      [':let mapleader = "<Bslash>"', "\\"],
      [':let mapleader = "\\\\"', "\\"],
    ];
    for (const [command, expected] of cases) {
      test(`${JSON.stringify(command)} -> ${JSON.stringify(expected)}`, () => {
        const state = createState({ isCommandMode: true });

        const result = handleCommand(state, command);

        assert.equal(result, "SetLeader");
        assert.equal(state.leader, expected);
        assert.match(state.message ?? "", /to focus the explorer/);
        assert.equal(state.isCommandMode, false);
        assert.equal(state.commandText, "");
      });
    }
  });

  describe("handle invalid leader preserves existing leader and shows error", () => {
    const cases = [
      ':let mapleader = ""',
      ':let mapleader = "ab"',
      ':let mapleader = "\t"',
      ':let mapleader = "<CR>"',
      ':lua vim.g.mapleader = "ab"',
    ];
    for (const command of cases) {
      test(JSON.stringify(command), () => {
        const state = createState({ leader: "," });

        const result = handleCommand(state, command);

        assert.equal(result, "Invalid");
        assert.equal(state.leader, ",");
        assert.equal(state.message, "E474: Invalid argument: mapleader must be a single key");
      });
    }
  });

  test("handle malformed leader assignment preserves leader and reports invalid command", () => {
    const state = new NavigationState();

    const result = handleCommand(state, ":let mapleader = \",'");

    assert.equal(result, "Invalid");
    assert.equal(state.leader, " ");
    assertStartsWith(state.message, "E492: Not an editor command");
  });

  describe("handle listing commands return to explorer", () => {
    for (const command of [":Ex", ":Explore", ":q"]) {
      test(command, () => {
        const state = createState({ commandText: command, isCommandMode: true });
        state.openSelected();

        const result = handleCommand(state, state.commandText);

        assert.equal(result, "ReturnToListing");
        assert.equal(state.isReading, false);
        assert.equal(state.isCommandMode, false);
        assert.equal(state.commandText, "");
      });
    }
  });

  describe("handle help commands open help at the topic", () => {
    const helpTags = {
      "help.txt": "help",
      clipboard: "clipboard",
      "clipboard-errors": "clipboard",
      ":help": "commands",
    };
    const cases: [command: string, page: string, tag: string][] = [
      [":help", "help", "help.txt"],
      [":h", "help", "help.txt"],
      [":h clipboard", "clipboard", "clipboard"],
      [":help clipboard", "clipboard", "clipboard"],
      [":he clipboard-err", "clipboard", "clipboard-errors"],
      [":h help", "help", "help.txt"],
      [":h :hel", "commands", ":help"],
    ];
    for (const [command, page, tag] of cases) {
      test(command, () => {
        const state = createState({ commandText: command, isCommandMode: true, helpTags });

        const result = handleCommand(state, command);

        assert.equal(result, "OpenHelp");
        assert.equal(state.isHelpOpen, true);
        assert.equal(state.helpPage, page);
        assert.equal(state.helpTag, tag);
      });
    }
  });

  test("handle help for unknown topic reports E149", () => {
    const state = createState({ helpTags: { "help.txt": "help" } });

    const result = handleCommand(state, ":h nosuchthing");

    assert.equal(result, "Invalid");
    assert.equal(state.isHelpOpen, false);
    assert.equal(state.message, "E149: Sorry, no help for nosuchthing");
  });

  describe("handle quit commands close an open help window", () => {
    for (const command of [":helpclose", ":helpc", ":q", ":close"]) {
      test(command, () => {
        const state = createState({ isHelpOpen: true });
        state.openSelected();

        const result = handleCommand(state, command);

        assert.equal(result, "CloseHelp");
        assert.equal(state.isHelpOpen, false);
        assert.equal(state.isReading, true);
      });
    }
  });

  test("handle helpclose without help window does nothing", () => {
    const state = new NavigationState();

    assert.equal(handleCommand(state, ":helpclose"), "None");
  });

  test("handle search started from help searches the help window", () => {
    const state = createState({ isHelpOpen: true });
    state.beginSearch("help");

    assert.equal(handleCommand(state, "/yank"), "SearchHelp");
    assert.equal(state.helpSearchQuery, "yank");
    assert.equal(state.searchTarget, "readme");

    state.beginSearch("help");
    assert.equal(handleCommand(state, "/"), "SearchHelp");
    assert.equal(state.helpSearchQuery, "yank");
  });

  describe("handle keys option updates keyboard enabled", () => {
    const cases: [command: string, initial: boolean, expected: boolean][] = [
      [":set nokeys", true, false],
      [":set keys", false, true],
      [":se keys", false, true],
      [":set keys!", true, false],
      [":set keys!", false, true],
      [":set invkeys", true, false],
    ];
    for (const [command, initial, expected] of cases) {
      test(`${command} (initial: ${initial}) -> ${expected}`, () => {
        const state = createState({ keyboardEnabled: initial, isCommandMode: true });

        const result = handleCommand(state, command);

        assert.equal(result, "SetKeyboard");
        assert.equal(state.keyboardEnabled, expected);
        assert.equal(
          state.message,
          expected ? "Keymaps on." : "Keymaps off. Type :set keys to turn them back on.",
        );
        assert.equal(state.isCommandMode, false);
      });
    }
  });

  describe("handle dev option updates notation", () => {
    const cases: [command: string, initial: boolean, expected: boolean][] = [
      [":set nodev", true, false],
      [":set dev", false, true],
      [":set dev!", true, false],
      [":set invdev", false, true],
    ];
    for (const [command, initial, expected] of cases) {
      test(`${command} (initial: ${initial}) -> ${expected}`, () => {
        const state = createState({ devNotation: initial });

        const result = handleCommand(state, command);

        assert.equal(result, "SetDevNotation");
        assert.equal(state.devNotation, expected);
        assertStartsWith(
          state.message,
          expected ? "Vim notation" : "Plain notation: Space then f f",
        );
      });
    }
  });

  test("navigation state dev notation is on by default", () => {
    assert.equal(new NavigationState().devNotation, true);
  });

  describe("handle edit with open document reloads", () => {
    for (const command of [":e", ":edit"]) {
      test(command, () => {
        const state = new NavigationState();
        state.openSelected();

        const result = handleCommand(state, command);

        assert.equal(result, "Reload");
      });
    }
  });

  test("handle edit without document reports no file name", () => {
    const state = new NavigationState();

    const result = handleCommand(state, ":e");

    assert.equal(result, "Invalid");
    assert.equal(state.message, "E32: No file name");
  });

  test("handle unknown command shows neovim error", () => {
    const state = createState({ commandText: ":foo", isCommandMode: true });

    const result = handleCommand(state, state.commandText);

    assert.equal(result, "Invalid");
    assert.equal(state.message, "E492: Not an editor command: foo");
    assert.equal(state.isErrorMessage, true);
    assert.equal(state.isCommandMode, false);
  });
});
