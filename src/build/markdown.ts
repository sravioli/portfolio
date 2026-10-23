import type { Element, ElementContent, Properties, Root as HastRoot, RootContent } from "hast";
import { toHtml } from "hast-util-to-html";
import { toString } from "hast-util-to-string";
import { common, createLowlight } from "lowlight";
import type { Blockquote, Paragraph, Root as MdastRoot } from "mdast";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";
import { find, isRoot, type PortfolioEntry } from "../lib/catalog.ts";
import { fileUrl, HOST, OWNER, BRANCH, rawFileUrl } from "../lib/github-urls.ts";
import { documentUrl, entryFromPath, siteUrl } from "../lib/routes.ts";

const documentFileLabel = (entry: PortfolioEntry): string =>
  isRoot(entry) ? "README" : entry.name;

const ALLOWED_TAGS = new Set([
  "a", "abbr", "b", "blockquote", "br", "code", "del", "dd", "details", "div", "dl", "dt", "em",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "input", "li", "ol", "p", "pre", "s",
  "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "th", "thead", "tr", "ul",
]);
const ALLOWED_PROPERTIES = new Set(["alt", "className", "href", "src", "title"]);
const URL_PROPERTIES = new Set(["href", "src"]);
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto"]);
const ALERT_TITLES: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};
const ALERT_MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\r?\n|$)/i;
const ATTACHMENT_PATH =
  /^\/user-attachments\/assets\/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/;
const HEADING_SEPARATOR = /[^\p{L}\p{Nd}]+/gu;
const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const lowlight = createLowlight(common);

const element = (
  tagName: string,
  properties: Properties = {},
  children: ElementContent[] = [],
): Element => ({ type: "element", tagName, properties, children });

const text = (value: string): ElementContent => ({ type: "text", value });

const isElement = (node: unknown, tagName?: string): node is Element =>
  typeof node === "object" &&
  node !== null &&
  (node as Element).type === "element" &&
  (tagName === undefined || (node as Element).tagName === tagName);

const stringProperty = (node: Element, name: string): string | null => {
  const value = node.properties[name];
  return typeof value === "string" ? value : null;
};

const classList = (node: Element): string[] => {
  const value: unknown = node.properties.className;
  return Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split(/\s+/) : [];
};

function parseAbsoluteUrl(value: string): URL | null {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function unescapeData(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Matches .NET Uri.EscapeDataString: only RFC 3986 unreserved characters stay literal.
const escapeData = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(HEADING_SEPARATOR, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length === 0 ? "section" : normalized;
}

// Documents written in this repository link to other catalog documents and to site assets by path,
// so those links stay on the site, work without JavaScript, and can be copied or opened in a new tab.
function resolveLocalDocumentUrl(entry: PortfolioEntry, value: string, image: boolean): string | null {
  if (!entry.isReadmeLocal || value.startsWith("//") || value.startsWith("#")) return null;
  if (image) return value.startsWith("/") ? siteUrl(value) : null;
  const target = entryFromPath(`/${value.replace(/^(\.\/)+|^\/+/, "")}`, "/");
  return target ? documentUrl(target) : null;
}

const isSitePath = (value: string): boolean => value.startsWith("/") && !value.startsWith("//");

function normalizeRepositoryPath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(escapeData(unescapeData(segment)));
  }
  return segments.join("/");
}

export function resolveUrl(entry: PortfolioEntry, value: string, image: boolean): string {
  const absolute = parseAbsoluteUrl(value);
  if (absolute) return absolute.href;
  const local = resolveLocalDocumentUrl(entry, value, image);
  if (local !== null) return local;
  const repository = isRoot(entry) ? OWNER : entry.repository;
  const directory =
    entry.readmePath === null
      ? ""
      : entry.readmePath.replaceAll("\\", "/").split("/").slice(0, -1).join("/");
  const relative = value.startsWith("/")
    ? value.replace(/^\/+/, "")
    : [directory, value].filter((segment) => segment.length > 0).join("/");
  const path = normalizeRepositoryPath(relative);
  return image ? rawFileUrl(repository, path) : fileUrl(repository, path);
}

