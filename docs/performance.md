# Performance checks

Explorer listings are read-only snapshots, reused until a folder expands or
collapses. Each navigation state retains only its current snapshot.

README position reports index heading ancestry for the current preview, read only
active titles, and stop measuring live positions at the first heading below the
current position, in document order. The index is rebuilt when the preview changes
and cleared on disposal. Image loading, scrolling, and resizing do not rely on
cached coordinates. Unsorted positions, such as multi-column layouts, retain the
original document-order behavior.

External Markdown rendering moves to deployment-time
[README snapshots](readme-snapshots.md); the dynamic collection still renders lazily.

## Correctness and native benchmarks

```powershell
dotnet test --solution .\Srv.Portfolio.slnx -c Release
node --test
python -m unittest discover -s .\tests\tools
dotnet run --project .\tests\performance\Performance.csproj -c Release
```

The dependency-free C# benchmark exercises the real catalog's collapsed/expanded
explorer, selection, fuzzy search, and an uncached 200-section Markdown document.
It reports first-call latency separately from warmed median/p95 batch timings,
allocations per operation, and GC counts. Each workload warms for at least one
second to allow tiered JIT compilation. An optional trailing filter, for example
`-- Markdown` with `dotnet run`, isolates workloads to assess ordering/GC effects.

The matching pre-rendered Markdown workload deserializes the same source and HTML
from snapshot JSON, including raw-source payload parsing overhead but excluding
network, HTTP client, DOM rendering, and highlighting. A round-trip check verifies
the snapshot preserves the original output.

These benchmarks run on desktop .NET, not WebAssembly; they are not end-to-end
browser latency measurements. To compare an older source snapshot with the same
harness, pass `-p:PortfolioSourceRoot=C:\path\to\snapshot\src`. For historical sources
without the snapshot contract, the harness links the current contract locally so
navigation and renderer baseline comparisons remain runnable.
Run baseline and final sequentially with identical runtime, input, and configuration,
repeating both to assess noise.

## Published browser checks

Generate the snapshots first, then publish and run the Node 24+ / headless Edge harness:

```powershell
dotnet run --project .\src\Srv.Portfolio.ContentGenerator -c Release -- --readmes .\src\Srv.Portfolio\wwwroot
dotnet publish .\src\Srv.Portfolio -c Release -o .\out\performance
node .\tests\performance\browser.mjs .\out\performance\wwwroot
```

For deployment-equivalent comparisons, run the pinned esbuild step from
`.github\workflows\deploy.yml` in a disposable source copy before publishing.
That step overwrites JavaScript; do not run it against working source.

The harness serves the supplied publish directory on loopback, creates an isolated
temporary Edge profile, and cleans up both processes and profile on exit.
Set `EDGE_PATH` if Edge is not installed at its default Windows location.
It verifies root/external rendering, raw toggles, folder expansion/collapse,
end-of-document breadcrumbs, and reopening with one source/snapshot fetch.
It also opens the dynamic plugin collection to check lazy rendering still works.

External GitHub requests and same-origin snapshot requests use a fixed local
200-section fixture, not live network data. Snapshot checks assert no renderer
assemblies load for the external document. Generator tests separately verify
sanitized output. To exercise actual published snapshot files instead of interception,
append `--published-snapshots` and publish snapshots generated from that fixed fixture:
`# Local performance fixture`, 200 `## Section N` headings numbered 0 through 199.

Browser geometry workloads use real DOM positions for 20- and 2,000-heading documents,
alternating start/middle/end positions after warm-up. They report median/p95 batch
timings per lookup, geometry reads, and index construction time, checking results
against the linear reference. Older publishes without an index use the previous
reporting algorithm. These measurements isolate heading lookup, not the full cursor,
Blazor rendering, or interop pipeline.

First-open timing includes browser DOM/interop/render work on loopback, not production
network latency. Local boot resource counts and decoded sizes are diagnostics only:
loopback does not reproduce CDN transfer, compression, or network latency, and the
harness does not minify its input. No timing thresholds are enforced in unit tests.

## Cursor and raw-view interaction benchmark

```powershell
node .\tests\performance\interaction.mjs .\out\performance\wwwroot
```

The harness boots the publish in headless Edge, opens a fixed 200-section README,
and drives spaced and burst `j`/`k` motions in rendered and raw views, raw toggles,
and explorer navigation. It prints one JSON line per workload with CDP task, script,
layout, and recalc-style time, layout counts per key press, and latency median/p95.
The final line reports boot timing, decoded resource sizes, and retained heap after
a forced GC. `--profile` adds a CPU profile summary; `--trace` attributes layout
invalidations. Single-shot workloads such as toggles and startup are noisy, so
interleave baseline and candidate runs and compare medians of at least three runs.
Prefer per-press task and layout figures over latency, which is frame-aligned.

