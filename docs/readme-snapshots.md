# README snapshots

External READMEs are deployment-time snapshots, not live browser fetches.
The content generator fetches each external catalog README from GitHub and runs the
same renderer and sanitizer used for the root README. Each same-origin JSON file
contains the original Markdown and sanitized HTML. Raw view, copying, resource URL
rewriting, internal links, and heading IDs keep their existing behavior.

The browser fetches only the requested snapshot, then caches source and HTML for its
repository and README path during the session. Opening an external snapshot does
not download the Markdown renderer. External content updates on the next deployment;
reloading the page does not fetch a newer README from GitHub.

## Generate and publish

Install .NET 10 and the WebAssembly tools, then run:

```powershell
dotnet workload install wasm-tools
dotnet run --project .\src\Srv.Portfolio.ContentGenerator -c Release -- --readmes .\src\Srv.Portfolio\wwwroot
dotnet publish .\src\Srv.Portfolio -c Release
```

The deployment workflow runs snapshot generation before publishing. GitHub fetch,
rendering, and filesystem failures stop generation and therefore deployment.
Publishing independently verifies every catalog snapshot exists and matches its
repository/path. Missing or invalid browser snapshots use the existing load-error
UI and retry action; there is no silent live-fetch fallback.

Normal builds and tests do not fetch GitHub content. Run generation before local
browser previews too. Generated files under `src/Srv.Portfolio/wwwroot/readmes/`
are ignored; do not edit or commit them. Regenerate after changing catalog paths or
renderer rules. Successful generation overwrites each catalog entry's snapshot.

For repeatable offline input, append `--source-directory C:\path\to\fixtures`.
Supply one `<repository>.md` file per external catalog entry. Files are still passed
through the real renderer and sanitizer, not copied directly into trusted HTML.

## Local content and lazy rendering

The fixed root README is rendered during normal builds. Its generated HTML lives
under `obj/`; its Markdown stays available for raw view and copying.

The generated WezTerm plugin collection still uses live repository descriptions
with its existing six-hour persisted description cache. That collection uses the
lazy renderer. Markdig, HtmlSanitizer, AngleSharp, its CSS dependency, and CodePages
remain deferred. Changed local Markdown replaces its cached rendering.

If that renderer download fails, the app displays raw Markdown and a **Reload page**
recovery button. A full reload is necessary because WebAssembly can retain failed
asset downloads within the current page.

## Boundaries and trade-offs

`Srv.Portfolio.Content` owns catalog data, snapshot contracts, and root Markdown.
`Srv.Portfolio.Rendering` owns Markdown transformations and sanitization.
`Srv.Portfolio.ContentGenerator` runs that renderer at build/deployment time.
`ReadmeService` loads snapshots and keeps the existing per-session caches.

Work moves from each visitor's browser to the deployment machine; the renderer
algorithm itself is not faster. JSON includes both source and HTML, so each file is
larger than raw Markdown alone. Files load on demand, not during application boot.
The renderer remains available for the dynamic collection rather than being
unsafely removed. See [performance checks](performance.md) for measurements.
