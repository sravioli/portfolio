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
import { stripBom } from "../lib/format.ts";

export const ROOT_README_SOURCE = `# Hi, I'm Simone.

I'm an Associate Product Software Engineer at Wolters Kluwer Italia, in Bari. At work I build and
maintain .NET product software: C# services, ASP.NET back ends, and MAUI apps.

Outside work I make tools for the tools I use every day. I like small, well-tested libraries with
honest documentation, editors that get out of the way, and measuring before optimizing.

## Where to start

- [featured.md](featured.md) — three projects with the problem, the demo, my part, and one
  technical decision each. Includes before/after numbers for this site's move from Blazor to Astro.
- [chrono](chrono/) — a zero-dependency benchmarking engine for Lua 5.1 and LuaJIT.
- [wezterm-plugins](wezterm-plugins/) — eleven small, composable plugins for the WezTerm terminal.
- [nvim](nvim/) — the Neovim setup this site imitates.

## What I use

C#, ASP.NET, and MAUI at work. Lua, Python, and some C/C++ in my own time.

## Contact

Email me at [s.fidanza@pm.me](mailto:s.fidanza@pm.me), or find me on
[LinkedIn](https://www.linkedin.com/in/simone-fidanza/) and [GitHub](https://github.com/sravioli).

\`j/k move · gx open link · - parent · :Ex explorer · ? help\``;

export const NO_README_SOURCE = "No README published.";

// Documents written for this site, read from src/documents at build time.
const LOCAL_DOCUMENTS: Readonly<Record<string, string>> = {
  "featured.md": "featured.md",
  nvim: "nvim.md",
};

export const localDocumentPath = (file: string): string =>
  path.join(process.cwd(), "src", "documents", file);

const REQUEST_TIMEOUT_MS = 30_000;

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
  if (entry.isReadmeLocal) {
    if (isRoot(entry)) return ROOT_README_SOURCE;
    const file = LOCAL_DOCUMENTS[entry.repository];
    if (file !== undefined) return stripBom(await readFile(localDocumentPath(file), "utf8"));
    return buildPluginReadme();
  }
  if (!hasReadme(entry)) return NO_README_SOURCE;
  return readPublishedReadme(entry);
}

// Entries without a README still open as a document that says so, like the original app.
export const documentEntries = (): readonly PortfolioEntry[] => allEntries();
