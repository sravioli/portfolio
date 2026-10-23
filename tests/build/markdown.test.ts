import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { find, rootEntry, type PortfolioEntry } from "../../src/lib/catalog.ts";
import { renderMarkdown } from "../../src/build/markdown.ts";

const entry = (repository: string): PortfolioEntry => {
  const found = find(repository);
  assert.ok(found, `missing catalog entry ${repository}`);
  return found;
};

describe("renderMarkdown", () => {
  for (const [kind, title] of [
    ["NOTE", "Note"], ["TIP", "Tip"], ["IMPORTANT", "Important"],
    ["WARNING", "Warning"], ["CAUTION", "Caution"],
  ]) {
    test(`renders GitHub ${kind} alerts with a title, icon, and formatted body`, () => {
      const html = renderMarkdown(
        `> [!${kind}]\n>\n> **Keep this.** [Guide](guide.md)\n>\n> - first\n> - second`,
        entry("wezterm"),
      );
      assert.match(html, new RegExp(`class="markdown-alert markdown-alert-${kind.toLowerCase()}"`));
      assert.match(html, /class="markdown-alert-title"/);
      assert.match(html, /<svg class="markdown-alert-icon" viewBox="0 0 16 16" aria-hidden="true">/);
      assert.ok(html.includes(`</svg>${title}</p>`), html);
      assert.match(html, /<strong>Keep this\.<\/strong>/);
      assert.match(html, /href="https:\/\/github.com\/sravioli\/wezterm\/blob\/main\/.github\/guide.md"/);
      assert.match(html, /<li>first<\/li>/);
      assert.match(html, /<li>second<\/li>/);
      assert.doesNotMatch(html, /\[!/);
    });
  }

  test("preserves ordinary blockquotes and literal alert markers outside the first line", () => {
    const html = renderMarkdown("> Ordinary quote\n>\n> [!NOTE]\n\n`[!IMPORTANT]`", rootEntry);
    assert.match(html, /<blockquote>/);
    assert.doesNotMatch(html, /class="markdown-alert/);
    assert.match(html, /\[!NOTE\]/);
    assert.match(html, /<code>\[!IMPORTANT\]<\/code>/);
  });

  test("renders nested alerts and markers followed immediately by formatted content", () => {
    const html = renderMarkdown("> [!NOTE]\n> **Bold**\n>\n> > [!TIP]\n> > A tip", rootEntry);
    assert.match(html, /markdown-alert-note/);
    assert.match(html, /markdown-alert-tip/);
    assert.match(html, /<strong>Bold<\/strong>/);
    assert.match(html, /A tip/);
    assert.doesNotMatch(html, /\[!/);
  });

  test("retains expandable sections, nested Markdown, tables and relative images", () => {
    const html = renderMarkdown([
      "<details open>",
      "<summary><strong>copy-mode</strong></summary>",
      "",
      "| Key | Action |", "| --- | --- |", "| `j` | Move down |",
      "",
      "![Picker](./imgs/showcase-picker-font.png)",
      "",
      "<details><summary>Nested</summary>", "", "**Hidden details**", "", "</details>",
      "</details>",
    ].join("\n"), entry("wezterm"));
    assert.match(html, /<details open>/);
    assert.match(html, /<summary><strong>copy-mode<\/strong><\/summary>/);
    assert.match(html, /<table>/);
    assert.match(html, /<td><code>j<\/code><\/td>/);
    assert.match(html, /<details><summary>Nested<\/summary>/);
    assert.match(html, /<strong>Hidden details<\/strong>/);
    assert.match(html, /src="https:\/\/raw.githubusercontent.com\/sravioli\/wezterm\/main\/.github\/imgs\/showcase-picker-font.png"/);
  });

  test("sanitizes disclosure attributes and content without dropping the section", () => {
    const html = renderMarkdown(
      '<details open ontoggle="alert(1)" name="group"><summary onclick="alert(2)">Safe</summary>' +
      '<script>alert(3)</script><a href="javascript:alert(4)">Bad link</a>' +
      '<img src="./image.png" onerror="alert(5)"><p style="color:red">Body</p></details>',
      rootEntry,
    );
    assert.match(html, /<details open><summary>Safe<\/summary>/);
    assert.match(html, /<p>Body<\/p>/);
    assert.doesNotMatch(html, /ontoggle|onclick|onerror|javascript:|<script|style=|name=/);
  });

  test("renders inert GFM task checkboxes, autolinks and strikethrough", () => {
    const html = renderMarkdown(
      "- [x] Done\n- [ ] Pending\n\n~~Removed~~ https://example.test",
      rootEntry,
    );
    assert.match(html, /class="contains-task-list"/);
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
    assert.equal((html.match(/disabled/g) ?? []).length, 2);
    assert.equal((html.match(/checked/g) ?? []).length, 1);
    assert.match(html, /<del>Removed<\/del>/);
    assert.match(html, /href="https:\/\/example.test\/"/);
  });

  test("untrusted inputs cannot become editable controls or active forms", () => {
    const html = renderMarkdown(
      '<input type="text" value="secret"><input type="file"><input type="submit">' +
      '<input type="checkbox" checked onchange="alert(1)" formaction="https://example.test" name="attack">',
      rootEntry,
    );
    assert.equal((html.match(/<input/g) ?? []).length, 1);
    assert.match(html, /type="checkbox" disabled checked/);
    assert.doesNotMatch(html, /type="text"|type="file"|type="submit"|onchange|formaction|name=/);
  });

  for (const source of [
    '<a href="javascript:alert(1)">unsafe</a>',
    '<a href="jav&#x61;script:alert(1)">unsafe</a>',
    '<img src="data:text/html,unsafe" onerror="alert(1)">',
    '<svg><a href="javascript:alert(1)">unsafe</a></svg>',
    '<math><mtext><img src="x" onerror="alert(1)"></mtext></math>',
  ]) {
    test(`removes executable content from ${source}`, () => {
      const html = renderMarkdown(source, rootEntry).toLowerCase();
      for (const fragment of ["javascript:", "data:text/html", "onerror", "<svg", "<math"])
        assert.ok(!html.includes(fragment), `${fragment} survived: ${html}`);
    });
  }

  test("removes unsafe elements and attributes", () => {
    const html = renderMarkdown(
      [
        "# Safe",
        "",
        '<script>alert(1)</script><iframe src="https://example.test"></iframe>',
        '<style>.bad{}</style><form name="bad"><video><source src="https://example.test"></video><audio></audio></form>',
        '<p style="color:red" onclick="alert(1)">Text</p>',
      ].join("\n"),
      rootEntry,
    );
    const lower = html.toLowerCase();
    for (const fragment of ["<script", "<iframe", "<style", "<form", "<video", "<audio", "<source", "style=", "onclick="])
      assert.ok(!lower.includes(fragment), `${fragment} survived`);
    assert.match(html, /id="readme-safe"/);
  });

  test("wraps code blocks with textless wrap and copy buttons", () => {
    const html = renderMarkdown("```lua\nlocal x = 1\n```", rootEntry);
    assert.ok(
      html.startsWith('<div class="code-block"><button type="button" class="code-wrap-toggle"'),
      html,
    );
    assert.match(
      html,
      /title="Toggle line wrap"><\/button><button type="button" class="code-copy" aria-label="Copy code" title="Copy code"><\/button><pre>/,
    );
  });

  test("highlights code blocks at build time", () => {
    const html = renderMarkdown("```lua\nlocal x = 1\n```", rootEntry);
    assert.match(html, /class="hljs-keyword"/);
  });

  test("highlights Lua function calls", () => {
    const html = renderMarkdown('```lua\nlocal t = warden.tuple {\n  warden.integer():not_empty(),\n}\n```', rootEntry);
    for (const name of ["tuple", "integer", "not_empty"]) {
      assert.match(html, new RegExp(`<span class="hljs-title function_">${name}</span>`));
    }
  });

  test("does not retain heading state between documents", () => {
    renderMarkdown("## Same\n\n## Same", rootEntry);
    const html = renderMarkdown("## Same\n\n[Link](#same)", rootEntry);
    assert.match(html, /id="readme-same"/);
    assert.match(html, /href="#readme-same"/);
    assert.doesNotMatch(html, /readme-same-1/);
  });

  test("disambiguates duplicate heading slugs", () => {
    const html = renderMarkdown("## Intro\n\n## Intro\n\n[First](#intro)", rootEntry);
    assert.match(html, /id="readme-intro"/);
    assert.match(html, /id="readme-intro-1"/);
    assert.match(html, /href="#readme-intro"/);
  });

  test("marks links to missing headings", () => {
    const html = renderMarkdown("[Missing](#no-such-heading)", rootEntry);
    assert.match(html, /data-missing-anchor="no-such-heading"/);
    assert.doesNotMatch(html, /href="#no-such-heading"/);
  });

  const attachment = "https://github.com/user-attachments/assets/d8bd96f1-53d6-4fb0-9771-53ca8ecd604b";

  test("embeds standalone GitHub attachments as controlled videos", () => {
    const html = renderMarkdown(`<${attachment}>`, entry("wezterm"));
    assert.ok(html.includes(`<video src="${attachment}"`), html);
    assert.match(html, /controls/);
    assert.match(html, /playsinline/);
    assert.match(html, /preload="none"/);
    assert.ok(html.includes(`href="${attachment}">Open video on GitHub</a>`), html);
    assert.doesNotMatch(html, /autoplay/);
  });

  for (const markdown of [
    `[Download](${attachment})`,
    `See <${attachment}> for details.`,
    `<${attachment.replace("github.com", "github.com.example.test")}>`,
    `<${attachment.replace("https:", "http:")}>`,
    "<https://github.com/user-attachments/assets/not-an-attachment>",
    `![Screenshot](${attachment})`,
  ]) {
    test(`does not embed video for ${markdown}`, () => {
      assert.doesNotMatch(renderMarkdown(markdown, rootEntry), /<video/i);
    });
  }

  test("rewrites relative resources and repository links", () => {
    const html = renderMarkdown(
      [
        "[relative](guide.md)",
        "",
        "![diagram](http://example.test/image.png)",
        "",
        "[project](https://github.com/sravioli/chrono/blob/main/.github/readme.md)",
      ].join("\n"),
      entry("chrono"),
    );
    assert.ok(html.includes("https://github.com/sravioli/chrono/blob/main/.github/guide.md"), html);
    assert.ok(html.includes("https://example.test/image.png"), html);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /referrerpolicy="no-referrer"/);
    assert.match(html, /data-internal-repo="chrono"/);
    assert.match(html, /title="Open chrono here"/);
  });

  test("includes the main branch for relative images in .github", () => {
    const html = renderMarkdown("![Help mode](./imgs/showcase-mode-help.png)", entry("wezterm"));
    assert.ok(
      html.includes(
        'src="https://raw.githubusercontent.com/sravioli/wezterm/main/.github/imgs/showcase-mode-help.png"',
      ),
      html,
    );
  });

  for (const [repository, resource, expected] of [
    ["", "docs/guide.md", "docs/guide.md"],
    ["nvim", "guide.md", "guide.md"],
    ["chrono", "../docs/guide%20one.md", "docs/guide%20one.md"],
    ["chrono", "../docs/bad%E0%A4.md", "docs/bad%25E0%25A4.md"],
    ["chrono", "../../guide.md", "guide.md"],
    ["chrono", "/docs/./guide.md", "docs/guide.md"],
    ["nap.wz", "./images/demo.png", "images/demo.png"],
  ] as const) {
    test(`normalizes ${resource} in ${repository || "root"}`, () => {
      const html = renderMarkdown(`[Document](${resource})\n\n![Image](${resource})`, entry(repository));
      const owner = repository || "sravioli";
      assert.ok(html.includes(`href="https://github.com/sravioli/${owner}/blob/main/${expected}"`), html);
      assert.ok(html.includes(`src="https://raw.githubusercontent.com/sravioli/${owner}/main/${expected}"`), html);
    });
  }

  test("preserves absolute external resources", () => {
    const html = renderMarkdown(
      "[Document](https://example.test/docs/guide.md)\n\n![Image](https://example.test/images/demo.png)",
      entry("chrono"),
    );
    assert.match(html, /href="https:\/\/example\.test\/docs\/guide\.md"/);
    assert.match(html, /src="https:\/\/example\.test\/images\/demo\.png"/);
    assert.doesNotMatch(html, /data-internal-repo/);
  });

  for (const url of [
    "https://github.com/sravioli/chrono",
    "https://github.com/sravioli/chrono/",
    "https://github.com/sravioli/chrono.git",
    "https://github.com/sravioli/chrono/tree/main",
    "https://github.com/sravioli/chrono/blob/main/README.md",
    "https://github.com/sravioli/chrono/blob/main/.github/readme.md",
    "https://GITHUB.COM/SRAVIOLI/chrono.git/TREE/MAIN",
  ]) {
    test(`keeps internal navigation for ${url}`, () => {
      const html = renderMarkdown(`[Project](${url})`, rootEntry);
      assert.match(html, /data-internal-repo="chrono"/);
      assert.match(html, /title="Open chrono here"/);
    });
  }

  for (const url of [
    "https://github.com/sravioli/chrono/issues",
    "https://github.com/sravioli/chrono/tree/develop",
    "https://github.com/sravioli/chrono/blob/main/docs/README.md",
    "https://github.com/sravioli/chrono/blob/main/guide.md",
    "https://github.com/sravioli/unknown",
    "https://github.com/another-owner/chrono",
    "https://github.com.example.test/sravioli/chrono",
  ]) {
    test(`keeps external navigation for ${url}`, () => {
      const html = renderMarkdown(`[Project](${url})`, rootEntry);
      assert.ok(html.includes(`href="${url}"`), html);
      assert.doesNotMatch(html, /data-internal-repo/);
    });
  }

  test("local documents link to catalog pages and site images", () => {
    const html = renderMarkdown(
      "[chord](wezterm-plugins/chord.wz/) [chrono](/chrono/) [elsewhere](missing/) ![shot](/screenshots/nvim.webp)",
      find("featured.md")!,
    );
    assert.match(html, /href="\/wezterm-plugins\/chord\.wz\/"/);
    assert.match(html, /href="\/chrono\/"/);
    assert.doesNotMatch(html, /href="\/missing\/"/);
    assert.match(html, /src="\/screenshots\/nvim\.webp"/);
  });
});
