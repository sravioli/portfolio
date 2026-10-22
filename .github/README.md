# 💼 My portfolio

This repository contains the source for my personal portfolio for browsing my projects in a terminal-inspired interface. Explore the project tree, read project READMEs, search for files, or open repository links on GitHub.

The portfolio is a static site built with **Astro** and a small vanilla TypeScript client. Project READMEs are fetched and rendered at build time, so every page arrives as plain HTML and each README has its own URL. The interface supports mouse, touch, and Vim-style keyboard navigation. Press `?` or enter `:help` in the app for the full list of shortcuts.

Click a Markdown file once in the explorer or file search to open its preview. Click a folder to expand or collapse it.

Use the **sun / moon icon** in the top bar to switch between Kanagawa Wave
(dark, the default) and Lotus (light). The choice is saved in your browser and
restored before the next page paints. UI and syntax colors use the
[upstream Kanagawa palette](https://github.com/rebelot/kanagawa.nvim);
embedded README images and badges keep their own colors.

Click an image in a README, or press Enter with the preview cursor on it, to enlarge it. Images linking to another page (such as badges) follow their link instead. Click the enlarged image or press Escape, q, or Enter to close it.

On mobile, file search shows results above the bottom search bar without a README
preview. The dialog is capped at 560px and shrinks to fit the visible viewport
above the software keyboard.
On desktop, the preview remains beside the results.

Welcome hints distinguish `gx` (open the link under the cursor) from `j` / `k`
(browse projects while the file tree is focused). Click the browsing hint to focus
the tree.

Unknown URLs use the custom terminal-style 404 page. The former `/not-found/`
URL remains available. The built `dist/404.html` must be served as the 404 document
by the static host, as GitHub Pages and `astro preview` do.
Routes accept URLs with or without a trailing slash so missing slashless paths
also reach the custom 404 instead of Astro's trailing-slash error page.
