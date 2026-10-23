import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { rootEntry } from "../../src/lib/catalog.ts";
import { KeymapHandler } from "../../src/nvim/keymap.ts";
import { NavigationState } from "../../src/lib/navigation-state.ts";

const createState = (init: Partial<NavigationState> = {}): NavigationState =>
  Object.assign(new NavigationState(), init);

describe("KeymapHandler", () => {
  test("handle leader e in explorer closes it", () => {
    const state = new NavigationState();

    const result = new KeymapHandler().handle(state, "<leader>e", true);

    assert.equal(result, "CloseExplorer");
    assert.equal(state.isExplorerOpen, false);
  });

  describe("handle explorer keys open closed explorer", () => {
    for (const key of ["<leader>e", "<C-h>"]) {
      test(key, () => {
        const state = createState({ isExplorerOpen: false });

        const result = new KeymapHandler().handle(state, key);

        assert.equal(result, "FocusExplorer");
        assert.equal(state.isExplorerOpen, true);
      });
    }
  });

  test("handle ctrl h in explorer keeps it open", () => {
    const state = new NavigationState();

    const result = new KeymapHandler().handle(state, "<C-h>", true);

    assert.equal(result, "FocusExplorer");
    assert.equal(state.isExplorerOpen, true);
  });

  test("handle selection motion opens closed explorer", () => {
    const state = createState({ isExplorerOpen: false });

    const result = new KeymapHandler().handle(state, "j");

    assert.equal(result, "Changed");
    assert.equal(state.isExplorerOpen, true);
    assert.equal(state.selectedIndex, 1);
  });

  test("handle leader ff opens file finder without changing current document", () => {
    const state = new NavigationState();
    state.navigateTo("memo.wz");
    const previousIndex = state.selectedIndex;

    const result = new KeymapHandler().handle(state, "<leader>ff");

    assert.equal(result, "OpenFileFinder");
    assert.equal(state.currentDocument?.repository, "memo.wz");
    assert.equal(state.selectedIndex, previousIndex);
    assert.equal(state.isReading, true);
  });

  describe("handle leader ff when unavailable does not open file finder", () => {
    const cases: [helpOpen: boolean, keyboardDisabled: boolean][] = [
      [false, true],
    ];
    for (const [helpOpen, keyboardDisabled] of cases) {
      test(`help open: ${helpOpen}, keyboard disabled: ${keyboardDisabled}`, () => {
        const state = createState({ isHelpOpen: helpOpen, keyboardEnabled: !keyboardDisabled });

        assert.equal(new KeymapHandler().handle(state, "<leader>ff"), "Ignored");
      });
    }
  });

  test("help window beside the README does not block README keys", () => {
    const state = createState({ isHelpOpen: true });

    assert.equal(new KeymapHandler().handle(state, "<leader>ff"), "OpenFileFinder");
    assert.equal(state.isHelpOpen, true);
  });

  test("handle question mark opens help at the top of help.txt", () => {
    const state = createState({ helpTags: { "help.txt": "help", clipboard: "clipboard" } });

    const result = new KeymapHandler().handle(state, "?");

    assert.equal(result, "OpenHelp");
    assert.equal(state.isHelpOpen, true);
    assert.equal(state.helpPage, "help");
    assert.equal(state.helpTag, "help.txt");
  });

  test("handle escape closes help opened beside the README", () => {
    const state = createState({ isHelpOpen: true, helpSearchQuery: "yank" });

    const result = new KeymapHandler().handle(state, "Escape");

    assert.equal(result, "Changed");
    assert.equal(state.isHelpOpen, false);
    assert.equal(state.helpSearchQuery, "");
  });

  test("handle enter on folder while reading toggles inline and keeps explorer focus", () => {
    const state = new NavigationState();
    state.openSelected();
    state.selectIndex(4);

    const result = new KeymapHandler().handle(state, "Enter", true);

    assert.equal(result, "FocusExplorer");
    assert.equal(state.selectedEntry.isExpanded, true);
    assert.equal(state.currentDocument, rootEntry);
    assert.equal(state.isReading, true);
  });

  test("handle h in focused explorer collapses folder without closing document", () => {
    const state = new NavigationState();
    state.navigateTo("memo.wz");
    const handler = new KeymapHandler();

    handler.handle(state, "h", true);
    const result = handler.handle(state, "h", true);

    assert.equal(result, "FocusExplorer");
    assert.equal(state.selectedEntry.name, "wezterm-plugins/");
    assert.equal(state.selectedEntry.isExpanded, false);
    assert.equal(state.isReading, true);
  });

  test("handle leader e focuses explorer without closing readme", () => {
    const state = new NavigationState();
    state.openSelected();

    const result = new KeymapHandler().handle(state, "<leader>e");

    assert.equal(result, "FocusExplorer");
    assert.equal(state.isReading, true);
    assert.equal(state.currentDocument, rootEntry);
  });

  describe("handle explorer focused while reading moves selection instead of scrolling", () => {
    const cases: [key: string, expected: number][] = [
      ["j", 1],
      ["ArrowDown", 1],
      ["G", 5],
    ];
    for (const [key, expected] of cases) {
      test(`${key} -> ${expected}`, () => {
        const state = new NavigationState();
        state.openSelected();

        const result = new KeymapHandler().handle(state, key, true);

        assert.equal(result, "Changed");
        assert.equal(state.selectedIndex, expected);
        assert.equal(state.isReading, true);
      });
    }
  });

  test("handle preview focused while reading scrolls instead of moving selection", () => {
    const state = new NavigationState();
    state.openSelected();

    const result = new KeymapHandler().handle(state, "j");

    assert.equal(result, "ScrollDown");
    assert.equal(state.selectedIndex, 0);
  });

  describe("handle leader e when unavailable does not focus explorer", () => {
    const cases: [helpOpen: boolean, keyboardDisabled: boolean][] = [
      [false, true],
    ];
    for (const [helpOpen, keyboardDisabled] of cases) {
      test(`help open: ${helpOpen}, keyboard disabled: ${keyboardDisabled}`, () => {
        const state = createState({ isHelpOpen: helpOpen, keyboardEnabled: !keyboardDisabled });

        const result = new KeymapHandler().handle(state, "<leader>e");

        assert.equal(result, "Ignored");
      });
    }
  });

  test("handle j and k in explorer moves selection", () => {
    const state = new NavigationState();
    state.goToParent();
    const handler = new KeymapHandler();

    handler.handle(state, "j");
    handler.handle(state, "k");

    assert.equal(state.selectedIndex, 0);
  });

  test("handle gg in explorer selects first entry", () => {
    const state = new NavigationState();
    state.goToParent();
    state.moveSelection(3);
    const handler = new KeymapHandler();

    handler.handle(state, "g");
    const result = handler.handle(state, "g");

    assert.equal(result, "Changed");
    assert.equal(state.selectedIndex, 0);
  });

  test("handle p in readme toggles raw view", () => {
    const state = new NavigationState();
    state.openSelected();
    const handler = new KeymapHandler();

    handler.handle(state, "p");

    assert.equal(state.isRawView, true);
  });

  test("handle when keyboard is disabled does not change state", () => {
    const state = createState({ keyboardEnabled: false });
    const handler = new KeymapHandler();

    const result = handler.handle(state, "p");

    assert.equal(result, "Ignored");
    assert.equal(state.isRawView, false);
  });

  test("handle colon when keyboard is disabled still enters command mode", () => {
    const state = createState({ keyboardEnabled: false });

    const result = new KeymapHandler().handle(state, ":");

    assert.equal(result, "FocusCommand");
    assert.equal(state.isCommandMode, true);
    assert.equal(state.commandText, ":");
  });

  test("handle gx sequence follows link while reading or on welcome", () => {
    const reading = new NavigationState();
    reading.openSelected();
    const welcome = new NavigationState();
    const closed = new NavigationState();
    closed.openSelected();
    closed.goToParent();

    assert.equal(new KeymapHandler().handle(reading, "gx"), "FollowLink");
    assert.equal(new KeymapHandler().handle(welcome, "gx"), "FollowLink");
    assert.equal(new KeymapHandler().handle(closed, "gx"), "Ignored");
  });

  test("handle gx on welcome follows link", () => {
    const state = new NavigationState();
    const handler = new KeymapHandler();

    handler.handle(state, "g");
    const result = handler.handle(state, "x");

    assert.equal(state.isWelcome, true);
    assert.equal(result, "FollowLink");
  });

  test("handle colon enters command mode with colon prefilled", () => {
    const state = new NavigationState();
    const handler = new KeymapHandler();

    const result = handler.handle(state, ":");

    assert.equal(result, "FocusCommand");
    assert.equal(state.isCommandMode, true);
    assert.equal(state.commandText, ":");
  });
});