function isAllowedUrl(value: string): boolean {
  // Browsers ignore whitespace and control characters when reading a scheme.
  const compact = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  return scheme === null || ALLOWED_SCHEMES.has(scheme[1].toLowerCase());
}

export function tryGetRepository(href: string): string | null {
  const uri = parseAbsoluteUrl(href);
  if (!uri || uri.hostname.toLowerCase() !== HOST) return null;
  const segments = uri.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (segments.length < 2 || segments[0].toLowerCase() !== OWNER.toLowerCase()) return null;
  const name = segments.slice(1).map((segment) => segment.toLowerCase());
  let repository = segments[1];
  if (repository.toLowerCase().endsWith(".git")) repository = repository.slice(0, -4);
  const branch = BRANCH.toLowerCase();
  const matches =
    name.length === 1 ||
    (name.length === 3 && name[1] === "tree" && name[2] === branch) ||
    (name.length === 4 && name[1] === "blob" && name[2] === branch && name[3] === "readme.md") ||
    (name.length === 5 &&
      name[1] === "blob" &&
      name[2] === branch &&
      name[3] === ".github" &&
      name[4] === "readme.md");
  return matches ? repository : null;
}

/** Turns GitHub `> [!NOTE]` blockquotes into themed callouts. */
function remarkAlerts() {
  return (tree: MdastRoot) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const paragraph = node.children[0];
      if (paragraph?.type !== "paragraph") return;
      const first = paragraph.children[0];
      if (first?.type !== "text") return;
      const marker = ALERT_MARKER.exec(first.value);
      if (!marker) return;
      const kind = marker[1].toLowerCase();
      first.value = first.value.slice(marker[0].length);
      if (first.value.length === 0) paragraph.children.shift();
      if (
        paragraph.children.length === 0 ||
        paragraph.children.every((child) => child.type === "text" && child.value.trim() === "")
      )
        node.children.shift();
      const title: Paragraph = {
        type: "paragraph",
        children: [{ type: "text", value: ALERT_TITLES[kind] }],
        data: { hProperties: { className: ["markdown-alert-title"] } },
      };
      node.children.unshift(title);
      node.data = {
        ...node.data,
        hName: "div",
        hProperties: { className: ["markdown-alert", `markdown-alert-${kind}`] },
      };
    });
  };
}

function rewriteResourceUrls(tree: HastRoot, entry: PortfolioEntry): void {
  visit(tree, "element", (node: Element) => {
    if (node.tagName === "a") {
      const href = stringProperty(node, "href");
      if (href !== null && !href.startsWith("#")) node.properties.href = resolveUrl(entry, href, false);
    } else if (node.tagName === "img") {
      const src = stringProperty(node, "src");
      if (src === null) return;
      const local = resolveUrl(entry, src, true);
      if (isSitePath(local)) {
        node.properties.src = local;
        return;
      }
      const resolved = parseAbsoluteUrl(local);
      if (!resolved || (resolved.protocol !== "http:" && resolved.protocol !== "https:")) {
        delete node.properties.src;
        return;
      }
      if (resolved.protocol === "http:") {
        resolved.protocol = "https:";
        resolved.port = "";
      }
      node.properties.src = resolved.href;
    }
  });
}

