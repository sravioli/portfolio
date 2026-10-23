import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { rootEntry, type PortfolioEntry } from "../../src/lib/catalog.ts";
import { NavigationState } from "../../src/lib/navigation-state.ts";

const createState = (init: Partial<NavigationState> = {}): NavigationState =>
  Object.assign(new NavigationState(), init);

describe("NavigationState", () => {
  test("openHelp shows the page defining the tag and closeHelp resets help search", () => {
    const state = createState({ helpTags: { "help.txt": "help", "clipboard-errors": "clipboard" } });

    state.openHelp("clipboard-errors");
    assert.equal(state.isHelpOpen, true);
    assert.equal(state.helpPage, "clipboard");
    assert.equal(state.helpTag, "clipboard-errors");

    state.openHelp(null);
    assert.equal(state.helpPage, "help");
    assert.equal(state.helpTag, null);

    state.helpSearchQuery = "yank";
    state.beginSearch("help");
    assert.equal(state.searchTarget, "help");
    state.closeHelp();
    assert.equal(state.isHelpOpen, false);
    assert.equal(state.helpSearchQuery, "");
    assert.equal(state.searchTarget, "readme");
  });

  test("entries unchanged expansion reuses snapshot", () => {
    const state = new NavigationState();
    const entries = state.entries;

    state.selectIndex(1);
    state.moveSelection(1);
    state.selectEdge(true);
    state.beginCommand();
    state.setKeyboardEnabled(false);
    state.closeDocument();

    assert.equal(state.entries, entries);
    assert.equal(entries.length, 6);
    assert.deepEqual(
      entries.map((item) => item.name),
      ["README.md", "featured.md", "chrono/", "nvim/", "wezterm/", "wezterm-plugins/"],
    );
    // The C# runtime read-only check (IList.Clear throwing NotSupportedException) has no
    // TS equivalent; read-only-ness is enforced by the `readonly ExplorerItem[]` type.
  });

  test("open selected folder toggle replaces snapshot without mutating previous listing", () => {
    const state = new NavigationState();
    const collapsed = state.entries;
    state.selectIndex(5);

    state.openSelected();
    const expanded = state.entries;
    state.openSelected();

    assert.notEqual(expanded, collapsed);
    assert.equal(expanded.length, 18);
    assert.equal(expanded[5].isExpanded, true);
    assert.notEqual(state.entries, expanded);
    assert.deepEqual(state.entries, collapsed);
    assert.equal(collapsed.length, 6);
    assert.equal(collapsed[5].isExpanded, false);
  });

  test("collapse selected expanded parent invalidates only when tree changes", () => {
    const state = new NavigationState();
    state.navigateTo("memo.wz");
    const expanded = state.entries;

    state.collapseSelected();
    assert.equal(state.entries, expanded);
    state.collapseSelected();

    assert.notEqual(state.entries, expanded);
    assert.equal(state.entries.length, 6);
    assert.equal(state.selectedEntry.isExpanded, false);
    assert.ok(expanded.some((item) => item.name === "memo.wz"));
  });

  test("navigate to hidden document invalidates snapshot when ancestors expand", () => {
    const state = new NavigationState();
    const collapsed = state.entries;

    state.navigateTo("memo.wz");
    const expanded = state.entries;
    state.navigateTo("beacon.wz");
    state.goToParent();

    assert.notEqual(expanded, collapsed);
    assert.equal(expanded.length, 18);
    assert.equal(state.entries, expanded);
    assert.equal(state.selectedEntry.name, "beacon.wz");
    assert.equal(state.isReading, false);
  });

  describe("open selected document resets view and preserves explorer state", () => {
    for (const repository of ["", "chrono", "memo.wz"]) {
      test(JSON.stringify(repository), () => {
        const state = new NavigationState();
        const entry = state.navigateTo(repository);
        const entries = [...state.entries];
        const selection = state.selectedIndex;
        state.isRawView = true;
        state.message = "Old message";
        state.isCommandMode = true;
        state.commandText = ":help";

        const document = state.openSelected();

        assert.equal(document, entry);
        assert.equal(state.currentDocument, entry);
        assert.equal(state.currentFolder, entry);
        assert.equal(state.isReading, true);
        assert.equal(state.isWelcome, false);
        assert.equal(state.isRawView, false);
        assert.equal(state.message, null);
        assert.deepEqual(state.entries, entries);
        assert.equal(state.selectedIndex, selection);
        assert.equal(state.isCommandMode, true);
        assert.equal(state.commandText, ":help");
      });
    }
  });

  test("navigate to unknown repository preserves existing state", () => {
    const state = new NavigationState();
    const document = state.navigateTo("memo.wz");
    const selection = state.selectedIndex;
    const entries = [...state.entries];
    state.isRawView = true;
    state.message = "Old message";

    const result = state.navigateTo("missing");

    assert.equal(result, null);
    assert.equal(state.currentDocument, document);
    assert.equal(state.currentFolder, document);
    assert.equal(state.isReading, true);
    assert.equal(state.isWelcome, false);
    assert.equal(state.isRawView, true);
    assert.equal(state.message, "Old message");
    assert.equal(state.selectedIndex, selection);
    assert.deepEqual(state.entries, entries);
  });

  test("navigate to another document resets view and preserves command", () => {
    const state = new NavigationState();
    state.navigateTo("memo.wz");
    state.isRawView = true;
    state.message = "Old message";
    state.isCommandMode = true;
    state.commandText = ":help";

    const document = state.navigateTo("chrono");

    assert.equal(state.currentDocument, document);
    assert.equal(state.currentFolder.repository, "chrono");
    assert.equal(state.selectedEntry.name, "README.md");
    assert.equal(state.isReading, true);
    assert.equal(state.isWelcome, false);
    assert.equal(state.isRawView, false);
    assert.equal(state.message, null);
    assert.equal(state.isCommandMode, true);
    assert.equal(state.commandText, ":help");
    assert.ok(state.entries.some((item) => item.name === "wezterm-plugins/" && item.isExpanded));
  });

  test("begin command existing input replaces input and message without changing document", () => {
    const state = new NavigationState();
    const document = state.navigateTo("memo.wz");
    state.commandText = "old input";
    state.showError("Old message");

    state.beginCommand();

    assert.equal(state.isCommandMode, true);
    assert.equal(state.commandText, ":");
    assert.equal(state.currentDocument, document);
    assert.equal(state.message, null);
    assert.equal(state.isErrorMessage, false);
  });

  test("show error marks message as error until an informational message replaces it", () => {
    const state = new NavigationState();

    state.showError("E492: Not an editor command: foo");
    const errorShown = state.isErrorMessage;
    state.message = "Keymaps on.";

    assert.equal(errorShown, true);
    assert.equal(state.message, "Keymaps on.");
    assert.equal(state.isErrorMessage, false);
  });

  test("end command active command clears input without changing document or message", () => {
    const state = new NavigationState();
    const document = state.navigateTo("memo.wz");
    state.beginCommand();
    state.commandText = ":help";
    state.message = "Old message";

    state.endCommand();

    assert.equal(state.isCommandMode, false);
    assert.equal(state.commandText, "");
    assert.equal(state.currentDocument, document);
    assert.equal(state.message, "Old message");
  });

  describe("set keyboard enabled requested value updates feedback without clearing command", () => {
    const cases: [enabled: boolean, message: string][] = [
      [true, "Keymaps on."],
      [false, "Keymaps off. Type :set keys to turn them back on."],
    ];
    for (const [enabled, message] of cases) {
      test(`enabled: ${enabled}`, () => {
        const state = createState({ keyboardEnabled: !enabled });
        state.beginCommand();
        state.commandText = ":help";

        state.setKeyboardEnabled(enabled);

        assert.equal(state.keyboardEnabled, enabled);
        assert.equal(state.message, message);
        assert.equal(state.isCommandMode, true);
        assert.equal(state.commandText, ":help");
      });
    }
  });

  test("close document from readme restores welcome and preserves explorer", () => {
    const state = new NavigationState();
    state.navigateTo("memo.wz");
    const entries = [...state.entries];
    const selection = state.selectedIndex;
    state.isRawView = true;
    state.isCommandMode = true;
    state.commandText = ":help";
    state.message = "Old message";

    state.closeDocument();

    assert.equal(state.isWelcome, true);
    assert.equal(state.isReading, false);
    assert.equal(state.currentDocument, null);
    assert.equal(state.currentFolder, rootEntry);
    assert.deepEqual(state.entries, entries);
    assert.equal(state.selectedIndex, selection);
    assert.equal(state.isRawView, false);
    assert.equal(state.isCommandMode, false);
    assert.equal(state.commandText, "");
    assert.equal(state.message, null);

    state.openSelected();
    assert.equal(state.isReading, true);
    assert.equal(state.isWelcome, false);
    assert.equal((state.currentDocument as PortfolioEntry | null)?.repository, "memo.wz");
  });

  test("constructor initial state shows welcome without opening document", () => {
    const state = new NavigationState();

    assert.equal(state.isWelcome, true);
    assert.equal(state.isReading, false);
    assert.equal(state.currentDocument, null);
    assert.equal(state.currentFolder, rootEntry);
  });

  test("open selected from welcome opens readme and dismisses welcome", () => {
    const state = new NavigationState();

    state.openSelected();

    assert.equal(state.isWelcome, false);
    assert.equal(state.isReading, true);
    assert.equal(state.currentDocument, rootEntry);
    state.goToParent();
    assert.equal(state.isWelcome, false);
  });

  test("open selected folder while welcoming preserves welcome until file opens", () => {
    const state = new NavigationState();
    state.selectIndex(2);

    state.openSelected();

    assert.equal(state.isWelcome, true);
    assert.equal(state.isReading, false);
    assert.equal(state.currentFolder, rootEntry);
    assert.equal(state.selectedEntry.name, "chrono/");
    assert.equal(state.selectedEntry.isExpanded, true);

    state.selectIndex(3);
    state.openSelected();
    assert.equal(state.isWelcome, false);
    assert.equal(state.isReading, true);
  });

  test("go to parent from readme returns to folder with readme selected", () => {
    const state = new NavigationState();
    state.openSelected();

    state.goToParent();

    assert.equal(state.isReading, false);
    assert.equal(state.selectedIndex, 0);
    assert.equal(state.selectedEntry.name, "README.md");
  });

  test("go to parent from expanded folder collapses it without replacing tree", () => {
    const state = new NavigationState();
    state.goToParent();
    state.selectIndex(5);
    state.openSelected();
    state.goToParent();

    assert.equal(state.selectedIndex, 5);
    assert.equal(state.selectedEntry.name, "wezterm-plugins/");
    assert.equal(state.selectedEntry.isExpanded, false);
    assert.equal(state.entries.length, 6);
  });

  test("navigate to nvim opens its local readme", () => {
    const state = new NavigationState();

    const entry = state.navigateTo("nvim");

    assert.equal(entry?.repository, "nvim");
    assert.equal(state.isReading, true);
    assert.equal(state.currentDocument, entry);
    assert.equal(state.isWelcome, false);
  });

  test("move selection clamps at listing edges", () => {
    const state = new NavigationState();
    state.goToParent();

    state.moveSelection(-1);
    assert.equal(state.selectedIndex, 0);

    state.moveSelection(100);
    assert.equal(state.selectedIndex, state.entries.length - 1);
  });

  test("open selected plugin file opens its readme and preserves parent selection", () => {
    const state = new NavigationState();
    state.goToParent();
    state.selectIndex(5);
    state.openSelected();
    state.selectIndex(state.entries.findIndex((item) => item.name === "memo.wz"));

    state.openSelected();

    assert.equal(state.currentFolder.name, "memo.wz");
    assert.equal(state.currentDocument?.repository, "memo.wz");
    assert.equal(state.isReading, true);
    assert.ok(state.entries.some((item) => item.name === "chrono/"));
    assert.ok(state.entries.some((item) => item.name === "wezterm-plugins/" && item.isExpanded));

    state.goToParent();
    assert.equal(state.selectedEntry.name, "memo.wz");
    state.collapseSelected();
    assert.equal(state.selectedEntry.name, "wezterm-plugins/");
  });

  test("open selected folder while reading expands inline and preserves document", () => {
    const state = new NavigationState();
    state.openSelected();
    state.selectIndex(5);

    const document = state.openSelected();

    assert.equal(document, null);
    assert.equal(state.isReading, true);
    assert.equal(state.currentDocument, rootEntry);
    assert.equal(state.currentFolder, rootEntry);
    assert.equal(state.selectedEntry.name, "wezterm-plugins/");
    assert.equal(state.selectedEntry.isExpanded, true);
    assert.equal(state.entries.length, 18);

    assert.equal(state.entries[6].depth, 1);
    assert.equal(state.entries[6].name, "README.md");
    assert.equal(state.entries[7].name, "beacon.wz");
    assert.equal(
      state.entries.some((item) => item.name === "../"),
      false,
    );
  });

  test("open selected expanded folder hides children and keeps other folders expanded", () => {
    const state = new NavigationState();
    state.selectIndex(2);
    state.openSelected();
    state.selectIndex(state.entries.findIndex((item) => item.name === "wezterm-plugins/"));
    state.openSelected();
    state.openSelected();

    assert.equal(state.selectedEntry.isExpanded, false);
    assert.equal(
      state.entries.some((item) => item.name === "beacon.wz"),
      false,
    );
    assert.ok(state.entries.some((item) => item.name === "chrono/" && item.isExpanded));
    assert.equal(state.entries[3].name, "README.md");
  });

  test("navigate to hidden plugin expands ancestors and selects file", () => {
    const state = new NavigationState();

    state.navigateTo("memo.wz");

    assert.equal(state.isReading, true);
    assert.equal(state.selectedEntry.name, "memo.wz");
    assert.equal(state.currentDocument?.repository, "memo.wz");
    assert.ok(state.entries.some((item) => item.name === "wezterm-plugins/" && item.isExpanded));
    assert.ok(state.entries.some((item) => item.name === "chrono/"));
  });

  test("collapse selected child of folder selects then collapses parent without closing document", () => {
    const state = new NavigationState();
    state.navigateTo("memo.wz");

    state.collapseSelected();
    assert.equal(state.selectedEntry.name, "wezterm-plugins/");
    assert.equal(state.selectedEntry.isExpanded, true);

    state.collapseSelected();

    assert.equal(state.selectedEntry.isExpanded, false);
    assert.equal(state.isReading, true);
    assert.equal(state.currentDocument?.repository, "memo.wz");
    assert.equal(
      state.entries.some((item) => item.name === "memo.wz"),
      false,
    );
    assert.ok(state.selectedIndex >= 0 && state.selectedIndex <= state.entries.length - 1);
  });
});
