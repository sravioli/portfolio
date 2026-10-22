export const leaderNotation = (keys: string, dev: boolean, leaderLabel: string): string =>
  dev ? `<leader>${keys}` : `${leaderLabel} then ${[...keys].join(" ")}`;

export const controlNotation = (key: string, dev: boolean): string =>
  dev ? `<C-${key}>` : `Ctrl+${key}`;
