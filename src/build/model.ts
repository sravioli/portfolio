import { NavigationState } from "../lib/navigation-state.ts";
import type { ViewModel } from "../lib/view.ts";
import type { PortfolioDocument } from "./documents.ts";

const baseModel = (state: NavigationState): ViewModel => ({
  state,
  // The client decides from the viewport and the saved preference; an inline script applies it before paint.
  explorer: "pending",
  finderOpen: false,
  loading: false,
  loadError: null,
  documentHtml: null,
  documentSource: null,
  documentBytes: 0,
  totalLines: 1,
  positionLine: 1,
  positionColumn: 1,
  scrollPosition: "All",
  headings: [],
  openError: null,
});

export const welcomeModel = (): ViewModel => baseModel(new NavigationState());

/** Server-rendered help page: the welcome screen with the help file open beside it. */
export function helpModel(page: string, html: string): ViewModel {
  const state = new NavigationState();
  state.isHelpOpen = true;
  state.helpPage = page;
  return { ...baseModel(state), helpHtml: html };
}

/** Server-rendered view of an open document, matching what the client shows after loading it. */
export function documentModel(document: PortfolioDocument): ViewModel {
  const state = new NavigationState();
  state.navigateTo(document.entry.repository);
  return {
    ...baseModel(state),
    documentHtml: document.html,
    documentBytes: document.bytes,
    totalLines: Math.max(1, document.lines),
  };
}
