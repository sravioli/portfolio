import assert from "node:assert/strict";
import test from "node:test";
import { entries, keyLabel, leaderMaps } from "../../src/Srv.Portfolio/wwwroot/js/which-key.js";

test("leader maps are flattened from the which-key tree", () => {
    assert.deepEqual([...leaderMaps()].sort(), [";", "bx", "e", "ff", "sh", "sk"]);
});

test("entries list leaves before groups and name the groups", () => {
    assert.deepEqual(entries("").map(item => [item.key, item.group, item.desc]), [
        [";", false, "Dropbar pick"],
        ["e", false, "Focus the explorer"],
        ["b", true, "+buffer"],
        ["f", true, "+find"],
        ["s", true, "+search"]]);
    assert.deepEqual(entries("s").map(item => item.key), ["h", "k"]);
    assert.equal(entries("x"), null);
    assert.equal(entries("e"), null);
});

test("unnamed groups count their keymaps and keys sort lowercase first", () => {
    const tree = {
        A: { desc: "upper" },
        a: { desc: "lower" },
        c: { keys: { x: { desc: "one" }, y: { keys: { z: { desc: "two" } } } } }
    };
    assert.deepEqual(entries("", tree).map(item => [item.key, item.desc]), [["a", "lower"], ["A", "upper"], ["c", "+2 keymaps"]]);
});

test("special keys get Vim labels", () => {
    assert.equal(keyLabel(" "), "<Space>");
    assert.equal(keyLabel("f"), "f");
});
