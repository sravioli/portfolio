import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { handleCommand } from "../../src/nvim/commands.ts";
import { NavigationState } from "../../src/lib/navigation-state.ts";

describe("EditPathCommand", () => {
  describe("handle edit command with readme path opens document and expands tree", () => {
    const cases: [command: string, expectedRepository: string, expectedSelection: string][] = [
      [":e chrono/.github/readme.md", "chrono", "README.md"],
      [":edit ./chrono\\.github\\readme.md", "chrono", "README.md"],
      [":e README.md", "", "README.md"],
      [":e wezterm-plugins/memo.wz/.github/readme.md", "memo.wz", "memo.wz"],
    ];
    for (const [command, expectedRepository, expectedSelection] of cases) {
      test(command, () => {
        const state = new NavigationState();
        state.isExplorerOpen = false;

        const result = handleCommand(state, command);

        assert.equal(result, "OpenReadme");
        assert.equal(state.currentDocument?.repository, expectedRepository);
        assert.equal(state.isReading, true);
        assert.equal(state.isExplorerOpen, true);
        assert.equal(state.selectedEntry.name, expectedSelection);

        if (expectedRepository === "chrono") {
          assert.ok(
            state.entries.some(
              (item) => item.entry?.repository === "chrono" && item.isExpanded,
            ),
          );
        } else if (expectedRepository === "memo.wz") {
          assert.ok(
            state.entries.some(
              (item) => item.entry?.repository === "wezterm-plugins" && item.isExpanded,
            ),
          );
        }
      });
    }
  });

  test("handle edit command with unknown readme path preserves current document", () => {
    const state = new NavigationState();
    const original = state.navigateTo("chrono");

    const result = handleCommand(state, ":e chrono/missing.md");

    assert.equal(result, "Invalid");
    assert.equal(state.currentDocument, original);
    assert.equal(state.message, "E484: Can't open file chrono/missing.md");
    assert.equal(state.isErrorMessage, true);
  });
});