// Disallowed elements disappear with their content; only inert task-list inputs survive.
function sanitizeChildren(children: RootContent[] | ElementContent[]): ElementContent[] {
  const kept: ElementContent[] = [];
  for (const child of children) {
    if (child.type === "text") kept.push(child);
    else if (child.type === "element" && ALLOWED_TAGS.has(child.tagName)) {
      if (child.tagName === "input" && child.properties.type !== "checkbox") continue;
      const properties: Properties = {};
      for (const [name, value] of Object.entries(child.properties)) {
        if (!ALLOWED_PROPERTIES.has(name) || value === null || value === undefined) continue;
        if (URL_PROPERTIES.has(name) && !isAllowedUrl(String(value))) continue;
        properties[name] = value;
      }
      if (child.tagName === "details" && child.properties.open === true) properties.open = true;
      if (child.tagName === "input") {
        properties.type = "checkbox";
        properties.disabled = true;
        if (child.properties.checked === true) properties.checked = true;
      }
      child.properties = properties;
      child.children = sanitizeChildren(child.children);
      kept.push(child);
    }
  }
  return kept;
}

// Trusted icons are inserted after sanitizing untrusted README HTML.
function addAlertIcons(tree: HastRoot): void {
  const paths: Record<string, string> = {
    note: "M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM7.25 7h1.5v5h-1.5ZM8 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
    tip: "M8 0a5 5 0 0 0-3 9v2a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V9a5 5 0 0 0-3-9Zm0 1.5A3.5 3.5 0 0 1 10 8l-.5.4v2.1h-3V8.4L6 8a3.5 3.5 0 0 1 2-6.5ZM6 13h4v1.5H6Z",
    important: "M2 1h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7l-4 3v-3H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Zm.5 1.5v8H4.5V12l2-1.5h7v-8ZM7.25 4h1.5v3.5h-1.5ZM8 8.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z",
    warning: "M8 .5 16 15H0Zm0 3L2.5 13.5h11ZM7.25 6h1.5v4h-1.5ZM8 11a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z",
    caution: "M4.7 0h6.6L16 4.7v6.6L11.3 16H4.7L0 11.3V4.7ZM5.3 1.5 1.5 5.3v5.4l3.8 3.8h5.4l3.8-3.8V5.3l-3.8-3.8ZM7.25 4h1.5v5h-1.5ZM8 10.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z",
  };
  visit(tree, "element", (node: Element) => {
    if (!classList(node).includes("markdown-alert")) return;
    const kind = classList(node).find((name) => name.startsWith("markdown-alert-"))?.slice("markdown-alert-".length);
    const title = node.children.find((child) =>
      isElement(child, "p") && classList(child).includes("markdown-alert-title"));
    if (kind === undefined || !Object.hasOwn(paths, kind) || !isElement(title)) return;
    title.children.unshift(element("svg", {
      className: ["markdown-alert-icon"],
      viewBox: "0 0 16 16",
      ariaHidden: "true",
    }, [element("path", { d: paths[kind] })]));
  });
}

function embedAttachmentVideos(tree: HastRoot): void {
  visit(tree, "element", (paragraph: Element) => {
    if (paragraph.tagName !== "p") return;
    const elements = paragraph.children.filter((child) => child.type === "element");
    const anchor = elements[0];
    if (elements.length !== 1 || !isElement(anchor, "a")) return;
    const href = stringProperty(anchor, "href");
    if (
      href === null ||
      toString(paragraph).trim() !== href ||
      anchor.children.some((child) => child.type === "element")
    )
      return;
    const uri = parseAbsoluteUrl(href);
    if (!uri || uri.protocol !== "https:" || uri.hostname.toLowerCase() !== HOST) return;
    if (!ATTACHMENT_PATH.test(uri.pathname)) return;
    const video = element("video", {
      src: href,
      controls: true,
      playsInline: true,
      preload: "none",
      ariaLabel: "README video",
    });
    const index = paragraph.children.indexOf(anchor);
    paragraph.children.splice(index, 0, video, element("br"));
    anchor.children = [text("Open video on GitHub")];
  });
}

