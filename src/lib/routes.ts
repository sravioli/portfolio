import { find, getPath, isRoot, type PortfolioEntry } from "./catalog.ts";

export const ROOT_DOCUMENT_SEGMENT = "readme";

export const BASE_PATH = import.meta.env?.BASE_URL ?? "/";

/** Decodes a URL component, preserving malformed encodings as written. */
export function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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

export const SITE_DESCRIPTION =
  "Simone Fidanza, .NET developer. Lua tooling, WezTerm plugins, and dotfiles, presented as a Neovim session.";

/** Meta and Open Graph description of a page; `undefined` is the welcome screen. */
export function pageDescription(entry: PortfolioEntry | undefined): string {
  if (entry === undefined || isRoot(entry)) return SITE_DESCRIPTION;
  const description = entry.description.replace(/\.$/, "");
  return `${entry.name}: ${description}. Part of Simone Fidanza's portfolio.`;
}

/** Help file shown by a bare `:help`; its page lives at `/help/`. */
export const HELP_INDEX_PAGE = "help";

/** Element id of a help tag; also the URL fragment that links to it. */
export const helpAnchor = (tag: string): string => `help-${tag}`;

/** Pretty URL of a help file: `/help/` for the index, otherwise `/help/{page}/`. */
export const helpPageUrl = (page: string): string =>
  siteUrl(page === HELP_INDEX_PAGE ? "help/" : `help/${encodeURIComponent(page)}/`);

/** URL of a help tag inside its help file. */
export const helpTagUrl = (page: string, tag: string): string =>
  `${helpPageUrl(page)}#${encodeURIComponent(helpAnchor(tag))}`;

export const helpFragmentUrl = (page: string): string =>
  siteUrl(`help-fragments/${encodeURIComponent(page)}.html`);

/** Help file of a pathname, e.g. `clipboard` for `/help/clipboard/`; `null` when it is not a help page. */
export function helpPageFromPath(pathname: string, basePath = BASE_PATH): string | null {
  const base = basePath.replace(/\/$/, "");
  if (base) {
    if (!pathname.startsWith(`${base}/`)) return null;
    pathname = pathname.slice(base.length);
  }
  const match = /^\/help(?:\/([^/]+))?\/?$/i.exec(pathname);
  if (match === null) return null;
  if (match[1] === undefined) return HELP_INDEX_PAGE;
  return decodeUrlComponent(match[1]);
}

/** Help tag named by a URL fragment such as `#help-clipboard`; `null` when it names none. */
export function helpTagFromHash(hash: string): string | null {
  const fragment = decodeUrlComponent(hash.replace(/^#/, ""));
  const prefix = helpAnchor("");
  return fragment.startsWith(prefix) && fragment.length > prefix.length ? fragment.slice(prefix.length) : null;
}

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
    .map(decodeUrlComponent);
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
