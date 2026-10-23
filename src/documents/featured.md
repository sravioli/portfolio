# Featured

Three projects worth a closer look. For each one: the problem, where to see
it, what I did, and one technical decision I would make again. All three are
solo projects, so "my contribution" means design, implementation, tests, and
release tooling.

## This portfolio: Blazor WebAssembly to Astro

**Problem.** The first version was a Blazor WebAssembly app. It looked right,
but a visitor on a phone waited for the .NET runtime to download and boot
before seeing any text, and projects had no URLs of their own: everything was
in-app state behind a single `/` route.

**Demonstration.** You are reading it. Every project now has its own page,
such as [chrono](chrono/) or [chord.wz](wezterm-plugins/chord.wz/), and the
[source is on GitHub](https://github.com/sravioli/portfolio).

**My contribution.** I rewrote the site as static Astro pages while keeping
the Neovim-style interface: the file tree, Vim motions, the finder, and the
command line. READMEs are fetched, sanitized, and highlighted at build time,
and a small TypeScript client adds the interactive layer on top of
server-rendered HTML.

**Technical decision.** Render content first and treat interactivity as an
enhancement. Each page ships its README as plain HTML; the client only takes
over navigation once it has loaded, and explorer entries are real links, so
pages still work without JavaScript and can be opened in a new tab.

### Trade-offs

- **Gained:** fast first paint, shareable URLs, browser history, working links
  without JavaScript, and a much simpler CI (Node and Python instead of the
  .NET SDK plus the `wasm-tools` workload).
- **Gave up:** a single C# codebase. Logic that was shared C# (navigation
  state, keymaps, fuzzy search) had to be ported to TypeScript, together with
  its tests.
- **Changed:** content is fixed at build time. Published READMEs refresh when
  the site is rebuilt rather than on every visit.

### Measurements

Lab comparison of the last Blazor commit (`c82601f`) and the first Astro
release with font subsetting (`cc392e2`), both built with their own deploy
workflows and served by the same local gzip server with caching disabled.
Lighthouse 13.5 on Chrome 155, median of three runs, home page:

| Metric (mobile) | Blazor | Astro |
| --- | ---: | ---: |
| Performance score | 37 | 100 |
| Largest Contentful Paint | 17.1 s | 1.4 s |
| Total Blocking Time | 1,783 ms | 40 ms |
| Transferred | 2.51 MB | 88.6 KB |
| Requests | 64 | 5 |

| Metric (desktop) | Blazor | Astro |
| --- | ---: | ---: |
| Performance score | 66 | 100 |
| Largest Contentful Paint | 3.1 s | 0.35 s |
| Total Blocking Time | 355 ms | 0 ms |

With packet-level throttling (150 ms latency, about 1.6 Mbps, CPU ×4), the
welcome screen appeared after a median of 16.7 s with Blazor and 1.3 s with
Astro (five runs each). Build steps went from about two minutes, 93 seconds of
it in `dotnet publish`, to about 18 seconds for `npm run build`.

> [!NOTE]
> These are lab numbers from one loopback machine, not field data. They do not
> include GitHub Pages' CDN, Brotli, HTTP/2, or repeat visits. Blazor's
> pre-boot "loading…" text does not count as content: its LCP is the rendered
> app. Blazor had no project URLs, so only the home page is comparable.

## chrono

**Problem.** Lua 5.1 and LuaJIT have no standard benchmarking tool, and
`os.clock` measures CPU time, which hides I/O and sleeps and has coarse
resolution on some platforms.

**Demonstration.** [chrono](chrono/) and its
[repository](https://github.com/sravioli/chrono).

**My contribution.** A zero-dependency benchmarking engine: warm-up
iterations, mean, median, standard deviation, p95 and p99, text, pretty and
JSON reports, a CLI, out-of-process runs for isolation, and optional JIT trace
statistics on LuaJIT.

**Technical decision.** Two timers, selectable per run: wall-clock time,
read at high resolution through the FFI on LuaJIT or through the optional
`chrono-clock` C module, and CPU time through `os.clock`. The core stays pure
Lua with nothing to compile, and precise wall-clock timing is opt-in where
the runtime allows it.

## chord.wz

**Problem.** WezTerm key bindings are verbose tables, and the information a
user needs to discover them (hints, a command list, help) usually lives
somewhere else and drifts out of date.

**Demonstration.** [chord.wz](wezterm-plugins/chord.wz/) and its
[repository](https://github.com/sravioli/chord.wz). It is listed in
[awesome-wezterm](https://github.com/michaelbrusegard/awesome-wezterm).

**My contribution.** Vim-style notation such as `<C-S-v>` and `<leader>p`,
modal key tables with labels and colours, paginated hint bars, a searchable
command picker, a help overlay, user overrides, and conflict diagnostics.

**Technical decision.** Keep mode metadata next to the mappings. The same
definitions generate the bindings, the hint bar, the command picker, and the
help overlay, so documentation cannot drift from behaviour. Optional
dependencies degrade gracefully: without
[ribbon.wz](wezterm-plugins/ribbon.wz/), labels fall back to
`wezterm.format`, and without [log.wz](wezterm-plugins/log.wz/), logging
falls back to WezTerm's own functions.
