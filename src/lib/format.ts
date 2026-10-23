import { getPath, type PortfolioEntry } from "./catalog.ts";

export interface SplitPath {
  readonly head: string;
  readonly tail: string;
}

export interface StatusPaths {
  readonly full: SplitPath;
  readonly short: SplitPath;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  const units = ["k", "M", "G"];
  let size = bytes;
  let unit = -1;
  do {
    size /= 1024;
    unit++;
  } while (size >= 1024 && unit < units.length - 1);
  return `${Number(size.toPrecision(2))}${units[unit]}b`;
}

export const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

export function countLines(source: string): number {
  let lines = 1;
  for (let index = source.indexOf("\n"); index !== -1; index = source.indexOf("\n", index + 1))
    lines++;
  return lines;
}

export const splitRawLines = (source: string): string[] =>
  source.replaceAll("\r\n", "\n").split("\n");

export function copiedLineCount(source: string): number {
  return source.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n").length;
}

export const pad = (value: number, width: number): string => String(value).padStart(width, "0");

export function scrollThumbStyle(fraction: number): string {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return `--scroll: ${Number(clamped.toFixed(3))}`;
}

export function scrollFraction(position: string): number {
  if (position === "Bot") return 1;
  const match = /^(-?\d+)%$/.exec(position);
  return match ? Math.min(Math.max(Number(match[1]) / 100, 0), 1) : 0;
}

// The head is what gets ellipsized, so the current folder name always stays visible.
// Abbreviated paths keep one letter per parent folder, like fish's prompt_pwd.
export function splitPath(root: string, segments: readonly string[], abbreviate = false): SplitPath {
  const path = [root, ...segments];
  if (path.length === 1) return { head: "", tail: root };
  const parents = path
    .slice(0, -1)
    .map((segment, index) => (abbreviate && index > 0 ? segment.slice(0, 1) : segment));
  return { head: `${parents.join("/")}/`, tail: path[path.length - 1] };
}

export function statusPaths(folder: PortfolioEntry): StatusPaths {
  const path = getPath(folder);
  return {
    full: splitPath("~", path.slice(1)),
    short: splitPath("~", path.slice(1), true),
  };
}
