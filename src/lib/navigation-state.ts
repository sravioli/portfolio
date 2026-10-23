import {
  explorerItem,
  find,
  findByReadmePath,
  findParent,
  getContentListing,
  hasReadme,
  isRoot,
  rootEntry,
  type ExplorerItem,
  type ExplorerItemKind,
  type PortfolioEntry,
} from "./catalog.ts";
import { helpPageOf, type HelpTags } from "./help.ts";
import { HELP_INDEX_PAGE } from "./routes.ts";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

export class NavigationState {
  #expandedFolders = new Set<string>();
  #entries: ExplorerItem[] | null = null;
  #message: string | null = null;

  isWelcome = true;
  currentFolder: PortfolioEntry = rootEntry;
  selectedIndex = 0;
  isReading = false;
  isRawView = false;
  isExplorerOpen = true;
  keyboardEnabled = true;
  devNotation = true;
  leader = " ";
  isHelpOpen = false;
  /** Every help tag and the help file defining it; filled from the page data. */
  helpTags: HelpTags = {};
  helpPage = HELP_INDEX_PAGE;
  /** Tag the help window jumped to; `null` is the top of the file. */
  helpTag: string | null = null;
  helpSearchQuery = "";
  /** What a `/` search typed now looks through. */
  searchTarget: "readme" | "help" = "readme";
  isCommandMode = false;
  commandText = "";
  searchQuery = "";
  isErrorMessage = false;
  currentDocument: PortfolioEntry | null = null;

  get entries(): readonly ExplorerItem[] {
    if (this.#entries) return this.#entries;
    const items: ExplorerItem[] = [];
    this.#addVisibleEntries(rootEntry, 0, items);
    return (this.#entries = items);
  }

  get leaderLabel(): string {
    return this.leader === " " ? "Space" : this.leader;
  }

  get message(): string | null {
    return this.#message;
  }

  set message(value: string | null) {
    this.#message = value;
    this.isErrorMessage = false;
  }

  get selectedEntry(): ExplorerItem {
    return this.entries[clamp(this.selectedIndex, 0, this.entries.length - 1)];
  }

  showError(message: string): void {
    this.message = message;
    this.isErrorMessage = true;
  }

  beginCommand(): void {
    this.isCommandMode = true;
    this.commandText = ":";
    this.message = null;
  }

  beginSearch(target: "readme" | "help" = "readme"): void {
    this.isCommandMode = true;
    this.commandText = "/";
    this.searchTarget = target;
    this.message = null;
  }

  /** Shows the help file defining `tag`, scrolled to it. */
  openHelp(tag: string | null): void {
    this.isHelpOpen = true;
    this.helpPage = helpPageOf(this.helpTags, tag);
    this.helpTag = tag;
  }

  closeHelp(): void {
    this.isHelpOpen = false;
    this.helpSearchQuery = "";
    this.searchTarget = "readme";
  }

  endCommand(): void {
    this.isCommandMode = false;
    this.commandText = "";
  }

  setKeyboardEnabled(enabled: boolean): void {
    this.keyboardEnabled = enabled;
    this.message = enabled
      ? "Keymaps on."
      : "Keymaps off. Type :set keys to turn them back on.";
  }

  selectIndex(index: number): void {
    this.selectedIndex = clamp(index, 0, this.entries.length - 1);
    this.message = null;
  }

  moveSelection(amount: number): void {
    this.selectedIndex = clamp(this.selectedIndex + amount, 0, this.entries.length - 1);
  }

  selectEdge(last: boolean): void {
    this.selectedIndex = last ? this.entries.length - 1 : 0;
  }

  openSelected(): PortfolioEntry | null {
    const item = this.selectedEntry;
    switch (item.kind) {
      case "parent":
        this.goToParent();
        return null;
      case "readme":
      case "projectFile":
        this.currentFolder = item.entry!;
        this.isWelcome = false;
        return this.#openDocument(item.entry!);
      case "folder": {
        const key = item.entry!.repository.toLowerCase();
        if (this.#expandedFolders.has(key)) this.#expandedFolders.delete(key);
        else this.#expandedFolders.add(key);
        this.#entries = null;
        this.message = null;
        return null;
      }
    }
  }

  goToParent(): PortfolioEntry | null {
    if (this.isReading) {
      this.#selectDocument(this.currentDocument!);
      this.isReading = false;
      this.currentDocument = null;
      this.#resetDocumentView();
      return null;
    }
    this.collapseSelected();
    return null;
  }

  closeDocument(): void {
    this.currentDocument = null;
    this.currentFolder = rootEntry;
    this.isReading = false;
    this.isWelcome = true;
    this.isRawView = false;
    this.endCommand();
    this.message = null;
  }

  collapseSelected(): void {
    const item = this.selectedEntry;
    if (item.kind === "folder" && item.isExpanded) {
      this.#expandedFolders.delete(item.entry!.repository.toLowerCase());
      this.#entries = null;
    } else if (item.depth > 0) {
      const parent = item.kind === "readme" ? item.entry : findParent(item.entry!);
      this.selectedIndex = this.entries.findIndex(
        (candidate) => candidate.kind === "folder" && candidate.entry === parent,
      );
    }
    this.message = null;
  }

  navigateTo(repository: string): PortfolioEntry | null {
    const entry = find(repository);
    if (!entry) return null;
    this.currentFolder = entry;
    this.isWelcome = false;
    this.#selectDocument(entry);
    return this.#openDocument(entry);
  }

  navigateToReadme(path: string): PortfolioEntry | null {
    const entry = findByReadmePath(path);
    return entry ? this.navigateTo(entry.repository) : null;
  }

  #openDocument(entry: PortfolioEntry): PortfolioEntry {
    this.isReading = true;
    this.currentDocument = entry;
    this.#resetDocumentView();
    return entry;
  }

  #resetDocumentView(): void {
    this.isRawView = false;
    this.message = null;
  }

  #selectDocument(entry: PortfolioEntry): void {
    let ancestor: PortfolioEntry | null = entry.isProjectFile ? findParent(entry) : entry;
    while (ancestor && !isRoot(ancestor)) {
      const key = ancestor.repository.toLowerCase();
      if (!this.#expandedFolders.has(key)) {
        this.#expandedFolders.add(key);
        this.#entries = null;
      }
      ancestor = findParent(ancestor);
    }
    const kind: ExplorerItemKind = entry.isProjectFile
      ? "projectFile"
      : hasReadme(entry)
        ? "readme"
        : "folder";
    this.selectedIndex = this.entries.findIndex(
      (item) => item.entry === entry && item.kind === kind,
    );
  }

  #addVisibleEntries(folder: PortfolioEntry, depth: number, items: ExplorerItem[]): void {
    for (const item of getContentListing(folder)) {
      const expanded =
        item.kind === "folder" && this.#expandedFolders.has(item.entry!.repository.toLowerCase());
      items.push(explorerItem(item.name, item.kind, item.entry, depth, expanded));
      if (expanded) this.#addVisibleEntries(item.entry!, depth + 1, items);
    }
  }
}
