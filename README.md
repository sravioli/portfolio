# Simone Fidanza's Portfolio

This repository contains the source for [sravio.li](https://sravio.li), a personal portfolio for browsing my projects in a terminal-inspired interface. Explore the project tree, read project READMEs, search for files, or open repository links on GitHub.

The portfolio is built with **Blazor WebAssembly on .NET 10**. Markdown is rendered in the browser, and the interface supports mouse, touch, and Vim-style keyboard navigation. Press `?` or enter `:help` in the app for the full list of shortcuts.

## Projects

The portfolio currently features:

- [chrono](https://github.com/sravioli/chrono) — zero-dependency benchmarking for Lua
- [nvim](https://github.com/sravioli/nvim) — my Neovim configuration
- [wezterm](https://github.com/sravioli/wezterm) — my WezTerm configuration
- [wezterm-plugins](https://github.com/sravioli/wezterm-plugins) — a collection of small, composable WezTerm plugins

Project README files are loaded from GitHub when opened. The portfolio's root README and plugin collection page are provided by the app.

## Run locally

Install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0), then run:

```sh
dotnet run --project src/Srv.Portfolio
```

The development server prints a local URL when it starts.

## Test

Run the test suite with:

```sh
dotnet test Srv.Portfolio.slnx
```

## Publish

Publish a Release build with:

```sh
dotnet publish src/Srv.Portfolio -c Release -o out
```

The GitHub Actions workflow in `.github/workflows/deploy.yml` publishes the site to GitHub Pages when changes are pushed to `main`, and supports manual runs.

## Repository layout

- `src/Srv.Portfolio` — Blazor WebAssembly app and its client-side assets
- `tests/Srv.Portfolio.Tests` — .NET and JavaScript tests
- `.github/workflows/deploy.yml` — GitHub Pages build and deployment workflow
