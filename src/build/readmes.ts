import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  allEntries,
  find,
  hasReadme,
  isRoot,
  type PortfolioEntry,
} from "../lib/catalog.ts";
import { rawFileUrl, repositoryUrl, REPOSITORIES_API_URL } from "../lib/github-urls.ts";

export const ROOT_README_SOURCE = `# Hi, I'm Simone.

I work with .NET. I build Lua tools in my own time.

## At work

C#, ASP.NET, and MAUI.

## Outside work

WezTerm plugins, Neovim, Python, and some C/C++.

[GitHub](https://github.com/sravioli)

\`j/k move · gx open link · - parent · :Ex explorer · ? help\``;

export const NO_README_SOURCE = "No README published.";

const REQUEST_TIMEOUT_MS = 30_000;

const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  return response.text();
}

/** Reads a published README, from `PORTFOLIO_README_DIR/<repository>.md` when set (offline builds). */
async function readPublishedReadme(entry: PortfolioEntry): Promise<string> {
  const fixtures = process.env.PORTFOLIO_README_DIR;
  if (fixtures) return stripBom(await readFile(path.join(fixtures, `${entry.repository}.md`), "utf8"));
  return fetchText(rawFileUrl(entry.repository, entry.readmePath!));
}

let descriptions: Promise<Map<string, string | null>> | undefined;

// One request covers every plugin; failures fall back to the catalog descriptions.
function repositoryDescriptions(): Promise<Map<string, string | null>> {
  descriptions ??= (async () => {
    if (process.env.PORTFOLIO_README_DIR && !process.env.GITHUB_TOKEN) return new Map();
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    try {
      const repositories = JSON.parse(await fetchText(REPOSITORIES_API_URL, headers)) as {
        name?: string | null;
        description?: string | null;
      }[];
      const lookup = new Map<string, string | null>();
      for (const repository of repositories) {
        const name = repository.name?.toLowerCase();
        if (name && !lookup.has(name)) lookup.set(name, repository.description ?? null);
      }
      return lookup;
    } catch (error) {
      console.warn(`warning: using catalog descriptions: ${(error as Error).message}`);
      return new Map();
    }
  })();
  return descriptions;
}

async function buildPluginReadme(): Promise<string> {
  const plugins = find("wezterm-plugins")!.children;
  const lookup = await repositoryDescriptions();
  return (
    "# WezTerm plugins\n\nA collection of small, composable plugins for WezTerm.\n\n" +
    plugins
      .map(
        (plugin) =>
          `- [${plugin.name}](${repositoryUrl(plugin.repository)}) — ` +
          `${lookup.get(plugin.repository.toLowerCase()) ?? plugin.description}`,
      )
      .join("\n") +
    "\n"
  );
}

/** Returns the README source shown for an entry, fetching published READMEs at build time. */
export async function readmeSource(entry: PortfolioEntry): Promise<string> {
  if (entry.isReadmeLocal) return isRoot(entry) ? ROOT_README_SOURCE : buildPluginReadme();
  if (!hasReadme(entry)) return NO_README_SOURCE;
  return readPublishedReadme(entry);
}

// Entries without a README (nvim) still open as a document that says so, like the original app.
export const documentEntries = (): readonly PortfolioEntry[] => allEntries();
