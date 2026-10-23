import { controlNotation, leaderNotation } from "./key-notation.ts";
import { resolveHelpTag } from "../lib/help.ts";
import type { NavigationState } from "../lib/navigation-state.ts";

export type CommandAction =
  | "None"
  | "ReturnToListing"
  | "OpenHelp"
  | "CloseHelp"
  | "SearchHelp"
  | "SetLeader"
  | "SetKeyboard"
  | "SetDevNotation"
  | "SetExplorer"
  | "SearchReadme"
  | "ClearSearchHighlight"
  | "OpenReadme"
  | "Reload"
  | "Invalid";

const leaderAssignment =
  /^(?:let\s+(?:g:)?mapleader|lua\s+vim\.g\.mapleader)\s*=\s*(["'])(.*?)\1$/;
const booleanOption = /^set?\s+(no|inv)?(keys|dev)(!)?$/;
const help = /^h(?:e(?:lp?)?)?(?:\s+(.*))?$/i;
const helpClose = /^helpc(?:l(?:o(?:se?)?)?)?$/i;

const equalsIgnoreCase = (left: string, ...candidates: string[]): boolean =>
  candidates.some((candidate) => left.toUpperCase() === candidate.toUpperCase());

// Mirrors .NET char.IsControl and char.IsSurrogate for a single UTF-16 unit.
const isControlOrSurrogate = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return code < 0x20 || (code >= 0x7f && code <= 0x9f) || (code >= 0xd800 && code <= 0xdfff);
};

export function handleCommand(state: NavigationState, commandText: string): CommandAction {
  const isSearch = commandText.startsWith("/");
  let command = isSearch ? commandText.slice(1).trim() : commandText.replace(/^:+/, "").trim();
  const searchHelp = state.searchTarget === "help" && state.isHelpOpen;
  state.endCommand();
  state.searchTarget = "readme";
  if (isSearch && searchHelp) {
    if (command.length === 0) command = state.helpSearchQuery;
    if (command.length === 0) {
      state.showError("E35: No previous regular expression");
      return "Invalid";
    }
    state.helpSearchQuery = command;
    return "SearchHelp";
  }
  if (isSearch) {
    if (command.length === 0) command = state.searchQuery;
    if (command.length === 0) {
      state.showError("E35: No previous regular expression");
      return "Invalid";
    }
    if (!state.currentDocument) {
      state.showError(`E486: Pattern not found: ${command}`);
      return "Invalid";
    }
    state.searchQuery = command;
    return "SearchReadme";
  }

  const leaderMatch = leaderAssignment.exec(command);
  if (leaderMatch) {
    let leader = leaderMatch[2];
    if (leader === "<Space>") leader = " ";
    else if (leader === "<Bslash>" || leader === "\\\\") leader = "\\";
    if (leader.length === 1 && !isControlOrSurrogate(leader)) {
      state.leader = leader;
      state.message = `Leader set to ${state.leaderLabel}. Press ${state.leaderLabel} then e to focus the explorer.`;
      return "SetLeader";
    }
    state.showError("E474: Invalid argument: mapleader must be a single key");
    return "Invalid";
  }

  // Like Vim, :q in the help window closes the help window.
  if (helpClose.test(command) || (state.isHelpOpen && equalsIgnoreCase(command, "q", "quit", "clo", "close"))) {
    if (!state.isHelpOpen) return "None";
    state.closeHelp();
    return "CloseHelp";
  }

  if (equalsIgnoreCase(command, "Ex", "Explore", "q")) {
    state.goToParent();
    return "ReturnToListing";
  }

  const helpMatch = help.exec(command);
  if (helpMatch) {
    const topic = (helpMatch[1] ?? "").trim();
    const tag = resolveHelpTag(state.helpTags, topic);
    if (tag === null) {
      state.showError(`E149: Sorry, no help for ${topic}`);
      return "Invalid";
    }
    state.openHelp(tag);
    return "OpenHelp";
  }

  if (equalsIgnoreCase(command, "nohl", "nohlsearch", "nohls")) return "ClearSearchHighlight";

  const option = booleanOption.exec(command);
  if (option) {
    const isKeys = option[2] === "keys";
    const current = isKeys ? state.keyboardEnabled : state.devNotation;
    const value =
      option[1] === "no" ? false : option[1] === "inv" ? !current : !option[3] || !current;
    if (!isKeys) {
      state.devNotation = value;
      state.message =
        `${value ? "Vim" : "Plain"} notation: ` +
        `${leaderNotation("ff", value, state.leaderLabel)}, ${controlNotation("d", value)}.`;
      return "SetDevNotation";
    }
    state.setKeyboardEnabled(value);
    return "SetKeyboard";
  }

  const explorerOpen = equalsIgnoreCase(command, "NvimTreeToggle")
    ? !state.isExplorerOpen
    : equalsIgnoreCase(command, "NvimTreeOpen")
      ? true
      : equalsIgnoreCase(command, "NvimTreeClose")
        ? false
        : null;
  if (explorerOpen !== null) {
    state.isExplorerOpen = explorerOpen;
    return "SetExplorer";
  }

  const separator = command.search(/[ \t]/);
  const editCommand = separator < 0 ? command : command.slice(0, separator);
  if (equalsIgnoreCase(editCommand, "e", "edit")) {
    const path = separator < 0 ? "" : command.slice(separator + 1).trim();
    if (path.length > 0) {
      if (!state.navigateToReadme(path)) {
        state.showError(`E484: Can't open file ${path}`);
        return "Invalid";
      }
      state.isExplorerOpen = true;
      return "OpenReadme";
    }
    if (!state.currentDocument) {
      state.showError("E32: No file name");
      return "Invalid";
    }
    return "Reload";
  }

  if (command.length > 0) {
    state.showError(`E492: Not an editor command: ${command}`);
    return "Invalid";
  }
  return "None";
}
