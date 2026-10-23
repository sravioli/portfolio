import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { find, rootEntry } from "../../src/lib/catalog.ts";
import { NO_README_SOURCE, ROOT_README_SOURCE, readmeSource } from "../../src/build/readmes.ts";

describe("readmeSource", () => {
  let fixtures: string;
  const environment = { dir: process.env.PORTFOLIO_README_DIR, token: process.env.GITHUB_TOKEN };

  before(async () => {
    fixtures = await mkdtemp(path.join(tmpdir(), "portfolio-readmes-"));
    await writeFile(path.join(fixtures, "chrono.md"), "\uFEFF# chrono\n");
    process.env.PORTFOLIO_README_DIR = fixtures;
    delete process.env.GITHUB_TOKEN;
  });

  after(async () => {
    for (const [name, value] of [
      ["PORTFOLIO_README_DIR", environment.dir],
      ["GITHUB_TOKEN", environment.token],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(fixtures, { recursive: true, force: true });
  });

  test("root uses the local introduction", async () => {
    assert.equal(await readmeSource(rootEntry), ROOT_README_SOURCE);
  });

  test("local documents are read from src/documents", async () => {
    assert.match(await readmeSource(find("nvim")!), /^# nvim\r?\n/);
    assert.match(await readmeSource(find("featured.md")!), /^# Featured\r?\n/);
    assert.notEqual(await readmeSource(find("nvim")!), NO_README_SOURCE);
  });

  test("published READMEs are read from fixtures without a BOM", async () => {
    assert.equal(await readmeSource(find("chrono")!), "# chrono\n");
  });

  test("missing published READMEs fail the build", async () => {
    await assert.rejects(readmeSource(find("wezterm")!));
  });

  test("plugin index lists every plugin with its catalog description offline", async () => {
    const source = await readmeSource(find("wezterm-plugins")!);
    assert.match(source, /^# WezTerm plugins\n/);
    for (const plugin of find("wezterm-plugins")!.children)
      assert.ok(
        source.includes(`- [${plugin.name}](https://github.com/sravioli/${plugin.repository}) — ${plugin.description}`),
        plugin.name,
      );
  });
});
