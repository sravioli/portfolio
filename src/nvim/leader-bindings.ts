export type LeaderAction = "ToggleExplorer" | "PickBreadcrumb" | "CloseDocument" | "OpenFileFinder";

interface LeaderBinding {
  readonly action: LeaderAction;
  readonly desc: string;
  readonly icon: string;
}

interface LeaderGroup {
  readonly group: string;
  readonly keys: LeaderTree;
}

type LeaderTree = Readonly<Record<string, LeaderBinding | LeaderGroup>>;

export const LEADER_TREE = {
  e: { action: "ToggleExplorer", desc: "Toggle the explorer", icon: "\u{f0645}" },
  ";": { action: "PickBreadcrumb", desc: "Dropbar pick", icon: "\u{f0c9}" },
  b: {
    group: "buffer",
    keys: { x: { action: "CloseDocument", desc: "Close the tab", icon: "\u{f0156}" } },
  },
  f: {
    group: "find",
    keys: { f: { action: "OpenFileFinder", desc: "Find READMEs", icon: "\u{f0349}" } },
  },
} as const satisfies LeaderTree;

/** Resolves a completed suffix, without the configurable leader key or Vim notation. */
export function leaderAction(sequence: string): LeaderAction | undefined {
  let tree: LeaderTree = LEADER_TREE;
  for (let index = 0; index < sequence.length; index++) {
    const key = sequence[index];
    if (!Object.hasOwn(tree, key)) return undefined;
    const node = tree[key];
    if ("keys" in node) tree = node.keys;
    else return index === sequence.length - 1 ? node.action : undefined;
  }
  return undefined;
}
