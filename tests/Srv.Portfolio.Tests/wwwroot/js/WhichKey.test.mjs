import assert from "node:assert/strict";
import test from "node:test";
import { entries, keyLabel, leaderMaps, show, hide, isOpen } from "../../../../src/Srv.Portfolio/wwwroot/js/which-key.js";
import { createDomFixture } from "../../helpers/dom-fixture.mjs";

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

test("show renders ordered rows and row, panel, and footer events call only their callbacks", () => {
    const fixture = createDomFixture();
    const selected = [];
    let backs = 0;
    let closes = 0;
    try {
        assert.equal(show("g", [
            { key: " ", group: false, desc: "Space action", icon: "space-icon" },
            { key: "f", group: true, desc: "+find", icon: "find-icon" }
        ], {
            onSelect: key => selected.push(key),
            onBack: () => backs++,
            onClose: () => closes++
        }), true);
        assert.equal(isOpen(), true);
        assert.equal(fixture.body.children.length, 1);
        const panel = fixture.body.children[0];
        assert.equal(panel.getAttribute("role"), "dialog");
        assert.equal(panel.getAttribute("aria-label"), "Keys after g");
        assert.equal(panel.children[0].textContent, "g");
        assert.equal(panel.classList.contains("which-key"), true);
        assert.equal(panel.style.properties.get("--which-key-bottom"), "0px");
        const grid = panel.children[1];
        const [spaceRow, groupRow] = grid.children;
        assert.deepEqual(grid.children.map(row => row.children[0].textContent), ["<Space>", "f"]);
        assert.deepEqual(grid.children.map(row => row.children[2].textContent), ["space-icon", "find-icon"]);
        assert.deepEqual(grid.children.map(row => row.children[3].textContent), ["Space action", "+find"]);
        assert.equal(spaceRow.classList.contains("group"), false);
        assert.equal(groupRow.classList.contains("group"), true);

        const rowDown = spaceRow.dispatch("mousedown");
        const rowClick = spaceRow.dispatch("click");
        assert.equal(rowDown.defaultPrevented, true);
        assert.equal(rowClick.propagationStopped, true);
        assert.deepEqual(selected, [" "]);
        const panelClick = panel.dispatch("click");
        assert.equal(panelClick.propagationStopped, true);

        const [closeButton, backButton] = panel.children[2].children;
        for (const [button, callback] of [[closeButton, "close"], [backButton, "back"]]) {
            assert.equal(button.dispatch("mousedown").defaultPrevented, true);
            assert.equal(button.dispatch("click").propagationStopped, true);
            assert.equal(isOpen(), true, `${callback} callback does not hide automatically`);
        }
        assert.deepEqual([selected, closes, backs], [[" "], 1, 1]);
        assert.equal(fixture.body.children[0], panel);
    } finally {
        hide();
        fixture.restore();
    }
});

test("show replaces the old panel, hide is idempotent, and default callbacks are safe", () => {
    const fixture = createDomFixture();
    try {
        show("f", [{ key: "x", group: false, desc: "first", icon: "" }]);
        const previous = fixture.body.children[0];
        show("s", [{ key: "h", group: false, desc: "second", icon: "" }]);
        assert.equal(previous.isConnected, false);
        assert.equal(fixture.body.children.length, 1);
        const current = fixture.body.children[0];
        assert.equal(current.getAttribute("aria-label"), "Keys after s");
        current.children[2].children[0].dispatch("click");
        current.children[2].children[1].dispatch("click");
        assert.equal(isOpen(), true);
        hide();
        assert.equal(current.isConnected, false);
        assert.equal(isOpen(), false);
        hide();
        assert.equal(fixture.body.children.length, 0);
    } finally {
        hide();
        fixture.restore();
    }
});
