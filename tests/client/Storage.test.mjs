import assert from "node:assert/strict";
import test from "node:test";
import { readStorage, writeStorage } from "../../src/client/storage.ts";

function install(t, descriptor) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, ...descriptor });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
}

test("storage preserves preference keys and values, including empty strings", (t) => {
  const stored = new Map();
  const reads = [];
  const writes = [];
  install(t, { value: {
    getItem(key) {
      reads.push(key);
      return stored.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push([key, value]);
      stored.set(key, value);
    },
  } });
  assert.equal(readStorage("missing"), null);
  for (const [key, value] of [
    ["portfolio.theme", "lotus"],
    ["portfolio.explorer", "closed"],
    ["portfolio.codeWrap", "on"],
    ["empty", ""],
  ]) {
    writeStorage(key, value);
    assert.equal(readStorage(key), value);
  }
  assert.deepEqual(reads, ["missing", ...writes.map(([key]) => key)]);
  assert.deepEqual([...stored], writes);
});

test("blocked storage methods retain the existing non-persistent fallback", (t) => {
  install(t, { value: {
    getItem() { throw new Error("Storage unavailable"); },
    setItem() { throw new Error("Storage unavailable"); },
  } });
  assert.equal(readStorage("portfolio.explorer"), null);
  assert.doesNotThrow(() => writeStorage("portfolio.theme", "lotus"));
});

test("a blocked storage getter is also tolerated", (t) => {
  install(t, { get() { throw new Error("SecurityError"); } });
  assert.equal(readStorage("portfolio.codeWrap"), null);
  assert.doesNotThrow(() => writeStorage("portfolio.codeWrap", "on"));
});
