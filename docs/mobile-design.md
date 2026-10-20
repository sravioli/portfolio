# Mobile and touch design

The desktop site is a keyboard-first Neovim imitation. On phones the keyboard
metaphor does not work, so the mobile experience keeps the Neovim *look* while
making every action reachable by touch. The keymap remains functional on mobile
as an unadvertised easter egg, but nothing depends on it.

## Switching rules

Layout and input style switch independently:

- **Width decides the layout.** Narrow viewports (for example `max-width: 700px`)
  use the single-pane layout; wider viewports keep the desktop split.
- **Pointer decides the controls.** `pointer: coarse` enables touch controls
  (floating action button, bottom sheets, touch-first hints) regardless of width.

| Device                   | Layout      | Controls        |
| ------------------------ | ----------- | --------------- |
| Phone, portrait          | Single pane | Touch           |
| Phone, landscape         | By width    | Touch           |
| Tablet, portrait         | Split       | Touch           |
| Tablet with mouse/keys   | Split       | Desktop         |
| Desktop                  | Split       | Desktop         |

## File explorer toggle

The tree becomes toggleable on every device.

### Desktop

- Open by default; the user's choice is persisted via `BrowserStorage`.
- `<leader>e` opens and focuses the tree; pressed again while the tree is
  focused, it closes it. `<C-h>` focuses the tree, opening it first when hidden.
  `:NvimTreeToggle`, `:NvimTreeOpen`, and `:NvimTreeClose` are also available.
- Explorer motions (`j`/`k`/`gg`/`G`) reopen a hidden tree.
- The tabline "File Explorer" label becomes a clickable toggle with a tree icon.
- When hidden, the preview takes the full width; the existing `88ch` cap keeps
  lines readable.

### Narrow layout

- The tree is a left drawer overlaying the preview with a dimmed backdrop.
- Always closed at start; the state is not persisted.
- Opened from the tabline tree icon or the "Files" action in the action sheet.
- Closed by tapping the backdrop, the browser back button/gesture, or opening a
  file.
- No edge-swipe to open: it conflicts with the iOS/Android back gestures.
- A "Find file" bar at the top of the drawer opens the full-screen finder.

## Narrow layout

- One pane at a time. The welcome screen or the open README is the home view;
  the tree is summoned via the drawer.
- Opening the drawer, the finder, or a sheet pushes a history entry
  (`history.pushState`) so back closes it instead of leaving the site.
- **Tabline:** tree icon, document title, actions. The close button and
  "File Explorer" label are hidden.
- **Breadcrumbs:** collapse to the last segment; tapping it opens the picker.
- **Headings:** the current heading sits in a sticky bar under the tabline;
  tapping it opens the outline sheet.
- **Statusline:** shortened but still powerline-styled:
  - mode as `N` / `C` instead of `NORMAL` / `COMMAND`;
  - path as `~` (or a home icon) instead of `/home/sravioli/...`;
  - file name and scroll percentage;
  - byte size, encoding, file format, and branch are dropped.

## Touch controls

- **Floating action button** opens a which-key-style bottom sheet with large
  targets. Entries are contextual:
  - explorer/welcome: Files, Find file, README, GitHub, Help;
  - reading: Files, Find file, Outline, Rendered/raw, Open on GitHub, Close.
- **Finder:** full screen, input focused on open, results kept above the soft
  keyboard (`visualViewport`), no preview pane.
- **Outline:** headings listed in a bottom sheet; tapping one scrolls to it.
- **Help:** touch-first content; keyboard bindings live in a collapsed
  section. The mode follows the last input used, not the screen width: a touch
  `pointerdown` switches to touch, a key pressed outside a text field switches
  back (soft keyboards only type into fields). Keyboard users get the bindings
  expanded.
- **Code blocks:** a wrap toggle on every block, remembered across visits.
- **Welcome screen:** touch wording that points at what is on screen (the
  explorer, search and `?` icons and where they sit); every line is tappable.
- **Fake cursor** (`nvim-cursor`) is hidden; `~` end-of-buffer markers stay.
- Touch targets are at least 44px.

## Short viewports

On touch devices with `max-height: 500px` (landscape phones), the message line
and command line are hidden unless command mode is active. The layout itself
still follows the width rule.

## Implementation status

- Done: explorer toggle (desktop and drawer), narrow layout, compact
  statusline, touch welcome screen, short viewports, touch-first help, code
  wrap toggle.
- Pending: floating action button and sheet, full-screen finder, outline sheet,
  collapsed breadcrumbs, sticky heading bar, hiding the fake cursor on touch.

## Out of scope

- Swipe gestures (they conflict with horizontal scrolling in code blocks and
  with system back gestures).
- An on-screen keyboard for Vim keys.
