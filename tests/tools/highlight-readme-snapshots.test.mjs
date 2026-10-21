import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  decodeText,
  highlightSnapshotHtml,
  highlightSnapshots,
  loadHighlighter,
  serializeSnapshot,
} from "../../src/tools/highlight-readme-snapshots.mjs";

const hljs = await loadHighlighter();
const block = (className, body) => `<div class="code-block"><pre><code class="${className}">${body}</code></pre></div>`;

test("decodes the entities AngleSharp emits and rejects markup the browser could parse differently", () => {
  assert.equal(decodeText("a &amp;&amp; b &lt;x&gt;&nbsp;&#39;&#x41;&quot;\r\nz"), "a && b <x>\u00a0'A\"\nz");
  assert.equal(decodeText("&copy;"), undefined);
  assert.equal(decodeText("a & b"), undefined);
  assert.equal(decodeText("&#0;"), undefined);
});

test("matches the browser's highlightElement output, including alias classes", () => {
  const source = 'echo "$HOME" && ls <dir>';
  const html = block("language-sh", "echo &quot;$HOME&quot; &amp;&amp; ls &lt;dir&gt;");
  const result = highlightSnapshotHtml(html, hljs);
  const expected = hljs.highlight(source, { language: "sh", ignoreIllegals: true }).value;
  assert.equal(result.highlighted, 1);
  assert.equal(
    result.html,
    `<div class="code-block"><pre><code class="language-sh hljs language-bash" data-highlighted="yes">${expected}</code></pre></div>`,
  );
  assert.match(expected, /hljs-/);
});

test("marks languages the bundled build lacks so the client skips loading the highlighter", () => {
  const html = block("language-powershell", "Get-Item &amp; Out-Null");
  const result = highlightSnapshotHtml(html, hljs);
  assert.deepEqual([result.highlighted, result.skipped], [0, 1]);
  assert.equal(result.html, html.replace('"language-powershell">', '"language-powershell" data-highlight-skip="">'));
});

test("leaves untagged blocks and undecodable blocks for the client", () => {
  const html = `<pre><code>plain</code></pre>${block("language-lua", "x = &copy;")}${block("language-lua", "<b>x</b>")}`;
  assert.deepEqual(highlightSnapshotHtml(html, hljs), { html, highlighted: 0, skipped: 0 });
});

test("is idempotent", () => {
  const once = highlightSnapshotHtml(block("language-lua", "local x = 1") + block("language-powershell", "ls"), hljs);
  assert.deepEqual(highlightSnapshotHtml(once.html, hljs), { html: once.html, highlighted: 0, skipped: 0 });
});

test("serializes snapshots with System.Text.Json's default escaping", () => {
  assert.equal(
    serializeSnapshot({ Repository: "r", Html: "<a href=\"x\">&'+`é\\\n\t</a>" }),
    '{"Repository":"r","Html":"\\u003Ca href=\\u0022x\\u0022\\u003E\\u0026\\u0027\\u002B\\u0060\\u00E9\\\\\\n\\t\\u003C/a\\u003E"}',
  );
});

test("rewrites only the Html of snapshots that contain highlightable code", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "highlight-snapshots-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "readmes", "code"), { recursive: true });
  await mkdir(join(root, "readmes", "prose"), { recursive: true });
  const code = { Repository: "code", ReadmePath: "README.md", Source: "```lua\nlocal x = 1\n```", Html: block("language-lua", "local x = 1") };
  const prose = '{"Repository":"prose","ReadmePath":"README.md","Source":"text","Html":"\\u003Cp\\u003Etext\\u003C/p\\u003E"}';
  await writeFile(join(root, "readmes", "code", "a.json"), serializeSnapshot(code));
  await writeFile(join(root, "readmes", "prose", "b.json"), prose);

  assert.deepEqual(await highlightSnapshots(root, hljs), { files: 2, highlighted: 1, skipped: 0 });

  const written = JSON.parse(await readFile(join(root, "readmes", "code", "a.json"), "utf8"));
  assert.deepEqual(Object.keys(written), ["Repository", "ReadmePath", "Source", "Html"]);
  assert.equal(written.Source, code.Source);
  assert.match(written.Html, /^<div class="code-block"><pre><code class="language-lua hljs" data-highlighted="yes"><span class="hljs-keyword">local<\/span>/);
  assert.equal(await readFile(join(root, "readmes", "prose", "b.json"), "utf8"), prose);
});
