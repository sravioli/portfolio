import { allEntries, getReadmePath, type PortfolioEntry } from "./catalog.ts";

export interface FileSearchResult {
  readonly entry: PortfolioEntry;
  readonly path: string;
  readonly matches: readonly number[];
}

const searchEntries = allEntries().map((entry) => ({ entry, path: getReadmePath(entry) }));

export const totalCount = searchEntries.length;

const compareIgnoreCase = (left: string, right: string): number => {
  const a = left.toUpperCase();
  const b = right.toUpperCase();
  return a < b ? -1 : a > b ? 1 : 0;
};

export function search(query: string): FileSearchResult[] {
  const pattern = [...query].filter((character) => !/\s/u.test(character));
  const results: { result: FileSearchResult; score: number }[] = [];
  for (const { entry, path } of searchEntries) {
    const lowerPath = path.toLowerCase();
    const matches: number[] = [];
    let cursor = 0;
    for (const character of pattern) {
      const index = lowerPath.indexOf(character.toLowerCase(), cursor);
      if (index < 0) break;
      matches.push(index);
      cursor = index + 1;
    }
    if (matches.length !== pattern.length) continue;
    const gaps = matches.length < 2 ? 0 : matches.at(-1)! - matches[0] + 1 - matches.length;
    const score = gaps * 10 + (matches.length === 0 ? 0 : matches[0]);
    results.push({ result: { entry, path, matches }, score });
  }
  return results
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.result.path.length - right.result.path.length ||
        compareIgnoreCase(left.result.path, right.result.path),
    )
    .map(({ result }) => result);
}
