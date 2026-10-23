# nvim

My Neovim configuration, which is the editor this portfolio imitates. It is written in Lua, managed with
[lazy.nvim](https://github.com/folke/lazy.nvim), and themed with
[kanagawa](https://github.com/rebelot/kanagawa.nvim).

**Source:** [github.com/sravioli/nvim](https://github.com/sravioli/nvim)

![Neovim editing lua/srv/lazy.lua with the kanagawa theme, a winbar breadcrumb, and a heirline statusline](/screenshots/nvim.webp)

## Notable choices

### Lazy by default, with a lean runtime

`lazy.nvim` runs with `defaults = { lazy = true }`, so every plugin must declare the event,
filetype, command, or key that loads it. A shared `LazyFile` event (`BufReadPost`, `BufNewFile`,
`BufWritePre`) keeps file-related plugins off the startup path. The config also disables 28
built-in runtime plugins it never uses, including netrw, the archive readers, `tohtml`, and `tutor`.

### Language servers resolve by convention

Servers are looked up through a small metatable. Requesting `servers.lua_ls` loads
`lua/srv/plugins/lsp/servers/lua_ls.lua` when it exists and falls back to a shared default otherwise:

```lua
setmetatable(M, {
  __index = function(t, k)
    local ok, mod = pcall(require, "srv.plugins.lsp.servers." .. k)
    if not ok then
      mod = require "srv.plugins.lsp.servers.default"
    end
    t[k] = mod
    return t[k]
  end,
})
```

Adding a server is one list entry, and it only needs its own file when it needs settings. The
configured servers cover Lua, Bash, JSON, YAML, TOML, LaTeX, Markdown, and prose (`harper_ls`).

### One config, two hosts

Most plugin specs carry `cond = not vim.g.vscode`. The same repository can therefore run inside the
VS Code Neovim extension, where those plugins stay off, without forking the config.

### Shared preferences and formatter fallbacks

`lua/srv/preferences.lua` holds the border style, icon sets, and spinners, so floating windows,
completion, and LSP progress look consistent. Formatter configs are looked up in the current file's
directory, then the project root, then the working directory, and finally `skel/`. That folder holds
default `.stylua.toml`, `.clang-format`, `.taplo.toml`, `.prettierrc.json`, and similar files, so
projects without their own config still format the same way.

### Small extras

- A custom `pseudo` filetype for pseudocode, with its own `ftdetect/`, `syntax/`, and snippets.
- LuaSnip snippets for C, LaTeX, Markdown, Lua, and TOML.
- Testing and debugging through `neotest` and `nvim-dap`, plus `rustaceanvim` for Rust.
- Releases are versioned with [cocogitto](https://github.com/cocogitto/cocogitto). Conventional
  Commits generate `CHANGELOG.md`, and pushing a tag creates the GitHub release.

## Layout

```text
init.lua              settings, plugins, autocommands, keymaps (in that order)
lua/srv/config/       options, autocommands, Neovide tweaks
lua/srv/plugins/      lazy.nvim specs grouped by area (lsp, completion, git, ui, ...)
lua/srv/keymaps/      keymaps grouped by plugin
lua/srv/utils/        helpers: statusline, completion, file search, keymap wrapper
skel/                 fallback formatter and linter configs
snippets/             LuaSnip snippets per filetype
```
