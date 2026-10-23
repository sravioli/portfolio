import type { NavigationState } from "../lib/navigation-state.ts";
import { resolveHelpTag } from "../lib/help.ts";

export type KeyAction =
  | "Ignored"
  | "Changed"
  | "OpenHelp"
  | "OpenSelected"
  | "ScrollUp"
  | "ScrollDown"
  | "ScrollTop"
  | "ScrollBottom"
  | "FocusCommand"
  | "FocusExplorer"
  | "CloseExplorer"
  | "OpenFileFinder"
  | "CloseCommand"
  | "NextSearchMatch"
  | "PreviousSearchMatch"
  | "HalfPageUp"
  | "HalfPageDown"
  | "NextHeading"
  | "PreviousHeading"
  | "FocusPreview"
  | "CloseDocument"
  | "CopyDocument"
  | "CursorLeft"
  | "CursorRight"
  | "WordForward"
  | "WordBackward"
  | "WordEnd"
  | "LineStart"
  | "LineEnd"
  | "FollowLink"
  | "OpenLink"
  | "JumpBack"
  | "JumpForward";

const readingOnly: Readonly<Record<string, KeyAction>> = {
  "<C-d>": "HalfPageDown",
  "<C-u>": "HalfPageUp",
  "]]": "NextHeading",
  "[[": "PreviousHeading",
  "<C-l>": "FocusPreview",
  "<leader>bx": "CloseDocument",
  "<C-c>": "CopyDocument",
  "<C-o>": "JumpBack",
  "<C-i>": "JumpForward",
};

const cursorKeys: Readonly<Record<string, KeyAction>> = {
  h: "CursorLeft",
  ArrowLeft: "CursorLeft",
  l: "CursorRight",
  ArrowRight: "CursorRight",
  w: "WordForward",
  b: "WordBackward",
  e: "WordEnd",
  "0": "LineStart",
  $: "LineEnd",
  Enter: "OpenLink",
};

export class KeymapHandler {
  #waitingForSecondG = false;

  handle(state: NavigationState, key: string, explorerFocused = false): KeyAction {
    if (!state.keyboardEnabled) {
      this.#waitingForSecondG = false;
      if (key === ":") {
        state.beginCommand();
        return "FocusCommand";
      }
      if (key === "/") {
        state.beginSearch();
        return "FocusCommand";
      }
      return "Ignored";
    }

    // Keys reach here from the README or explorer beside the help window; the help window handles its own.
    if (state.isHelpOpen && key === "Escape") {
      state.closeHelp();
      return "Changed";
    }

    const waitingForSecondG = this.#waitingForSecondG;
    if (key !== "g") this.#waitingForSecondG = false;

    if (key === "<leader>e" && state.isExplorerOpen && explorerFocused) {
      state.isExplorerOpen = false;
      return "CloseExplorer";
    }
    if (key === "<leader>e" || key === "<C-h>") {
      state.isExplorerOpen = true;
      return "FocusExplorer";
    }
    if (key === "<leader>ff" || key === "<C-p>") return "OpenFileFinder";
    if (Object.hasOwn(readingOnly, key)) return state.isReading ? readingOnly[key] : "Ignored";
    if (key === "gx") return state.isReading || state.isWelcome ? "FollowLink" : "Ignored";
    if (key === "n" && state.isReading && !explorerFocused && state.searchQuery.length > 0)
      return "NextSearchMatch";
    if (key === "N" && state.isReading && !explorerFocused && state.searchQuery.length > 0)
      return "PreviousSearchMatch";

    if (key === "x" && waitingForSecondG && state.isWelcome) return "FollowLink";

    if (state.isReading && !explorerFocused && !state.isCommandMode) {
      if (key === "x" && waitingForSecondG) return "FollowLink";
      if (Object.hasOwn(cursorKeys, key)) return cursorKeys[key];
    }

    if (key === "Escape" && state.isCommandMode) {
      state.endCommand();
      return "CloseCommand";
    }

    if (key === "g") {
      if (!this.#waitingForSecondG) {
        this.#waitingForSecondG = true;
        return "Changed";
      }
      this.#waitingForSecondG = false;
      if (state.isReading && !explorerFocused) return "ScrollTop";
      state.isExplorerOpen = true;
      state.selectEdge(false);
      return "Changed";
    }

    if (key === "G") {
      if (state.isReading && !explorerFocused) return "ScrollBottom";
      state.isExplorerOpen = true;
      state.selectEdge(true);
      return "Changed";
    }

    if (key === "j" || key === "ArrowDown") {
      if (state.isReading && !explorerFocused) return "ScrollDown";
      state.isExplorerOpen = true;
      state.moveSelection(1);
      return "Changed";
    }

    if (key === "k" || key === "ArrowUp") {
      if (state.isReading && !explorerFocused) return "ScrollUp";
      state.isExplorerOpen = true;
      state.moveSelection(-1);
      return "Changed";
    }

    if (key === "Enter" || key === "l") {
      const folder = state.selectedEntry.kind === "folder";
      state.openSelected();
      return folder ? "FocusExplorer" : "OpenSelected";
    }

    if (key === "h" || key === "-") {
      if (explorerFocused) {
        state.collapseSelected();
        return "FocusExplorer";
      }
      state.goToParent();
      return "Changed";
    }

    if (key === "p" && state.isReading) {
      state.isRawView = !state.isRawView;
      return "Changed";
    }

    if (key === ":") {
      state.beginCommand();
      return "FocusCommand";
    }

    if (key === "/") {
      state.beginSearch();
      return "FocusCommand";
    }

    if (key === "?") {
      state.openHelp(resolveHelpTag(state.helpTags, ""));
      return "OpenHelp";
    }

    return "Ignored";
  }
}
