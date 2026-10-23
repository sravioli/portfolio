// which-key.nvim-style popup listing the keys that can follow a pending prefix.
import { LEADER_TREE } from "./leader-bindings.ts";

export { LEADER_TREE };

export const DELAY = 300;

/** @returns {string[]} */
export function leaderMaps(tree = LEADER_TREE, prefix = "") {
  return Object.entries(tree).flatMap(([key, node]) =>
    node.keys ? leaderMaps(node.keys, prefix + key) : [prefix + key],
  );
}

function countMaps(node) {
  return node.keys
    ? Object.values(node.keys).reduce(
        (total, child) => total + countMaps(child),
        0,
      )
    : 1;
}

function compareKeys(left, right) {
  const folded = left.toLowerCase().localeCompare(right.toLowerCase());
  if (folded !== 0) return folded;
  return left === left.toLowerCase() ? -1 : 1;
}

// Leaves before groups, then case-insensitive with lowercase first, like which-key's default sort.
export function entries(sequence, tree = LEADER_TREE) {
  let level = tree;
  for (const key of sequence) {
    level = level[key]?.keys;
    if (!level) return null;
  }
  return Object.entries(level)
    .map(([key, node]) =>
      node.keys
        ? {
            key,
            group: true,
            desc: node.group ? `+${node.group}` : `+${countMaps(node)} keymaps`,
            icon: node.icon ?? "",
          }
        : { key, group: false, desc: node.desc, icon: node.icon ?? "" },
    )
    .sort(
      (left, right) =>
        Number(left.group) - Number(right.group) ||
        compareKeys(left.key, right.key),
    );
}

const KEY_LABELS = { " ": "<Space>", Tab: "<Tab>" };

export function keyLabel(key) {
  return KEY_LABELS[key] ?? key;
}

let panel = null;

export function isOpen() {
  return panel !== null;
}

export function hide() {
  panel?.remove();
  panel = null;
}

// Rows are clickable so the popup also works with the mouse; `onSelect` receives the key.
export function show(
  title,
  items,
  { onSelect = (_key) => {}, onBack = () => {}, onClose = () => {} } = {},
) {
  hide();
  panel = document.createElement("div");
  panel.className = "which-key";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", `Keys after ${title}`);
  const heading = document.createElement("div");
  heading.className = "which-key-title";
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "which-key-grid";
  for (const item of items) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "which-key-item" + (item.group ? " group" : "");
    const key = document.createElement("span");
    key.className = "which-key-key";
    key.textContent = keyLabel(item.key);
    const arrow = document.createElement("span");
    arrow.className = "which-key-arrow";
    arrow.textContent = "\u{279c}";
    const icon = document.createElement("span");
    icon.className = "which-key-icon";
    icon.textContent = item.icon;
    const desc = document.createElement("span");
    desc.className = "which-key-desc";
    desc.textContent = item.desc;
    row.append(key, arrow, icon, desc);
    bindAction(row, () => onSelect(item.key));
    grid.append(row);
  }
  const footer = document.createElement("div");
  footer.className = "which-key-footer";
  footer.append(
    hint("esc", "close", onClose),
    hint("\u{232b}", "back", onBack),
  );
  panel.append(heading, grid, footer);
  panel.addEventListener("click", (event) => event.stopPropagation());
  document.body.append(panel);
  layout(items.length);
  return true;
}

function hint(key, label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "which-key-hint";
  const keyText = document.createElement("span");
  keyText.className = "which-key-hint-key";
  keyText.textContent = key;
  button.append(keyText, ` ${label}`);
  bindAction(button, action);
  return button;
}

function bindAction(button, action) {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
}

// Fill columns top to bottom like which-key, sitting just above the statusline.
function layout(count) {
  const statusline = document.querySelector(".statusline");
  const bottom = statusline
    ? Math.max(0, window.innerHeight - statusline.getBoundingClientRect().top)
    : 0;
  panel.style.setProperty("--which-key-bottom", `${bottom}px`);
  const columns = Math.max(
    1,
    Math.min(count, Math.floor(panel.clientWidth / 300)),
  );
  panel.style.setProperty(
    "--which-key-rows",
    String(Math.max(1, Math.ceil(count / columns))),
  );
}
