import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { controlNotation, leaderNotation } from "../../src/nvim/key-notation.ts";

describe("KeyNotation", () => {
  describe("leader formats keys for development and user notation", () => {
    const cases: [
      keys: string,
      leaderLabel: string,
      expectedUser: string,
      expectedDevelopment: string,
    ][] = [
      ["x", "Space", "Space then x", "<leader>x"],
      ["ff", ",", ", then f f", "<leader>ff"],
      ["aBz", "Leader", "Leader then a B z", "<leader>aBz"],
      ["", "Custom", "Custom then ", "<leader>"],
    ];
    for (const [keys, leaderLabel, expectedUser, expectedDevelopment] of cases) {
      test(`${JSON.stringify(keys)} with leader ${JSON.stringify(leaderLabel)}`, () => {
        assert.equal(leaderNotation(keys, false, leaderLabel), expectedUser);
        assert.equal(leaderNotation(keys, true, "ignored label"), expectedDevelopment);
      });
    }
  });

  describe("control preserves input case and character", () => {
    const cases: [key: string, expectedUser: string, expectedDevelopment: string][] = [
      ["x", "Ctrl+x", "<C-x>"],
      ["A", "Ctrl+A", "<C-A>"],
      [",", "Ctrl+,", "<C-,>"],
    ];
    for (const [key, expectedUser, expectedDevelopment] of cases) {
      test(JSON.stringify(key), () => {
        assert.equal(controlNotation(key, false), expectedUser);
        assert.equal(controlNotation(key, true), expectedDevelopment);
      });
    }
  });
});
