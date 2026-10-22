import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { CommandHistory } from "../../src/nvim/command-history.ts";

describe("CommandHistory", () => {
  test("previous when history exists returns commands from newest to oldest", () => {
    const history = new CommandHistory();
    history.add(":help");
    history.add(":Ex");

    assert.equal(history.previous(":"), ":Ex");
    assert.equal(history.previous(":Ex"), ":help");
    assert.equal(history.previous(":help"), ":help");
  });

  test("next after previous restores draft after newest command", () => {
    const history = new CommandHistory();
    history.add(":help");
    history.add(":Ex");
    history.previous(":draft");

    assert.equal(history.next(":Ex"), ":draft");
    assert.equal(history.next(":draft"), ":draft");
  });

  test("previous without history preserves current input", () => {
    const history = new CommandHistory();

    assert.equal(history.previous(":unfinished"), ":unfinished");
  });

  test("next without history preserves current input", () => {
    const history = new CommandHistory();

    assert.equal(history.next(":unfinished"), ":unfinished");
  });

  describe("add empty command does not add to history", () => {
    for (const command of ["  ", ":", ":  "]) {
      test(JSON.stringify(command), () => {
        const history = new CommandHistory();
        history.add(command);

        assert.equal(history.previous(":draft"), ":draft");
      });
    }
  });
});
