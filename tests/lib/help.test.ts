import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { buildHelp, helpPageOf, parseHelp, renderHelp, renderHelpInline, resolveHelpTag } from "../../src/lib/help.ts";
import { loadHelp } from "../../src/build/help.ts";

const source = [
  "*demo.txt*  Demo help",
  "",
  "==============================================================================",
  "COPYING                                            *demo-copy*",
  "",
  "Copy the link with |yy|. Paths look like `~/x`, keys like CTRL-] or <Esc>.",
  "Arguments look like {topic}.",
  "",
  "yy                     Copy the link.                       *yy*",
  "<leader>y              Copy the path.",
  "                       Works everywhere.                    *leader-y*",
  "",
  "Copy failed                                         *demo-error*",
  "    The browser denied access.",
  "",
  "                                                    *demo-extra*",
  "Example: >",
  "    :h demo",
  "<",
  "Done.",
].join("\n");

describe("parseHelp", () => {
  test("reads the title, blocks, tags, and links", () => {
    const document = parseHelp("demo", source);

    assert.equal(document.fileTag, "demo.txt");
    assert.equal(document.title, "Demo help");
    assert.deepEqual(
      document.blocks.map((block) => block.kind),
      ["rule", "heading", "paragraph", "keys", "item", "tags", "paragraph", "example", "paragraph"],
    );
    assert.deepEqual(document.tags, ["demo.txt", "demo-copy", "yy", "leader-y", "demo-error", "demo-extra"]);
    assert.deepEqual(document.links, ["yy"]);
  });

  test("joins indented key row continuations and keeps their tags", () => {
    const keys = parseHelp("demo", source).blocks.find((block) => block.kind === "keys");

    assert.deepEqual(keys, {
      kind: "keys",
      rows: [
        { key: "yy", text: "Copy the link.", tags: ["yy"] },
        { key: "<leader>y", text: "Copy the path. Works everywhere.", tags: ["leader-y"] },
      ],
    });
  });

  test("dedents examples and stops them at the closing marker", () => {
    const example = parseHelp("demo", source).blocks.find((block) => block.kind === "example");

    assert.deepEqual(example, { kind: "example", lines: [":h demo"] });
  });

  test("handles CRLF line endings and a byte order mark", () => {
    const document = parseHelp("demo", `\uFEFF${source.replaceAll("\n", "\r\n")}`);

    assert.equal(document.title, "Demo help");
    assert.equal(document.tags.length, 6);
  });

  test("source metrics include the BOM and CRLF bytes but exclude the terminal empty line", () => {
    const body = "*demo.txt*  Caf\u00e9";
    const document = parseHelp("demo", `\uFEFF${body}\r\n\r\n`);
    assert.equal(document.lines, 2);
    assert.equal(document.bytes, 24);
    assert.equal(document.title, "Caf\u00e9");
    assert.equal(parseHelp("demo", body).lines, 1);
    assert.equal(parseHelp("demo", body).bytes, 17);
  });

  describe("rejects a bad first line", () => {
    for (const first of ["Demo help", "*other.txt*  Demo help"]) {
      test(first, () => {
        assert.throws(() => parseHelp("demo", `${first}\n`), /demo\.txt: the first line/);
      });
    }
  });
});

describe("renderHelp", () => {
  test("renders tags as anchors and links as help links", () => {
    const tags = { "demo.txt": "demo", yy: "demo" };
    const html = renderHelp(parseHelp("demo", "*demo.txt*  Demo\n\nPress |yy| or |gone|.\n"), tags);

    assert.match(html, /^<article class="help-content" data-help-page="demo" data-total-lines="3" data-bytes="40">/);
    assert.match(html, /<span class="help-tag" id="help-demo\.txt">demo\.txt<\/span>/);
    assert.match(html, /<a class="help-link" href="\/help\/demo\/#help-yy" data-help-tag="yy">yy<\/a>/);
    assert.match(html, /<span class="help-link-missing">gone<\/span>/);
  });

  test("renders inline code, keys, and placeholders, escaping text", () => {
    const html = renderHelpInline("Use `a<b>` with CTRL-] and <Esc> on {topic} & more", {});

    assert.equal(
      html,
      "Use <code>a&lt;b&gt;</code> with <kbd>CTRL-]</kbd> and <kbd>&lt;Esc&gt;</kbd> on <var>{topic}</var> &amp; more",
    );
  });

  test("renders literal text in key lists as keys", () => {
    assert.equal(renderHelpInline("`gx`", {}, "kbd"), "<kbd>gx</kbd>");
  });
});

describe("buildHelp", () => {
  const index = { name: "help", source: "*help.txt*  Index\n\nSee |demo-copy|.\n" };
  const demo = { name: "demo", source: "*demo.txt*  Demo\n\nCopying                        *demo-copy*\n" };

  test("maps every tag to its page and renders every page", () => {
    const bundle = buildHelp([index, demo]);

    assert.deepEqual(bundle.tags, { "help.txt": "help", "demo.txt": "demo", "demo-copy": "demo" });
    assert.deepEqual(Object.keys(bundle.html), ["help", "demo"]);
    assert.match(bundle.html.help, /href="\/help\/demo\/#help-demo-copy"/);
  });

  test("requires the index", () => {
    assert.throws(() => buildHelp([demo]), /Missing the help index, help\.txt/);
  });

  test("rejects duplicate tags", () => {
    const copy = { name: "copy", source: "*copy.txt*  Copy\n\nAgain                          *demo-copy*\n" };

    assert.throws(() => buildHelp([index, demo, copy]), /Duplicate help tag \*demo-copy\* in copy\.txt and demo\.txt/);
  });

  test("rejects broken links", () => {
    const broken = { name: "help", source: "*help.txt*  Index\n\nSee |nowhere|.\n" };

    assert.throws(() => buildHelp([broken]), /help\.txt links to unknown tag \|nowhere\|/);
  });
});

describe("resolveHelpTag", () => {
  const tags = { "help.txt": "help", clipboard: "clipboard", "clipboard-errors": "clipboard", ":help": "commands" };
  const cases: [topic: string, expected: string | null][] = [
    ["", "help.txt"],
    ["  ", "help.txt"],
    ["clipboard", "clipboard"],
    ["CLIPBOARD", "clipboard"],
    ["clipboard-e", "clipboard-errors"],
    ["errors", "clipboard-errors"],
    [":h", ":help"],
    ["nothing", null],
  ];
  for (const [topic, expected] of cases) {
    test(`${JSON.stringify(topic)} -> ${JSON.stringify(expected)}`, () => {
      assert.equal(resolveHelpTag(tags, topic), expected);
    });
  }

  test("helpPageOf falls back to the index", () => {
    assert.equal(helpPageOf(tags, "clipboard-errors"), "clipboard");
    assert.equal(helpPageOf(tags, "unknown"), "help");
    assert.equal(helpPageOf(tags, null), "help");
  });
});

describe("src/help", () => {
  test("every help file parses, links resolve, and clipboard help exists", async () => {
    const bundle = await loadHelp();

    assert.ok(bundle.documents.length > 1);
    for (const tag of ["help.txt", "clipboard", "clipboard-errors"]) assert.ok(Object.hasOwn(bundle.tags, tag), tag);
    assert.equal(resolveHelpTag(bundle.tags, "clipboard"), "clipboard");
  });
});
