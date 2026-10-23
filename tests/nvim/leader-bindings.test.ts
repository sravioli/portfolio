import assert from "node:assert/strict";
import test from "node:test";
import { loadHelp } from "../../src/build/help.ts";
import { NavigationState } from "../../src/lib/navigation-state.ts";
import { KeymapHandler } from "../../src/nvim/keymap.ts";
import { LEADER_TREE, leaderAction } from "../../src/nvim/leader-bindings.ts";
import { LEADER_TREE as popupTree, entries, leaderMaps } from "../../src/nvim/which-key.js";

test("leader sequences resolve to stable actions and share the popup catalog", () => {
  assert.equal(popupTree, LEADER_TREE);
  assert.deepEqual(
    leaderMaps().map((sequence) => [sequence, leaderAction(sequence)]),
    [
      ["e", "ToggleExplorer"],
      [";", "PickBreadcrumb"],
      ["bx", "CloseDocument"],
      ["ff", "OpenFileFinder"],
    ],
  );
  assert.deepEqual(entries("b"), [
    { key: "x", group: false, desc: "Close the tab", icon: "\u{f0156}" },
  ]);
  assert.deepEqual(entries("f"), [
    { key: "f", group: false, desc: "Find READMEs", icon: "\u{f0349}" },
  ]);
});

test("incomplete, unknown, and overlong suffixes have no action", () => {
  for (const sequence of ["", "b", "f", "x", "sk", "sh", "ex", "bxx", "fff", "<leader>ff"]) {
    assert.equal(leaderAction(sequence), undefined, sequence);
  }
});

test("every leader binding has a help definition, and no removed binding remains documented", async () => {
  const bundle = await loadHelp();
  const bindings = leaderMaps().map((sequence) => `<leader>${sequence}`).sort();
  const tags = Object.keys(bundle.tags).filter((tag) => tag.startsWith("<leader>") && tag !== "<leader>");
  assert.deepEqual(tags.sort(), bindings);
  const rows = bundle.documents.flatMap((document) =>
    document.blocks.flatMap((block) => block.kind === "keys" ? block.rows : []),
  );
  for (const binding of bindings) {
    assert.equal(rows.some((row) => row.key === binding && row.tags.includes(binding)), true, binding);
  }
});

test("leader dispatch preserves focus, help, reading, and disabled-keyboard rules", () => {
  for (const reading of [false, true]) {
    for (const helpOpen of [false, true]) {
      for (const explorerOpen of [false, true]) {
        for (const explorerFocused of [false, true]) {
          for (const enabled of [false, true]) {
            for (const sequence of leaderMaps()) {
              const state = new NavigationState();
              if (reading) state.openSelected();
              state.isHelpOpen = helpOpen;
              state.isExplorerOpen = explorerOpen;
              state.keyboardEnabled = enabled;
              const action = leaderAction(sequence);
              const closesExplorer = enabled && action === "ToggleExplorer" && explorerOpen && explorerFocused;
              const expected = !enabled ? "Ignored"
                : action === "ToggleExplorer" ? closesExplorer ? "CloseExplorer" : "FocusExplorer"
                : action === "OpenFileFinder" ? "OpenFileFinder"
                : action === "CloseDocument" && reading ? "CloseDocument"
                : "Ignored";
              const context = JSON.stringify({ sequence, reading, helpOpen, explorerOpen, explorerFocused, enabled });

              assert.equal(new KeymapHandler().handle(state, `<leader>${sequence}`, explorerFocused), expected, context);
              assert.equal(state.isExplorerOpen,
                enabled && action === "ToggleExplorer" ? !closesExplorer : explorerOpen, context);
              assert.equal(state.isHelpOpen, helpOpen, context);
              assert.equal(state.isReading, reading, context);
            }
          }
        }
      }
    }
  }
});