function addHeadingIdsAndResolveAnchors(tree: HastRoot): void {
  const slugs = new Map<string, string>();
  const counts = new Map<string, number>();
  visit(tree, "element", (heading: Element) => {
    if (!HEADING_TAGS.has(heading.tagName)) return;
    const baseSlug = slugify(toString(heading));
    const count = counts.get(baseSlug) ?? 0;
    counts.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
    heading.properties.id = `readme-${slug}`;
    if (!slugs.has(baseSlug)) slugs.set(baseSlug, `readme-${baseSlug}`);
  });
  visit(tree, "element", (anchor: Element) => {
    if (anchor.tagName !== "a") return;
    const href = stringProperty(anchor, "href");
    if (href === null || !href.startsWith("#")) return;
    const normalized = slugify(unescapeData(href.slice(1)));
    const id = slugs.get(normalized);
    if (id !== undefined) anchor.properties.href = `#${id}`;
    else {
      anchor.properties.dataMissingAnchor = normalized;
      delete anchor.properties.href;
    }
  });
}

function markInternalRepositoryLinks(tree: HastRoot): void {
  visit(tree, "element", (anchor: Element) => {
    if (anchor.tagName !== "a") return;
    const href = stringProperty(anchor, "href");
    if (href !== null && isSitePath(href)) {
      const target = entryFromPath(href);
      if (!target) return;
      anchor.properties.dataInternalRepo = target.repository;
      anchor.properties.title = `Open ${documentFileLabel(target)} here`;
      return;
    }
    const repository = href === null ? null : tryGetRepository(href);
    if (repository === null || find(repository) === null) return;
    anchor.properties.dataInternalRepo = repository;
    anchor.properties.title = `Open ${repository} here`;
  });
}

// Added after sanitizing; the button has no text so the reading cursor never lands on it.
function addCodeWrapToggles(tree: HastRoot): void {
  visit(tree, "element", (pre: Element, index, parent) => {
    if (pre.tagName !== "pre" || parent === undefined || index === undefined) return;
    const toggle = element("button", {
      type: "button",
      className: ["code-wrap-toggle"],
      ariaLabel: "Wrap long lines",
      ariaPressed: "false",
      title: "Toggle line wrap",
    });
    parent.children[index] = element("div", { className: ["code-block"] }, [toggle, pre]);
    return [SKIP, index + 1];
  });
}

function prepareImages(tree: HastRoot): void {
  visit(tree, "element", (image: Element) => {
    if (image.tagName !== "img") return;
    image.properties.loading = "lazy";
    image.properties.referrerPolicy = "no-referrer";
  });
}

function highlightCode(tree: HastRoot): void {
  visit(tree, "element", (code: Element, _index, parent) => {
    if (code.tagName !== "code" || !isElement(parent, "pre")) return;
    const classes = classList(code);
    const language = classes.find((name) => name.startsWith("language-"))?.slice("language-".length);
    if (!language) return;
    if (!lowlight.registered(language)) {
      code.properties.dataHighlightSkip = "";
      return SKIP;
    }
    const highlighted = lowlight.highlight(language, toString(code));
    code.children = highlighted.children as ElementContent[];
    code.properties.className = [...classes, "hljs"];
    code.properties.dataHighlighted = "yes";
    return SKIP;
  });
}

function rehypePortfolio(entry: PortfolioEntry) {
  return (tree: HastRoot) => {
    rewriteResourceUrls(tree, entry);
    tree.children = sanitizeChildren(tree.children);
    addAlertIcons(tree);
    embedAttachmentVideos(tree);
    addHeadingIdsAndResolveAnchors(tree);
    markInternalRepositoryLinks(tree);
    addCodeWrapToggles(tree);
    prepareImages(tree);
    highlightCode(tree);
  };
}

/** Renders README markdown to the sanitized article HTML the client expects. */
export function renderMarkdown(source: string, entry: PortfolioEntry): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm, { singleTilde: false })
    .use(remarkAlerts)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypePortfolio, entry);
  const tree = processor.runSync(processor.parse(source)) as HastRoot;
  return toHtml(tree);
}
