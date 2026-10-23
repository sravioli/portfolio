import { find, rootEntry, type PortfolioEntry } from "../lib/catalog.ts";
import { byteLength, countLines } from "../lib/format.ts";
import { documentKey } from "../lib/routes.ts";
import { renderMarkdown } from "./markdown.ts";
import { documentEntries, readmeSource } from "./readmes.ts";

export interface PortfolioDocument {
  readonly entry: PortfolioEntry;
  readonly key: string;
  readonly source: string;
  readonly html: string;
  readonly bytes: number;
  readonly lines: number;
}

const cache = new Map<string, Promise<PortfolioDocument>>();

/** Static parameters shared by the rendered-fragment and raw-source endpoints. */
export const documentAssetPaths = () =>
  documentEntries().map((entry) => ({
    params: { key: documentKey(entry) },
    props: { entry },
  }));

/** Loads and renders a README once per build, shared by pages, fragments, and raw endpoints. */
export function loadDocument(entry: PortfolioEntry): Promise<PortfolioDocument> {
  const key = documentKey(entry);
  let document = cache.get(key);
  if (!document) {
    document = readmeSource(entry).then((source) => ({
      entry,
      key,
      source,
      html: renderMarkdown(source, entry),
      bytes: byteLength(source),
      lines: countLines(source),
    }));
    cache.set(key, document);
  }
  return document;
}

export const loadAllDocuments = (): Promise<PortfolioDocument[]> =>
  Promise.all(documentEntries().map(loadDocument));

export function entryForKey(key: string): PortfolioEntry {
  const entry = key === documentKey(rootEntry) ? rootEntry : find(key);
  if (!entry) throw new Error(`Unknown document key: ${key}`);
  return entry;
}

/** Byte size and line count per document key, used by the statusline before a source is fetched. */
export async function documentMetrics(): Promise<Record<string, [bytes: number, lines: number]>> {
  const metrics: Record<string, [number, number]> = {};
  for (const document of await loadAllDocuments())
    metrics[document.key] = [document.bytes, document.lines];
  return metrics;
}
