import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { find, rootEntry } from "../../src/lib/catalog.ts";
import { search, totalCount } from "../../src/lib/file-search.ts";
import { NavigationState } from "../../src/lib/navigation-state.ts";
import {
  previewKey,
  renderExplorerEntries,
  renderFinderResults,
  renderNotFound,
  renderRawDocument,
  renderShell,
  renderTabline,
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
  test("raw documents render one line span per source line", () => {
    assert.equal(
      renderRawDocument("# Title\n\nbody", "repo"),
      '<pre class="raw-readme" data-repository="repo">' +
        '<span class="raw-line"># Title</span><span class="raw-line"></span>' +
        '<span class="raw-line">body</span></pre>',
    );
    assert.match(renderRawDocument("<b>&</b>", "next"), /<span class="raw-line">&lt;b&gt;&amp;&lt;\/b&gt;<\/span>/);
  });

  test("explorer entries are indexed buttons with a single selection", () => {
    const state = new NavigationState();
    state.selectIndex(1);
    const html = renderExplorerEntries({ ...welcomeModel(), state });
    assert.equal(count(html, /<button type="button" class="entry/g), state.entries.length);
    assert.deepEqual(
      [...html.matchAll(/data-index="(\d+)"/g)].map((match) => Number(match[1])),
      state.entries.map((_, index) => index),
    );
    assert.equal(count(html, /class="entry selected" data-index="1"/g), 1);
    assert.equal(count(html, /selected/g), 1);
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
