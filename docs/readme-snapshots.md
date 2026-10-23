# README snapshots

External READMEs are build-time snapshots, not live browser fetches. `npm run build`
fetches each catalog README from `raw.githubusercontent.com`, renders it once, and
writes three static files per document:

Deployment URLs use Astro's configured base path. GitHub Pages builds set
`PAGES_BASE_PATH` and `PAGES_SITE_URL` from `actions/configure-pages`, so assets,
document navigation, fragments and raw sources work under `/portfolio/` as well
as at a domain root. For a local project-path build, set
`PAGES_BASE_PATH=/portfolio/` before running `npm run build`.

- `/<slug>/index.html`: the full page, with the article already in the markup.
- `/fragments/<key>.html`: the rendered article body only.
- `/raw/<key>.md`: the original Markdown, for the raw view and copying.

Fragment and raw endpoints share `documentAssetPaths` in `src/build/documents.ts`,
so both enumerate the same document keys and entries.

Opening a document from the explorer or finder fetches only its fragment; the raw
Markdown loads on demand or on idle after a deep link. Both are cached for the rest
of the session. Content updates on the next deployment; reloading the page does not
fetch a newer README from GitHub.

`src/client/text-cache.ts` shares successful text-response caching for document
fragments, raw sources, and help fragments. Each keeps its own cache, failed
requests remain retryable, and concurrent misses remain independent.

## Rendering

`src/build/markdown.ts` parses Markdown with `remark-parse` and `remark-gfm`, converts
it with `remark-rehype` and `rehype-raw`, then applies the portfolio transforms:

- An allowlist sanitizer. Disallowed elements are dropped with their content, and
  only `http`, `https`, and `mailto` URLs survive.
- GitHub alerts (`NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) get an icon,
  title and colored border using the active Wave/Lotus palette.
- Expandable `<details>` / `<summary>` sections keep their Markdown content and
  initial `open` state. Event handlers and unsafe nested content are still removed.
- GFM tables, strikethrough, autolinks and task lists are supported. Task-list
  checkboxes are read-only; other input controls are removed.
- Relative image and link URLs resolve against the repository and README path.
- Headings get unique slug IDs. In-page anchors are rewritten to those IDs; anchors
  without a matching heading lose their `href`.
- Links to other catalog repositories open inside the portfolio.
- GitHub attachment videos become `<video>` embeds.
- Code blocks get a wrap toggle and are highlighted with `lowlight` (highlight.js
  grammars), so the browser never downloads a highlighter.

The root README and the WezTerm plugin index are generated locally in
`src/build/readmes.ts`. Plugin descriptions come from a single GitHub API request;
if it fails, the build warns and uses the catalog descriptions instead.

## Failures

A failed README fetch fails the build and therefore the deployment. There is no
silent fallback to stale content. The deployment sets `GITHUB_TOKEN` to avoid API
rate limits.

## Offline builds

Set `PORTFOLIO_README_DIR` to a directory containing one `<repository>.md` file per
external catalog entry:

```powershell
$env:PORTFOLIO_README_DIR = "C:\path\to\fixtures"
npm run build
```

Fixture files still go through the real renderer and sanitizer. Without
`GITHUB_TOKEN`, offline builds also skip the description request and use the catalog
descriptions.