The cursor keeps its box fixed for each animation, covering the current and target
positions, and changes only `clip-path` per frame, which avoids per-frame layout.
Media outlines still size exactly per frame. The raw view renders as a separate
component that skips diffing its lines unless the document changes; the explorer
tree likewise skips renders when its entries and selection are unchanged.

## Deploy-time code highlighting benchmark

```powershell
node .\src\tools\highlight-readme-snapshots.mjs .\src\Srv.Portfolio\wwwroot
node .\tests\performance\interaction.mjs .\out\performance\wwwroot --snapshots [--network]
```

`--snapshots` opens every published snapshot in the explorer, without interception.
For each open it reports when the content rendered, when every `language-*` block
was highlighted or skipped, CDP task and script time, long tasks, whether
`highlight.min.js` was fetched, the snapshot's size, and hashes of the rendered
document and its code blocks. It then toggles raw/rendered five times on the
document with the most code blocks. `--network` gzips responses like GitHub Pages.
After boot it also applies Lighthouse's mobile throttling: 150 ms RTT, 1.6 Mbps
down, 675 kbps up. Compare builds made from the same local snapshot files.

The results below are medians of four interleaved runs per build, on the same
environment as the results that follow. The input was 13 local snapshots with 189
tagged code blocks: 187 were highlighted and 2 PowerShell blocks were skipped. The
code-block hashes matched between builds in every run, so the highlighted DOM is
identical. Baseline and final runs both showed one document-level hash difference,
in non-code content.

| Workload / metric | Client highlighting | Deploy-time highlighting | Absolute change | Change |
| --- | ---: | ---: | ---: | ---: |
| First code README open, throttled, until highlighted | 665.9 ms | 271.6 ms | -394.3 ms | -59.2% |
| First code README open, throttled, CDP task time | 192.6 ms | 96.0 ms | -96.6 ms | -50.2% |
| All 13 opens, throttled, sum until highlighted | 3,751.1 ms | 3,298.2 ms | -452.9 ms | -12.1% |
| Rendered toggle on 34-block README, loopback median | 65.1 ms | 35.8 ms | -29.3 ms | -45.0% |
| `highlight.min.js` requests | 1 | 0 | -1 | -100% |
| Retained JS heap after GC, loopback | 4.83 MB | 3.83 MB | -1.00 MB | -20.8% |
| All 13 snapshot JSON files, gzip bytes | 91,404 B | 105,789 B | +14,385 B | +15.7% |

The first open avoids a second, dependent request for highlight.js (43,287 B
gzipped), as well as its compile and highlighting work. Later opens and rendered
toggles skip the client-side highlighting pass and its `innerHTML` replacement. For
warm opens on loopback, task time differences stayed within noise. The trade-off
is larger snapshots: each document grew by 0.3-2.7 KB transferred, and the total
uncompressed size grew by 21.0%. Even opening all
13 documents transfers less in total than the single highlight.js download.

## Verified README snapshot results

Measured on Windows x64, .NET 10.0.12 / SDK 10.0.401, Node 26.3.0, and headless
Edge 155.0.4283.62. Browser builds were Release-published with the deployment's
esbuild 0.28.2 minification. Values below are medians across three runs.
Native measurements are medians of warmed batch medians; browser first-open uses
one cold external-document open per fresh profile, after application startup.

| Workload / metric | Browser-rendered README | Pre-rendered snapshot | Absolute change | Change |
| --- | ---: | ---: | ---: | ---: |
| Native 200-section Markdown, compute/load median | 11.6584 ms | 0.2620 ms | -11.3964 ms | -97.75% |
| Native allocated bytes per document | 4,756,421 B | 152,158 B | -4,604,263 B | -96.80% |
| Browser 200-section fixture, first-open median | 552.8 ms | 89.1 ms | -463.7 ms | -83.88% |
| Renderer assemblies loaded for external document | 6 | 0 | -6 | -100% |

Native comparison is rendering/sanitization versus JSON deserialization, not a faster
renderer or an end-to-end HTTP measurement. Raw source and rendered HTML round-trip
unchanged. Browser comparison uses the same fixed content and loopback interception;
baseline first-open samples were 517.6-558.2 ms, snapshots 84.6-91.4 ms. Do not
extrapolate these figures into production-network latency guarantees.

The six deferred renderer assets represented 2,785,918 decoded bytes in the baseline
browser run, now absent from external snapshot opens. This is a resource-loading
reduction, not a measured wire-transfer or peak-memory reduction. Opening the dynamic
plugin collection still downloads those assets and renders correctly.

The 13 real GitHub snapshots generated during verification totaled 503,164 JSON
bytes / 86,985 published gzip bytes. These are on-demand files, not startup downloads.
JSON contains both raw Markdown and sanitized HTML; that larger per-document payload
is the trade-off for avoiding browser Markdown parsing and renderer loading.
