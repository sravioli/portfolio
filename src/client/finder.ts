import type { PortfolioEntry } from "../lib/catalog.ts";
import { search, totalCount, type FileSearchResult } from "../lib/file-search.ts";
import { NARROW_QUERY, renderFinder, type FinderModel } from "../lib/view.ts";
import { Region } from "./dom.ts";

const PREVIEW_DEBOUNCE_MS = 150;
const HANDLED_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", "Escape"]);
const CTRL_KEYS = new Set(["j", "k", "n", "p"]);

export interface FinderOptions {
  loadSource(entry: PortfolioEntry): Promise<string>;
  /** Called after the finder closed itself to open `entry`. */
  onOpen(entry: PortfolioEntry): void;
  /** Called after the finder was dismissed. */
  onClose(): void;
}

export interface Finder {
  close(): void;
}

/** Telescope-style file finder: a modal dialog that exists only while it is open. */
export function openFinder(options: FinderOptions): Finder {
  let query = "";
  let results: readonly FileSearchResult[] = search("");
  let selectedIndex = 0;
  let loading = false;
  let error: string | null = null;
  let preview: string | null = null;
  let previewToken = 0;
  let closed = false;
  let scrolledSelection = "";

  const previousFocus = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "file-finder";
  dialog.setAttribute("aria-label", "Find files");
  const region = new Region(dialog);
  const narrow = window.matchMedia(NARROW_QUERY);
  const viewport = window.visualViewport;

  function syncViewport(): void {
    if (viewport === null) return;
    dialog.style.setProperty("--finder-viewport-height", `${viewport.height}px`);
    dialog.style.setProperty("--finder-viewport-top", `${viewport.offsetTop}px`);
  }

  function onLayoutChange(): void {
    syncViewport();
    void loadPreview();
  }

  const model = (): FinderModel => ({ query, results, totalCount, selectedIndex, loading, error, preview });

  function render(): void {
    if (closed) return;
    region.update(renderFinder(model()));
    const selection = `${query}\n${selectedIndex}`;
    if (selection === scrolledSelection) return;
    scrolledSelection = selection;
    dialog.querySelector(".finder-result.selected")?.scrollIntoView({ block: "nearest" });
    const previewPane = dialog.querySelector(".finder-preview");
    if (previewPane !== null) previewPane.scrollTop = 0;
  }

  const input = (): HTMLInputElement | null => dialog.querySelector("input");

  async function loadPreview(debounce = false): Promise<void> {
    const token = ++previewToken;
    preview = null;
    error = null;
    loading = false;
    if (narrow.matches || results.length === 0) {
      render();
      return;
    }
    if (debounce) {
      render();
      await new Promise((resolve) => setTimeout(resolve, PREVIEW_DEBOUNCE_MS));
      if (token !== previewToken || closed) return;
    }
    loading = true;
    render();
    try {
      const source = await options.loadSource(results[selectedIndex].entry);
      if (token !== previewToken) return;
      preview = source;
    } catch (failure) {
      if (token !== previewToken) return;
      error = failure instanceof Error ? failure.message : String(failure);
    }
    loading = false;
    render();
  }

  function select(index: number): void {
    selectedIndex = Math.min(Math.max(index, 0), Math.max(0, results.length - 1));
    input()?.focus({ preventScroll: true });
    void loadPreview();
  }

  function dispose(restoreFocus: boolean): void {
    if (closed) return;
    closed = true;
    previewToken++;
    narrow.removeEventListener("change", onLayoutChange);
    viewport?.removeEventListener("resize", syncViewport);
    viewport?.removeEventListener("scroll", syncViewport);
    dialog.close();
    dialog.remove();
    if (restoreFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected)
      previousFocus.focus({ preventScroll: true });
  }

  function close(): void {
    if (closed) return;
    dispose(true);
    options.onClose();
  }

  function openSelected(): void {
    if (results.length === 0 || closed) return;
    const { entry } = results[selectedIndex];
    dispose(false);
    options.onOpen(entry);
  }

  dialog.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter" && event.target instanceof HTMLButtonElement) {
      event.stopPropagation();
      return;
    }
    const ctrlKey = event.ctrlKey && CTRL_KEYS.has(event.key);
    if (HANDLED_KEYS.has(event.key) || ctrlKey) event.preventDefault();
    if (event.key === "Escape") close();
    else if (event.key === "Enter") openSelected();
    else if (event.key === "ArrowDown" || event.key === "ArrowUp" || ctrlKey)
      select(selectedIndex + (event.key === "ArrowDown" || event.key === "j" || event.key === "n" ? 1 : -1));
  });
  dialog.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    query = event.target.value;
    results = search(query);
    selectedIndex = 0;
    void loadPreview(true);
  });
  dialog.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const result = event.target.closest<HTMLElement>(".finder-result[data-index]");
    if (result !== null) {
      selectedIndex = Number(result.dataset.index);
      openSelected();
      return;
    }
    const action = event.target.closest<HTMLElement>("[data-finder-action]")?.dataset.finderAction;
    if (action === "close") close();
    else if (action === "retry") void loadPreview();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  render();
  document.body.append(dialog);
  narrow.addEventListener("change", onLayoutChange);
  viewport?.addEventListener("resize", syncViewport);
  viewport?.addEventListener("scroll", syncViewport);
  syncViewport();
  dialog.showModal();
  input()?.focus();
  void loadPreview();

  return { close };
}
