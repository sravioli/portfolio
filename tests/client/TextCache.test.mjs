import assert from "node:assert/strict";
import test from "node:test";
import { fetchCachedText } from "../../src/client/text-cache.ts";

test("seeded and empty cached text never trigger a fetch", async (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected fetch"); });
  const cache = new Map([["adopted", "<article>SSR</article>"], ["empty", ""]]);
  assert.equal(await fetchCachedText(cache, "adopted", "/fragment"), "<article>SSR</article>");
  assert.equal(await fetchCachedText(cache, "empty", "/raw"), "");
  assert.equal(fetch.mock.callCount(), 0);
});

test("successful text is cached under its key and caches stay independent", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(url);
    return new Response(url === "/raw" ? "# README\r\n" : "<h1>README</h1>");
  });
  const html = new Map();
  const raw = new Map();
  assert.equal(await fetchCachedText(html, "readme", "/fragment"), "<h1>README</h1>");
  assert.equal(await fetchCachedText(raw, "readme", "/raw"), "# README\r\n");
  assert.equal(await fetchCachedText(html, "readme", "/fragment"), "<h1>README</h1>");
  assert.deepEqual(requests, ["/fragment", "/raw"]);
  assert.equal(raw.get("readme"), "# README\r\n");
});

for (const [status, statusText, detail] of [[404, "Not Found", "Not Found"], [503, "", "Error"]]) {
  test(`HTTP ${status} preserves error text, does not read/cache the body, and retries`, async (t) => {
    const cache = new Map();
    let reads = 0;
    t.mock.method(globalThis, "fetch", async () => ({
      ok: false,
      status,
      statusText,
      text() { reads++; throw new Error("Must not read a failed response"); },
    }));
    await assert.rejects(fetchCachedText(cache, "key", "/failed"), {
      message: `Response status code does not indicate success: ${status} (${detail}).`,
    });
    assert.equal(reads, 0);
    assert.equal(cache.has("key"), false);
    t.mock.method(globalThis, "fetch", async () => new Response("recovered"));
    assert.equal(await fetchCachedText(cache, "key", "/failed"), "recovered");
    assert.equal(cache.get("key"), "recovered");
  });
}

for (const stage of ["network", "body"]) {
  test(`${stage} failures propagate unchanged and remain retryable`, async (t) => {
    const failure = new Error(`${stage} failed`);
    const cache = new Map();
    let attempts = 0;
    t.mock.method(globalThis, "fetch", async () => {
      if (++attempts > 1) return new Response("");
      if (stage === "network") throw failure;
      return { ok: true, text: async () => { throw failure; } };
    });
    await assert.rejects(fetchCachedText(cache, "key", "/text"), (error) => error === failure);
    assert.equal(cache.has("key"), false);
    assert.equal(await fetchCachedText(cache, "key", "/text"), "");
    assert.equal(await fetchCachedText(cache, "key", "/text"), "");
    assert.equal(attempts, 2);
    assert.equal(cache.get("key"), "");
  });
}

test("concurrent misses remain independent and cache each successful completion", async (t) => {
  const complete = [];
  t.mock.method(globalThis, "fetch", () => new Promise((resolve) => complete.push(resolve)));
  const cache = new Map();
  const first = fetchCachedText(cache, "key", "/text");
  const second = fetchCachedText(cache, "key", "/text");
  assert.equal(complete.length, 2);
  assert.equal(cache.has("key"), false);
  complete[1](new Response("second"));
  assert.equal(await second, "second");
  assert.equal(cache.get("key"), "second");
  complete[0](new Response("first"));
  assert.equal(await first, "first");
  assert.equal(cache.get("key"), "first");
});
