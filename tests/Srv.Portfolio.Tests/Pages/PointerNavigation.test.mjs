import assert from "node:assert/strict";
import test from "node:test";
import { importHomeModule } from "../helpers/import-source-module.mjs";
import { createDomFixture, TestElement } from "../helpers/dom-fixture.mjs";
import * as viewer from "../../../src/Srv.Portfolio/wwwroot/js/image-viewer.js";

const cursorStub = `
  export function setNavigator() {}
  export function setMoveListener() {}
  export function dispose() {}
  export function placeAt(...args) { globalThis.pointerFixture.placements.push(args); }
  export function imageUnderCursor() { return globalThis.pointerFixture.image; }
  export function followLink() {
    const link = globalThis.pointerFixture.image?.link;
    if (!link) return false;
    window.open(link.href, "_blank", "noopener,noreferrer");
    return true;
  }
`;
const home = await importHomeModule({
  "../js/nvim-cursor.js": `data:text/javascript;base64,${Buffer.from(cursorStub).toString("base64")}`,
});

function fixture(t, { enabled = true } = {}) {
  const names = ["Element", "HTMLElement", "HTMLImageElement", "location", "pointerFixture"];
  const previous = new Map(names.map((name) => [name, globalThis[name]]));
  class Image extends TestElement {
    constructor(link) {
      super("img");
      this.src = "https://images.example.test/screenshot.png";
      this.currentSrc = this.src;
      this.alt = "Screenshot";
      this.link = link;
    }
    closest(selector) {
      if (selector === ".readme-content") return article;
      if (selector === "a[href]") return this.link ?? null;
      return null;
    }
  }
  const article = new TestElement("article");
  const viewport = new TestElement("section");
  viewport.removeEventListener = () => {};
  const listeners = new Map();
  const dom = createDomFixture({
    querySelector: (selector) => selector === ".preview-scroll" ? viewport : null,
  });
  const focused = [];
  dom.document.createElement = (tag) => {
    const element = new TestElement(tag);
    element.focus = () => focused.push(element);
    return element;
  };
  const originFocus = new TestElement("button");
  originFocus.focus = () => focused.push(originFocus);
  dom.document.activeElement = originFocus;
  dom.document.addEventListener = (name, handler) => listeners.set(name, handler);
  dom.document.removeEventListener = (name) => listeners.delete(name);
  window.addEventListener = () => {};
  window.removeEventListener = () => {};
  const external = [];
  window.open = (...args) => external.push(args);
  globalThis.Element = TestElement;
  globalThis.HTMLElement = TestElement;
  globalThis.HTMLImageElement = Image;
  globalThis.location = new URL("https://portfolio.example.test/");
  const state = globalThis.pointerFixture = { placements: [], image: null };
  const calls = [];
  home.initialize({ invokeMethodAsync: async (...args) => calls.push(args) }, enabled, " ");
  t.after(() => {
    home.dispose();
    dom.restore();
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  async function click(target, extras = {}) {
    const event = {
      target, button: 0, detail: 1, clientX: 20, clientY: 30,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...extras,
    };
    await listeners.get("click")(event);
    return event;
  }
  return { ...dom, Image, state, click, external, calls, focused, originFocus };
}

for (const linked of [false, true]) {
  test(`click and Enter both preview ${linked ? "self-linked" : "unlinked"} images`, async (t) => {
    const f = fixture(t);
    const image = new f.Image(linked ? { href: "https://images.example.test/screenshot.png" } : null);
    f.state.image = image;

    assert.equal(home.followLink(true), true);
    assert.equal(viewer.isOpen(), true);
    const keyboardPreview = f.body.children[0].children[0].src;
    viewer.handleKey("Enter");
    assert.equal(viewer.isOpen(), false);

    assert.equal((await f.click(image)).defaultPrevented, true);
    assert.equal(viewer.isOpen(), true);
    const overlay = f.body.children[0];
    assert.equal(overlay.children[0].src, keyboardPreview);
    assert.equal(overlay.attributes["aria-label"], "Image preview: Screenshot");
    assert.equal(f.state.placements.length, 1);
    overlay.dispatch("click");
    assert.equal(viewer.isOpen(), false);
    assert.equal(f.focused.at(-1), f.originFocus);
    assert.deepEqual(f.external, []);
  });
}

test("linked badges follow their destination with both click and Enter", async (t) => {
  const f = fixture(t);
  const image = new f.Image({ href: "https://example.test/project" });
  f.state.image = image;
  assert.equal(home.followLink(true), true);
  assert.equal((await f.click(image)).defaultPrevented, true);
  assert.equal(viewer.isOpen(), false);
  assert.deepEqual(f.external, [
    ["https://example.test/project", "_blank", "noopener,noreferrer"],
    ["https://example.test/project", "_blank", "noopener,noreferrer"],
  ]);
});

test("image clicks work with Vim keys disabled and all close keys restore focus", async (t) => {
  const f = fixture(t, { enabled: false });
  for (const key of ["Escape", "q", "Enter"]) {
    await f.click(new f.Image());
    assert.equal(viewer.isOpen(), true);
    viewer.handleKey(key);
    assert.equal(viewer.isOpen(), false);
    assert.equal(f.focused.at(-1), f.originFocus);
  }
});

test("modified clicks and non-primary clicks retain native behavior", async (t) => {
  const f = fixture(t);
  for (const extras of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    assert.equal((await f.click(new f.Image(), extras)).defaultPrevented, false);
    assert.equal(viewer.isOpen(), false);
  }
  assert.equal(f.state.placements.length, 0);
});

test("unavailable images and non-image content do not open the viewer", async (t) => {
  const f = fixture(t);
  const image = new f.Image();
  image.src = image.currentSrc = "";
  const paragraph = new TestElement("p");
  paragraph.closest = () => null;
  assert.equal((await f.click(image)).defaultPrevented, false);
  assert.equal((await f.click(paragraph)).defaultPrevented, false);
  assert.equal(viewer.isOpen(), false);
});
