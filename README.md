# 💼 My portfolio

This repository contains the source for my personal portfolio for browsing my projects in a terminal-inspired interface. Explore the project tree, read project READMEs, search for files, or open repository links on GitHub.

The portfolio is built with **Blazor WebAssembly on .NET 10**. Markdown is rendered in the browser, and the interface supports mouse, touch, and Vim-style keyboard navigation. Press `?` or enter `:help` in the app for the full list of shortcuts.

README rendering sanitizes the parsed HTML in place and caches the resulting HTML for each repository and README path during the browser session. Changed Markdown replaces the cached result; the original source remains available for raw view and copying.
