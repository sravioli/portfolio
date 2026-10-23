export interface PortfolioEntry {
  readonly name: string;
  readonly repository: string;
  readonly description: string;
  readonly readmePath: string | null;
  readonly children: readonly PortfolioEntry[];
  readonly isProjectFile: boolean;
  readonly isReadmeLocal: boolean;
}

export type ExplorerItemKind = "parent" | "readme" | "folder" | "projectFile";

export interface ExplorerItem {
  readonly name: string;
  readonly kind: ExplorerItemKind;
  readonly entry: PortfolioEntry | null;
  readonly depth: number;
  readonly isExpanded: boolean;
}

export interface PickMenuItem {
  readonly key: string;
  readonly label: string;
  readonly repository: string;
  readonly kind: "readme" | "file" | "folder";
  readonly hasChildren: boolean;
}

export const hasReadme = (entry: PortfolioEntry): boolean =>
  entry.readmePath !== null || entry.isReadmeLocal;

export const isRoot = (entry: PortfolioEntry): boolean => entry.repository.length === 0;

/** A local file shown as itself (e.g. `featured.md`) rather than as a folder with a README. */
export const isStandaloneDocument = (entry: PortfolioEntry): boolean =>
  entry.isProjectFile && entry.isReadmeLocal;

/** File name shown for an entry's document in the breadcrumb, statusline, and errors. */
export const documentFileName = (entry: PortfolioEntry): string =>
  isStandaloneDocument(entry) ? entry.name : "README.md";

export function explorerItem(
  name: string,
  kind: ExplorerItemKind,
  entry: PortfolioEntry | null = null,
  depth = 0,
  isExpanded = false,
): ExplorerItem {
  return { name, kind, entry, depth, isExpanded };
}

function entry(
  name: string,
  repository: string,
  description: string,
  readmePath: string | null,
  children: PortfolioEntry[] = [],
  { isProjectFile = false, isReadmeLocal = false } = {},
): PortfolioEntry {
  return { name, repository, description, readmePath, children, isProjectFile, isReadmeLocal };
}

const project = (
  name: string,
  description: string,
  readmePath: string | null = ".github/readme.md",
): PortfolioEntry => entry(name, name, description, readmePath);

const plugin = (
  name: string,
  description: string,
  readmePath = ".github/readme.md",
): PortfolioEntry =>
  entry(`${name}.wz`, `${name}.wz`, description, readmePath, [], { isProjectFile: true });

const root = entry(
  "sravioli",
  "",
  "Simone Fidanza's projects",
  "README.md",
  [
    entry(
      "featured.md",
      "featured.md",
      "Three projects worth a closer look, with the problem, the demo, and the trade-offs.",
      null,
      [],
      { isProjectFile: true, isReadmeLocal: true },
    ),
    project("chrono", "Zero-dependency benchmarking for Lua."),
    entry("nvim", "nvim", "My Neovim configuration.", null, [], { isReadmeLocal: true }),
    project("wezterm", "My WezTerm configuration."),
    entry(
      "wezterm-plugins",
      "wezterm-plugins",
      "WezTerm plugins.",
      null,
      [
        plugin("beacon", "Non-blocking update notifications."),
        plugin("chord", "Vim-style key mappings and hints."),
        plugin("kanagawa", "Kanagawa color schemes for WezTerm."),
        plugin("lantern", "Configurable selection menus."),
        plugin("log", "Lightweight, pluggable logging."),
        plugin("memo", "Memoization, caching, and persistent state."),
        plugin("nap", "A lazy.nvim-inspired plugin manager for WezTerm.", "README.md"),
        plugin("ribbon", "Styled text segments for WezTerm UI."),
        plugin("sigil", "Icons and identity colors."),
        plugin("warden", "Schema validation for plugins and configuration."),
        plugin("warp", "Utilities for WezTerm."),
      ],
      { isReadmeLocal: true },
    ),
  ],
  { isReadmeLocal: true },
);

export const rootEntry: PortfolioEntry = root;

function* descendants(parent: PortfolioEntry): Generator<PortfolioEntry> {
  for (const child of parent.children) {
    yield child;
    yield* descendants(child);
  }
}

const all: readonly PortfolioEntry[] = [root, ...descendants(root)];

export const allEntries = (): readonly PortfolioEntry[] => all;

const equalsIgnoreCase = (left: string, right: string): boolean =>
  left.toUpperCase() === right.toUpperCase();

export function find(repository: string): PortfolioEntry | null {
  if (repository.length === 0) return root;
  return all.find((item) => !isRoot(item) && equalsIgnoreCase(item.repository, repository)) ?? null;
}

export function findByReadmePath(path: string): PortfolioEntry | null {
  let normalized = path.replaceAll("\\", "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  return (
    all.find((item) => hasReadme(item) && equalsIgnoreCase(getReadmePath(item), normalized)) ??
    null
  );
}

export function findParent(child: PortfolioEntry): PortfolioEntry | null {
  return all.find((item) => item.children.includes(child)) ?? null;
}

export function getAncestry(item: PortfolioEntry): PortfolioEntry[] {
  const entries: PortfolioEntry[] = [];
  let current = item;
  while (!isRoot(current)) {
    entries.unshift(current);
    current = findParent(current) ?? root;
  }
  return [root, ...entries];
}

export const getPath = (item: PortfolioEntry): string[] =>
  getAncestry(item).map((ancestor) => ancestor.name);

export function getReadmePath(item: PortfolioEntry): string {
  const repositoryPath = getPath(item).slice(1).join("/");
  if (isStandaloneDocument(item)) return repositoryPath;
  const readmePath = item.readmePath ?? "README.md";
  return repositoryPath.length > 0 ? `${repositoryPath}/${readmePath}` : readmePath;
}

export function getListing(folder: PortfolioEntry): ExplorerItem[] {
  const items: ExplorerItem[] = [];
  if (!isRoot(folder)) items.push(explorerItem("../", "parent"));
  if (hasReadme(folder)) items.push(explorerItem("README.md", "readme", folder));
  for (const child of folder.children) {
    items.push(
      child.isProjectFile
        ? explorerItem(child.name, "projectFile", child)
        : explorerItem(`${child.name}/`, "folder", child),
    );
  }
  return items;
}

export const getContentListing = (folder: PortfolioEntry): ExplorerItem[] =>
  getListing(folder).filter((item) => item.kind !== "parent");

export const pickKey = (item: PortfolioEntry): string =>
  (item.isProjectFile ? "file:" : "folder:") + item.repository;

export function getPickMenu(repository: string): PickMenuItem[] {
  const folder = find(repository);
  if (!folder) return [];
  return getContentListing(folder).map((item): PickMenuItem => {
    const target = item.entry as PortfolioEntry;
    switch (item.kind) {
      case "readme":
        return {
          key: `readme:${target.repository}`,
          label: item.name,
          repository: target.repository,
          kind: "readme",
          hasChildren: false,
        };
      case "projectFile":
        return {
          key: pickKey(target),
          label: item.name,
          repository: target.repository,
          kind: "file",
          hasChildren: false,
        };
      default:
        return {
          key: pickKey(target),
          label: target.name,
          repository: target.repository,
          kind: "folder",
          hasChildren: hasReadme(target) || target.children.length > 0,
        };
    }
  });
}
