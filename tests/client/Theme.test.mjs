import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  syncThemeToggle,
  toggleTheme,
} from "../../src/client/theme.ts";

function environment(saved = null, blocked = false) {
  const stored = new Map([[THEME_STORAGE_KEY, saved]]);
  const root = { dataset: {} };
  const meta = { content: "" };
  const attributes = new Map();
  const button = { setAttribute: (key, value) => attributes.set(key, value) };
  const document = {
    documentElement: root,
    querySelector(selector) {
      if (selector === 'meta[name="theme-color"]') return meta;
      assert.equal(selector, '[data-action="toggle-theme"]');
      return button;
    },
  };
  const localStorage = {
    getItem(key) {
      if (blocked) throw new Error("Storage unavailable");
      return stored.get(key) ?? null;
    },
    setItem(key, value) {
      if (blocked) throw new Error("Storage unavailable");
      stored.set(key, value);
    },
  };
  return { document, localStorage, stored, root, meta, attributes };
}

function install(t, env) {
  for (const key of ["document", "localStorage"]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value: env[key] });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
}

test("pre-paint initialization defaults to Wave, accepts only a saved Lotus choice", () => {
  for (const saved of [null, "wave", "lotus", "invalid", "LOTUS"]) {
    const env = environment(saved);
    runInNewContext(THEME_INIT_SCRIPT, env);
    assert.equal(env.root.dataset.theme, saved === "lotus" ? "lotus" : "wave", saved);
    assert.equal(env.meta.content, saved === "lotus" ? "#f2ecbc" : "#1f1f28", saved);
  }
});

test("toggle updates the palette, browser chrome, accessible state, and saved choice", (t) => {
  const env = environment();
  install(t, env);
  runInNewContext(THEME_INIT_SCRIPT, env);
  syncThemeToggle();
  assert.equal(env.attributes.get("aria-pressed"), "false");

  toggleTheme();
  assert.equal(env.root.dataset.theme, "lotus");
  assert.equal(env.meta.content, "#f2ecbc");
  assert.equal(env.attributes.get("aria-pressed"), "true");
  assert.equal(env.stored.get(THEME_STORAGE_KEY), "lotus");

  const nextPage = environment(env.stored.get(THEME_STORAGE_KEY));
  runInNewContext(THEME_INIT_SCRIPT, nextPage);
  assert.equal(nextPage.root.dataset.theme, "lotus");
  assert.equal(nextPage.meta.content, "#f2ecbc");

  toggleTheme();
  assert.equal(env.root.dataset.theme, "wave");
  assert.equal(env.meta.content, "#1f1f28");
  assert.equal(env.attributes.get("aria-pressed"), "false");
  assert.equal(env.stored.get(THEME_STORAGE_KEY), "wave");
});

test("blocked storage keeps dark default and still permits toggling for this visit", (t) => {
  const env = environment("lotus", true);
  install(t, env);
  runInNewContext(THEME_INIT_SCRIPT, env);
  assert.equal(env.root.dataset.theme, "wave");
  assert.equal(env.meta.content, "#1f1f28");
  toggleTheme();
  assert.equal(env.root.dataset.theme, "lotus");
  assert.equal(env.meta.content, "#f2ecbc");
  assert.equal(env.attributes.get("aria-pressed"), "true");
});

test("rendered toolbar replacements reflect the current theme; no toolbar is safe", (t) => {
  const env = environment("lotus");
  install(t, env);
  runInNewContext(THEME_INIT_SCRIPT, env);
  env.attributes.set("aria-pressed", "false");
  syncThemeToggle();
  assert.equal(env.attributes.get("aria-pressed"), "true");
  env.document.querySelector = () => null;
  assert.doesNotThrow(syncThemeToggle);
});

test("Wave and Lotus token pairs match the upstream Kanagawa palette", async () => {
  const css = await readFile(new URL("../../src/styles/app.css", import.meta.url), "utf8");
  const wave = css.match(/:root \{([^}]+)\}/)[1];
  const lotus = css.match(/:root\[data-theme="lotus"\] \{([^}]+)\}/)[1];
  const pairs = {
    bg: ["#1f1f28", "#f2ecbc"],
    surface: ["#16161d", "#d5cea3"],
    raised: ["#2a2a37", "#e7dba0"],
    selection: ["#223249", "#c9cbd1"],
    text: ["#dcd7ba", "#545464"],
    muted: ["#c8c093", "#43436c"],
    blue: ["#7e9cd8", "#4d699b"],
    green: ["#98bb6c", "#6f894e"],
    gold: ["#e6c384", "#77713f"],
    purple: ["#957fb8", "#624c83"],
    line: ["#54546d", "#716e61"],
    dim: ["#181820", "#dcd5ac"],
    panel: ["#1a1a22", "#e5ddb0"],
    cyan: ["#7fb4ca", "#6693bf"],
    pink: ["#d27e99", "#b35b79"],
    red: ["#e46876", "#c84053"],
    error: ["#e82424", "#e82424"],
    orange: ["#ffa066", "#cc6d00"],
    aqua: ["#7aa89f", "#597b75"],
    operator: ["#c0a36e", "#836f4a"],
    punctuation: ["#9cabca", "#4e8ca2"],
    parameter: ["#b8b4d0", "#5d57a3"],
    comment: ["#727169", "#8a8980"],
    "vcs-added": ["#76946a", "#6e915f"],
    "vcs-removed": ["#c34043", "#d7474b"],
    search: ["#2d4f67", "#b5cbd2"],
    warning: ["#ff9e3b", "#e98a00"],
  };
  for (const [name, values] of Object.entries(pairs)) {
    assert.match(wave, new RegExp(`--${name}: ${values[0]};`));
    assert.match(lotus, new RegExp(`--${name}: ${values[1]};`));
  }
  assert.match(wave, /color-scheme: dark/);
  assert.match(lotus, /color-scheme: light/);
  const outsideTokens = css.replace(/:root(?:\[data-theme="lotus"\])? \{[^}]+\}/g, "");
  const nvim = await readFile(new URL("../../src/nvim/nvim.css", import.meta.url), "utf8");
  assert.doesNotMatch(outsideTokens + nvim, /#[\da-f]{3,8}\b|rgba?\(/i);
});
