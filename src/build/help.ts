import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { buildHelp, type HelpBundle } from "../lib/help.ts";

const HELP_DIRECTORY = path.join(process.cwd(), "src", "help");

let bundle: Promise<HelpBundle> | null = null;

/** Reads `src/help/*.txt` once per build; fails the build on duplicate tags or broken links. */
export function loadHelp(): Promise<HelpBundle> {
  bundle ??= (async () => {
    const files = (await readdir(HELP_DIRECTORY)).filter((file) => file.endsWith(".txt")).sort();
    const sources = await Promise.all(
      files.map(async (file) => ({
        name: file.slice(0, -".txt".length),
        source: await readFile(path.join(HELP_DIRECTORY, file), "utf8"),
      })),
    );
    return buildHelp(sources);
  })();
  return bundle;
}
