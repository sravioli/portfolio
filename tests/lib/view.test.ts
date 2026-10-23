import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { find, rootEntry } from "../../src/lib/catalog.ts";
import { search, totalCount } from "../../src/lib/file-search.ts";
import { NavigationState } from "../../src/lib/navigation-state.ts";
import {
  documentOutline,
  githubUrl,
  previewKey,
  renderDocumentActions,
  renderExplorerEntries,
  renderFinderResults,
  renderHelpBar,
  renderHelpContent,
  renderNotFound,
  renderOutline,
  renderCommandLine,
  FLASH_PROMPT,
  renderRawDocument,
  renderShell,
  renderStatusline,
  renderTabline,
  statuslineClass,
  renderWelcome,
  ERROR_UI,
  type FinderModel,
  type ViewModel,
} from "../../src/lib/view.ts";
import { documentModel, welcomeModel } from "../../src/build/model.ts";

const count = (html: string, pattern: RegExp): number => html.match(pattern)?.length ?? 0;

const finderModel = (selectedIndex: number): FinderModel => ({
  query: "",
  results: search(""),
  totalCount,
  selectedIndex,
  loading: false,
  error: null,
  preview: null,
});

describe("view", () => {
  test("flash prompt renders as an icon followed by the escaped pattern", () => {
    const state = new NavigationState();
    state.message = `${FLASH_PROMPT}a<b`;
    const line = renderCommandLine({ ...welcomeModel(), state });
    assert.match(line, /<svg class="flash-prompt-icon" aria-hidden="true"[^>]*>.*<\/svg><span class="visually-hidden">Flash: <\/span>a&lt;b<\/output>/);
    assert.doesNotMatch(line, new RegExp(FLASH_PROMPT));
  });

  test("help window renders closed by default and open beside the README", () => {
    const closed = renderShell(welcomeModel());
    assert.match(closed, /data-help="closed"/);
    assert.match(closed, /<aside class="help-pane" aria-labelledby="help-file" hidden>/);

    const state = new NavigationState();
    state.openHelp(null);
    const open = renderShell({ ...welcomeModel(), state, helpHtml: '<article class="help-content"></article>' });
    assert.match(open, /data-help="open"/);
    assert.match(open, /<aside class="help-pane" aria-labelledby="help-file">/);
    assert.match(open, /<article class="help-content"><\/article>/);
  });

  test("help bar is a statusline with the file name and a close button only", () => {
    const state = new NavigationState();
    state.helpPage = "clipboard";
    const bar = renderHelpBar({ ...welcomeModel(), state });
    assert.match(bar, /clipboard\.txt <span class="help-flags">\[Help\]\[RO\]<\/span>/);
    assert.match(bar, /class="help-close" href="\/" data-action="close-help"/);
    assert.doesNotMatch(bar, /help-back|help-search|Topics/);
  });

  test("tabline actions act on help while it is the current window", () => {
    const readme = renderTabline(welcomeModel());
    assert.match(readme, /data-action="back"/);
    assert.match(readme, /data-action="find"/);
    assert.match(readme, /data-action="help"/);
    const help = renderTabline({ ...welcomeModel(), helpCurrent: true });
    assert.match(help, /data-action="help-back" aria-label="Close help" title="Close help \(q\)">/);
    assert.match(help, /data-action="help-search" aria-label="Search help"/);
    assert.match(help, /data-action="help-topics" aria-label="Help topics"/);
    assert.doesNotMatch(help, /data-action="(back|find|help)"/);
    const stacked = renderTabline({ ...welcomeModel(), helpCurrent: true, helpBack: true });
    assert.match(stacked, /data-action="help-back" aria-label="Back" title="Back \(CTRL-T\)">/);
  });

  test("statusline shows the help file and its position while help is the current window", () => {
    const state = new NavigationState();
    state.openHelp(null);
    state.helpPage = "clipboard";
    const model: ViewModel = {
      ...welcomeModel(),
      state,
      helpCurrent: true,
      helpStatus: { line: 7, column: 3, total: 227, position: "Top", bytes: 7782 },
    };
    const line = renderStatusline(model);
    assert.match(line, /<span class="status-full">HELP<\/span>/);
    assert.match(line, /clipboard\.txt<\/span>/);
    assert.match(line, /7\.6kb/);
    assert.match(line, /007\/227:03 <\/span>Top/);
    assert.doesNotMatch(line, /NVIMTREE|MARKDOWN/);
    assert.match(statuslineClass(model), /reading-status help-status/);
    const unfocused = renderStatusline({ ...model, helpCurrent: false });
    assert.match(unfocused, /NVIMTREE/);
  });

  test("statusline shows VISUAL and V-LINE in purple while a window is in Visual mode", () => {
    const state = new NavigationState();
    state.openHelp(null);
    const model: ViewModel = { ...welcomeModel(), state, helpCurrent: true, visualMode: "char" };
    assert.match(renderStatusline(model), /<span class="status-full">VISUAL<\/span><span class="status-short" aria-hidden="true">V<\/span>/);
    assert.match(statuslineClass(model), /visual-status/);
    const line = renderStatusline({ ...model, visualMode: "line" });
    assert.match(line, /<span class="status-full">V-LINE<\/span><span class="status-short" aria-hidden="true">V-L<\/span>/);
    state.isCommandMode = true;
    assert.match(renderStatusline(model), /COMMAND/);
    assert.doesNotMatch(statuslineClass(model), /visual-status/);
  });

  test("README and help rulers preserve identical coordinates, escaping, and scroll thumbs", () => {
    const state = new NavigationState();
    state.navigateTo("chrono");
    const base = {
      ...welcomeModel(),
      state,
      positionLine: 7,
      totalLines: 1234,
      positionColumn: 103,
    };
    for (const [position, fraction] of [["All", "0"], ["Bot", "1"], ["37%", "0.37"], ["<x>&", "0"]]) {
      const escaped = position === "<x>&" ? "&lt;x&gt;&amp;" : position;
      const ruler =
        '<span class="position-block"><span class="status-full">007/1234:103 </span>' +
        `${escaped} <span class="scroll-thumb" aria-hidden="true" style="--scroll: ${fraction}"></span></span>`;
      assert.ok(renderStatusline({ ...base, scrollPosition: position }).includes(ruler));
      assert.ok(renderStatusline({
        ...base,
        helpCurrent: true,
        helpStatus: { line: 7, total: 1234, column: 103, position, bytes: 0 },
      }).includes(ruler));
    }
  });

  test("help content shows loading, errors with retry, then the file", () => {
    assert.match(renderHelpContent({ ...welcomeModel(), helpLoading: true }), /class="help-loading"/);
    const error = renderHelpContent({ ...welcomeModel(), helpError: "E149: <x>" });
    assert.match(error, /role="alert"><p>E149: &lt;x&gt;<\/p>/);
    assert.match(error, /data-action="help-retry"/);
    assert.equal(
      renderHelpContent({ ...welcomeModel(), helpHtml: "<article></article>" }),
      '<article></article><div class="nvim-cursor" aria-hidden="true"></div>',
    );
  });

  test("raw documents render one line span per source line", () => {
    assert.equal(
      renderRawDocument("# Title\n\nbody", "repo"),
      '<pre class="raw-readme" data-repository="repo">' +
        '<span class="raw-line"># Title</span><span class="raw-line"></span>' +
        '<span class="raw-line">body</span></pre>',
    );
    assert.match(renderRawDocument("<b>&</b>", "next"), /<span class="raw-line">&lt;b&gt;&amp;&lt;\/b&gt;<\/span>/);
  });

  test("explorer files are links to their pages and folders stay toggle buttons", () => {
    const state = new NavigationState();
    state.selectIndex(1);
    const html = renderExplorerEntries({ ...welcomeModel(), state });
    const files = state.entries.filter((item) => item.kind !== "folder").length;
    assert.equal(count(html, /<a class="entry[^"]*" href="\//g), files);
    assert.equal(count(html, /<button type="button" class="entry/g), state.entries.length - files);
    assert.match(html, /<a class="entry selected" href="\/featured\.md\/" data-index="1"/);
    assert.match(html, /href="\/readme\/"/);
    assert.deepEqual(
      [...html.matchAll(/data-index="(\d+)"/g)].map((match) => Number(match[1])),
      state.entries.map((_, index) => index),
    );
    assert.equal(count(html, /class="entry selected"/g), 1);
    assert.equal(count(html, /selected/g), 1);
  });

  test("welcome README actions are real links", () => {
    const html = renderWelcome(welcomeModel());
    assert.match(html, /<a href="\/readme\/" data-action="open-readme"/);
    assert.match(html, /<a href="\/featured\.md\/" data-action="open-featured"/);
  });

  test("document actions offer outline, GitHub, and copy link while reading", () => {
    const source = '<h1 id="chrono">chrono</h1><h2 id="usage">Usage &amp; CLI</h2><h4 id="deep">Deep</h4>';
    const model = documentModel({ entry: find("chrono")!, html: source, bytes: 1, lines: 1 } as never);
    const html = renderDocumentActions(model);
    assert.match(html, /data-action="outline" aria-haspopup="dialog"(?![^>]*disabled)/);
    assert.match(html, /href="https:\/\/github\.com\/sravioli\/chrono" target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /\(opens in a new tab\)/);
    assert.match(html, /data-action="copy-link"/);
    assert.equal(renderDocumentActions(welcomeModel()), "");

    model.state.isRawView = true;
    assert.match(renderDocumentActions(model), /data-action="outline"[^>]*disabled/);
  });

  test("document outline lists h1 to h3 headings by level", () => {
    assert.deepEqual(
      documentOutline('<h1 id="a">A</h1><h2 id="b">B <code>c</code></h2><h3 id="d">D</h3><h4 id="e">E</h4><h2>no id</h2>'),
      [
        { id: "a", level: 1, title: "A" },
        { id: "b", level: 2, title: "B c" },
        { id: "d", level: 3, title: "D" },
      ],
    );
    const model = documentModel({ entry: find("chrono")!, html: '<h2 id="x">X</h2>', bytes: 1, lines: 1 } as never);
    assert.match(renderOutline(model), /<li class="outline-level-2"><a href="#x" data-readme-heading/);
  });

  test("GitHub destinations match the kind of document", () => {
    assert.equal(githubUrl(rootEntry), "https://github.com/sravioli");
    assert.equal(githubUrl(find("memo.wz")!), "https://github.com/sravioli/memo.wz");
    assert.match(githubUrl(find("featured.md")!), /\/sravioli\/portfolio\/blob\/[^/]+\/src\/documents\/featured\.md$/);
    assert.match(githubUrl(find("wezterm-plugins")!), /tab=repositories/);
  });

  test("finder results are indexed options with a single selection", () => {
    const html = renderFinderResults(finderModel(2));
    assert.equal(count(html, /role="option"/g), totalCount);
    assert.equal(count(html, /aria-selected="true"/g), 1);
    assert.match(html, /id="finder-result-2" class="finder-result selected"/);
  });

  test("welcome shell leaves the explorer to the pre-paint script", () => {
    const html = renderShell(welcomeModel());
    assert.match(html, /data-explorer="pending"/);
    assert.match(html, /data-welcome="true"/);
    assert.equal(count(html, /id="search-position"/g), 1);
  });

  test("toolbar exposes a keyboard-accessible light theme toggle", () => {
    const html = renderTabline(welcomeModel());
    assert.match(
      html,
      /<button type="button" data-action="toggle-theme" aria-label="Light mode" aria-pressed="false"/,
    );
    assert.match(html, /<svg class="theme-wave-label" aria-hidden="true"/);
    assert.match(html, /<svg class="theme-lotus-label" aria-hidden="true"/);
    assert.match(html, /title="Toggle light \/ dark mode"/);
  });

  test("status paths abbreviate the home directory to a tilde", () => {
    const html = renderShell(documentModel({
      entry: rootEntry, key: "readme", source: "# Home", html: "<h1>Home</h1>", bytes: 6, lines: 1,
    }));
    assert.match(html, /cwd-full"><span class="cwd-head"><\/span><span class="cwd-tail">~<\/span>/);
    assert.doesNotMatch(html, /cwd-full">[^<]*\/home/);
  });

  test("toolbar uses accessible back and keyboard icons with distinct shortcut states", () => {
    const model = welcomeModel();
    for (const enabled of [true, false]) {
      model.state.keyboardEnabled = enabled;
      const html = renderTabline(model);
      assert.match(html, /data-action="back" aria-label="Back" title="Back"><svg aria-hidden="true"/);
      assert.ok(html.includes(`aria-label="Keyboard shortcuts" aria-pressed="${enabled}"`));
      assert.ok(html.includes(`title="Keyboard shortcuts: ${enabled ? "on" : "off"}`));
      assert.equal(html.includes('<path d="m3 3 18 18"/>'), !enabled);
      assert.doesNotMatch(html, />Back<|Keys: /);
    }
  });

  test("document shell server-renders the article", () => {
    const entry = find("chrono")!;
    const html = renderShell(
      documentModel({ entry, key: "chrono", source: "# chrono", html: "<h1>chrono</h1>", bytes: 8, lines: 1 } as never),
    );
    assert.match(html, /data-reading="true"/);
    assert.match(
      html,
      /<article class="readme-content" data-repository="chrono" data-total-lines="1"><h1>chrono<\/h1><\/article>/,
    );
  });

  test("preview keys distinguish rendered and raw views", () => {
    const model = documentModel({ entry: find("chrono")!, html: "<h1>x</h1>", bytes: 1, lines: 1 } as never);
    const rendered = previewKey(model);
    model.state.isRawView = true;
    const raw: ViewModel = { ...model, documentSource: "# x" };
    assert.notEqual(previewKey(raw), rendered);
    assert.equal(previewKey(welcomeModel()).startsWith("welcome:"), true);
  });

  test("not found escapes the requested path", () => {
    const html = renderNotFound('./<img src=x onerror="1">');
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /href="\/"/);
    assert.match(html, /class="not-found-content"/);
    assert.match(html, /bash: cd:/);
    assert.match(html, /\(404\)/);
    assert.match(html, /No such file or directory/);
    assert.match(html, />nvim \.<\/a>/);
  });

  test("welcome hints explain link and tree focus semantics", () => {
    const html = renderWelcome(welcomeModel());
    assert.match(html, />gx<\/span><\/span><span>to open the link under the cursor/);
    assert.match(html, /data-action="focus-explorer"/);
    assert.match(html, /to browse projects with the tree focused/);
    assert.doesNotMatch(html, /to open GitHub/);
  });

  test("runtime failures keep the terminal error and restart/dismiss controls", () => {
    assert.match(ERROR_UI, /id="error-ui" role="alert"/);
    assert.match(ERROR_UI, /unexpected application error/);
    assert.match(ERROR_UI, /class="reload"/);
    assert.match(ERROR_UI, /class="dismiss"/);
    assert.match(ERROR_UI, />nvim \.<\/a>/);
  });
});
