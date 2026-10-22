import { find, getPath, isRoot, type PortfolioEntry } from "./catalog.ts";

export const ROOT_DOCUMENT_SEGMENT = "readme";

export const BASE_PATH = import.meta.env?.BASE_URL ?? "/";
export const siteUrl = (path: string, basePath = BASE_PATH): string =>
  `${basePath.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

/** Path of a document page without the surrounding slashes, e.g. `wezterm-plugins/nap.wz`. */
export const documentSlug = (entry: PortfolioEntry): string =>
  isRoot(entry) ? ROOT_DOCUMENT_SEGMENT : getPath(entry).slice(1).join("/");

/** Pretty URL of a document: `/readme/` for the root README, otherwise its catalog path. */
export function documentUrl(entry: PortfolioEntry): string {
  if (isRoot(entry)) return siteUrl(`${ROOT_DOCUMENT_SEGMENT}/`);
  return siteUrl(`${getPath(entry)
    .slice(1)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}/`);
}

/** Stable asset key for fragments and raw sources. */
export const documentKey = (entry: PortfolioEntry): string =>
  isRoot(entry) ? ROOT_DOCUMENT_SEGMENT : entry.repository;

export const fragmentUrl = (entry: PortfolioEntry): string =>
  siteUrl(`fragments/${encodeURIComponent(documentKey(entry))}.html`);

export const rawUrl = (entry: PortfolioEntry): string =>
  siteUrl(`raw/${encodeURIComponent(documentKey(entry))}.md`);

export const SITE_TITLE = "Simone's Portfolio";

/** Document title of a page; `undefined` is the welcome screen. */
export const pageTitle = (entry: PortfolioEntry | undefined): string =>
  entry === undefined ? SITE_TITLE : `${isRoot(entry) ? "README" : entry.name} | ${SITE_TITLE}`;

/** Resolves a pathname to a document; `undefined` means the welcome screen, `null` means unknown. */
export function entryFromPath(pathname: string, basePath = BASE_PATH): PortfolioEntry | null | undefined {
  const base = basePath.replace(/\/$/, "");
  if (base) {
    if (pathname === base) pathname = "/";
    else if (pathname.startsWith(`${base}/`)) pathname = pathname.slice(base.length);
    else return null;
  }
  const segments = pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  if (segments.length === 0) return undefined;
  if (segments.length === 1 && segments[0].toLowerCase() === ROOT_DOCUMENT_SEGMENT)
    return find("");
  const entry = find(segments[segments.length - 1]);
  if (!entry || isRoot(entry)) return null;
  const expected = getPath(entry).slice(1);
  return expected.length === segments.length &&
    expected.every((segment, index) => segment.toLowerCase() === segments[index].toLowerCase())
    ? entry
    : null;
}
