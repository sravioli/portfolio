import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";

// Usage: node interaction.mjs <published wwwroot> [--profile] [--trace]
if (!process.argv[2]) throw new Error("Pass the published wwwroot directory.");
const root = resolve(process.argv[2]);
const profileCpu = process.argv.includes("--profile");
const SECTIONS = 200;
const SPACED_PRESSES = 40;
const BURST_PRESSES = 60;
const profile = await mkdtemp(join(tmpdir(), "portfolio-interaction-"));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  const path = resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname).replaceAll("/", sep));
  if (!path.startsWith(root + sep) && path !== root) { res.writeHead(403).end(); return; }
  try {
    const file = path === root || path.endsWith(sep) ? join(path, "index.html") : path;
    const content = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" }).end(content);
  } catch {
    res.writeHead(404).end("Not found");
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;

// Fixed, representative README: prose with links/inline code, a list, and a highlighted code block per section.
const sourceSection = i => `## Section ${i}\n\nParagraph ${i} with a [memo](https://github.com/sravioli/memo.wz) link, ` +
  "`inline code`, and **bold** words. It is long enough to wrap across the reading column like real prose does in a README.\n\n" +
  `- First item ${i}\n- Second item ${i}\n\n\`\`\`csharp\nvar value = ${i};\nConsole.WriteLine(value);\n\`\`\`\n\n`;
const htmlSection = i => `<h2 id="readme-section-${i}">Section ${i}</h2>\n<p>Paragraph ${i} with a <a href="https://github.com/sravioli/memo.wz" data-internal-repo="memo.wz" title="Open memo.wz here">memo</a> link, ` +
  "<code>inline code</code>, and <strong>bold</strong> words. It is long enough to wrap across the reading column like real prose does in a README.</p>\n" +
  `<ul>\n<li>First item ${i}</li>\n<li>Second item ${i}</li>\n</ul>\n<div class="code-block"><button type="button" class="code-wrap-toggle" aria-label="Wrap long lines" aria-pressed="false" title="Toggle line wrap"></button><pre><code class="language-csharp">var value = ${i};\nConsole.WriteLine(value);\n</code></pre></div>\n`;
const fixtureSource = "# Interaction fixture\n\n" + Array.from({ length: SECTIONS }, (_, i) => sourceSection(i)).join("");
const fixtureHtml = '<h1 id="readme-interaction-fixture">Interaction fixture</h1>\n' + Array.from({ length: SECTIONS }, (_, i) => htmlSection(i)).join("");

const edge = spawn(process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let socket;
try {
  let stderr = "";
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Edge CDP startup timeout")), 30000);
    edge.stderr.on("data", chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    edge.once("exit", code => { clearTimeout(timeout); reject(new Error(`Edge exited ${code}: ${stderr}`)); });
  });
  socket = new WebSocket(endpoint);
  await once(socket, "open");
  let id = 0;
  const pending = new Map();
  const listeners = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    for (const listener of listeners) listener(message);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timeout);
    if (message.error) task.reject(new Error(JSON.stringify(message.error)));
    else task.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const callId = ++id;
    const timeout = setTimeout(() => { pending.delete(callId); reject(new Error(`CDP timeout: ${method}`)); }, 120000);
    pending.set(callId, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: callId, method, params, sessionId }));
  });
  const { product } = await send("Browser.getVersion");
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  listeners.push(message => {
    if (message.method !== "Fetch.requestPaused") return;
    const url = message.params.request.url;
    const snapshot = url.startsWith(origin + "/readmes/");
    const segments = new URL(url).pathname.split("/");
    const body = snapshot ? JSON.stringify({
      Repository: decodeURIComponent(segments.at(-2)),
      ReadmePath: Buffer.from(segments.at(-1).slice(0, -5), "hex").toString("utf8"),
      Source: fixtureSource,
      Html: fixtureHtml,
    }) : "[]";
    void send("Fetch.fulfillRequest", {
      requestId: message.params.requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: "*" }],
      body: Buffer.from(body).toString("base64"),
    }, message.sessionId);
  });
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Performance.enable", { timeDomain: "threadTicks" });
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await call("Fetch.enable", { patterns: [
    { urlPattern: "https://raw.githubusercontent.com/*" },
    { urlPattern: "https://api.github.com/*" },
    { urlPattern: origin + "/readmes/*" },
  ] });
  await call("Page.navigate", { url: origin });
  const deadline = Date.now() + 60000;
  while (!(await evaluate('!!document.querySelector(".welcome-screen")'))) {
    if (Date.now() > deadline) throw new Error("Published app startup timeout");
    await new Promise(r => setTimeout(r, 50));
  }
  // Wait until Home's module installed its document key handler (same signal as browser.mjs).
  const { result: documentObject } = await call("Runtime.evaluate", { expression: "document" });
  for (const until = Date.now() + 10000; ;) {
    const { listeners: domListeners } = await call("DOMDebugger.getEventListeners", { objectId: documentObject.objectId });
    if (domListeners.some(l => l.type === "error" && domListeners.some(k => k.type === "keydown" && k.scriptId === l.scriptId))) break;
    if (Date.now() > until) throw new Error("Keyboard initialization timeout");
    await new Promise(r => setTimeout(r, 25));
  }
  const boot = await evaluate(`(() => {
    const entries = performance.getEntriesByType("resource");
    const byType = {};
    for (const entry of entries) {
      const ext = new URL(entry.name).pathname.split(".").pop();
      byType[ext] ??= { count: 0, decodedBytes: 0 };
      byType[ext].count++;
      byType[ext].decodedBytes += entry.decodedBodySize;
    }
    return { startupMs: performance.now(), resources: entries.length, byType };
  })()`);

  const metrics = async () => Object.fromEntries((await call("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  const cpuDelta = (before, after, n) => ({
    taskMsPerOp: (after.TaskDuration - before.TaskDuration) * 1000 / n,
    scriptMsPerOp: (after.ScriptDuration - before.ScriptDuration) * 1000 / n,
    layoutMsPerOp: (after.LayoutDuration - before.LayoutDuration) * 1000 / n,
    styleMsPerOp: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000 / n,
    layoutsPerOp: (after.LayoutCount - before.LayoutCount) / n,
    styleRecalcsPerOp: (after.RecalcStyleCount - before.RecalcStyleCount) / n,
  });
  const profiles = [];
  // --trace: summarize which layouts are expensive and what invalidated them (diagnostic only).
  const traceLayout = process.argv.includes("--trace");
  let traceEvents = [];
  let traceDone;
  listeners.push(message => {
    if (message.method === "Tracing.dataCollected") traceEvents.push(...message.params.value);
    if (message.method === "Tracing.tracingComplete") traceDone?.();
  });
  const summarizeTrace = name => {
    const top = e => {
      const frame = (e.args?.data?.stackTrace ?? e.args?.beginData?.stackTrace ?? [])[0];
      return frame ? `${frame.functionName || "(anon)"} ${frame.url.split("/").pop()}:${frame.lineNumber}` : "(no js)";
    };
    const layouts = traceEvents.filter(e => e.name === "Layout" && e.ph === "X");
    const group = (events, key, value) => Object.entries(events.reduce((all, e) => {
      const k = key(e);
      all[k] = all[k] ?? { count: 0, ms: 0 };
      all[k].count++;
      all[k].ms += value(e);
      return all;
    }, {})).sort((a, b) => b[1].ms - a[1].ms || b[1].count - a[1].count).slice(0, 8).map(([k, v]) => ({ k, count: v.count, ms: Math.round(v.ms * 10) / 10 }));
    console.log(JSON.stringify({
      trace: name,
      layouts: layouts.length,
      layoutMs: Math.round(layouts.reduce((s, e) => s + e.dur, 0) / 100) / 10,
      dirtyObjects: layouts.reduce((s, e) => s + (e.args?.beginData?.dirtyObjects ?? 0), 0),
      layoutByTrigger: group(layouts, top, e => e.dur / 1000),
      partial: layouts.filter(e => e.args?.beginData?.partialLayout).length,
      invalidations: group(traceEvents.filter(e => e.name === "LayoutInvalidationTracking"), e => `${e.args.data.nodeName} ${e.args.data.reason} <- ${top(e)}`, () => 1),
    }));
  };
  const measure = async (name, expression, n) => {
    await evaluate("new Promise(r => setTimeout(r, 300))");
    if (profileCpu) { await call("Profiler.enable"); await call("Profiler.setSamplingInterval", { interval: 100 }); await call("Profiler.start"); }
    if (traceLayout) {
      traceEvents = [];
      await send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline.stack,disabled-by-default-devtools.timeline.invalidationTracking", transferMode: "ReportEvents" });
    }
    const before = await metrics();
    const value = await evaluate(expression);
    const after = await metrics();
    if (profileCpu) profiles.push({ name, profile: (await call("Profiler.stop")).profile });
    if (traceLayout) {
      const done = new Promise(r => { traceDone = r; });
      await send("Tracing.end");
      await done;
      summarizeTrace(name);
    }
    const result = { name, ...value, ...cpuDelta(before, after, n) };
    console.log(JSON.stringify(result));
    return result;
  };

  await evaluate(`window.__perf = (() => {
    const status = () => document.querySelector(".statusline");
    const statusText = () => status()?.textContent ?? "";
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const frame = () => new Promise(r => requestAnimationFrame(() => r()));
    const until = async (predicate, timeout = 10000) => {
      const end = performance.now() + timeout;
      while (!predicate()) {
        if (performance.now() > end) throw new Error("Timeout: " + predicate + " " + JSON.stringify({ h1: document.querySelector(".readme-content h1")?.textContent, reading: document.querySelector(".portfolio-shell")?.dataset.reading, error: document.querySelector("#blazor-error-ui")?.style.display, status: statusText(), entries: [...document.querySelectorAll(".entry")].map(e => e.textContent.trim()).slice(0, 30) }));
        await sleep(5);
      }
    };
    const nextStatusChange = (timeout = 1000) => new Promise(resolve => {
      const observer = new MutationObserver(() => { observer.disconnect(); clearTimeout(timer); resolve(performance.now()); });
      const timer = setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
      observer.observe(status(), { subtree: true, childList: true, characterData: true, attributes: true });
    });
    const press = (key, target = document) =>
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    const stats = values => {
      const sorted = [...values].sort((a, b) => a - b);
      return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] };
    };
    const longTasks = [];
    new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: "longtask" });
    // Each press waits for the statusline update, then idles past the 100 ms position-report throttle.
    const spaced = async (keys, count, target) => {
      const latencies = [];
      let missed = 0;
      for (let i = 0; i < count; i++) {
        const key = keys[i % keys.length];
        const changed = nextStatusChange();
        const start = performance.now();
        press(key, typeof target === "function" ? target() : target);
        const end = await changed;
        if (end === null) missed++; else latencies.push(end - start);
        await sleep(130);
      }
      return { presses: count, missed, ...stats(latencies) };
    };
    // Keyboard auto-repeat: presses every 33 ms, then waits for the statusline to settle.
    const burst = async (key, count, target) => {
      const tasksBefore = longTasks.length;
      const start = performance.now();
      for (let i = 0; i < count; i++) { press(key, typeof target === "function" ? target() : target); await sleep(33); }
      let last = statusText();
      let stableSince = performance.now();
      while (performance.now() - stableSince < 400) {
        await sleep(20);
        const text = statusText();
        if (text !== last) { last = text; stableSince = performance.now(); }
      }
      return { presses: count, settleMs: stableSince - start, longTasks: longTasks.length - tasksBefore, longTaskMs: longTasks.slice(tasksBefore).reduce((a, b) => a + b, 0) };
    };
    return { status, statusText, sleep, frame, until, press, spaced, burst, stats, longTasks };
  })(); true`);

  const opened = await measure("open 200-section README", `(async () => {
    const p = window.__perf;
    const folder = [...document.querySelectorAll(".entry")].find(e => e.textContent.includes("chrono/"));
    if (folder.getAttribute("aria-expanded") !== "true") { folder.click(); await p.until(() => folder.getAttribute("aria-expanded") === "true"); }
    const tasksBefore = p.longTasks.length;
    const start = performance.now();
    folder.nextElementSibling.click();
    await p.until(() => document.querySelector(".readme-content h1")?.textContent === "Interaction fixture");
    const renderedMs = performance.now() - start;
    await p.until(() => document.querySelectorAll(".readme-content pre code.hljs").length === ${SECTIONS});
    const highlightedMs = performance.now() - start;
    await p.until(() => document.querySelector(".nvim-cursor")?.dataset.visible === "true");
    await p.until(() => /001\\//.test(p.statusText()));
    await p.sleep(200);
    return { renderedMs, highlightedMs, longTasks: p.longTasks.length - tasksBefore, maxLongTaskMs: Math.max(0, ...p.longTasks.slice(tasksBefore)) };
  })()`, 1);
  const results = [opened];
  results.push(await measure("rendered j/k spaced", `window.__perf.spaced(["j"], ${SPACED_PRESSES})`, SPACED_PRESSES));
  results.push(await measure("rendered j burst", `window.__perf.burst("j", ${BURST_PRESSES})`, BURST_PRESSES));
  results.push(await measure("raw toggle", `(async () => {
    const p = window.__perf;
    const start = performance.now();
    p.press("p");
    await p.until(() => document.querySelectorAll(".raw-line").length > 0 && document.querySelector(".nvim-cursor")?.dataset.visible === "true");
    const ms = performance.now() - start;
    await p.until(() => p.statusText().includes("TEXT"));
    return { ms, statusMs: performance.now() - start, rawLines: document.querySelectorAll(".raw-line").length };
  })()`, 1));
  results.push(await measure("raw j spaced", `window.__perf.spaced(["j"], ${SPACED_PRESSES})`, SPACED_PRESSES));
  results.push(await measure("raw j burst", `window.__perf.burst("j", ${BURST_PRESSES})`, BURST_PRESSES));
  results.push(await measure("rendered toggle", `(async () => {
    const p = window.__perf;
    const start = performance.now();
    p.press("p");
    await p.until(() => document.querySelector(".readme-content h1") && p.statusText().includes("MARKDOWN"));
    return { ms: performance.now() - start };
  })()`, 1));
  await evaluate(`(async () => {
    const p = window.__perf;
    p.press("-");
    await p.until(() => document.querySelector(".portfolio-shell").dataset.reading === "false");
    document.querySelector(".entry.selected").focus();
    await p.sleep(200);
  })()`);
  results.push(await measure("explorer j/k spaced", `window.__perf.spaced(["j", "k"], ${SPACED_PRESSES}, () => document.querySelector(".entry.selected"))`, SPACED_PRESSES));
  results.push(await measure("explorer j burst", `window.__perf.burst("j", 12, () => document.querySelector(".entry.selected"))`, 12));
  // Collect first so the retained JS heap is comparable between runs instead of reflecting GC timing.
  await call("HeapProfiler.collectGarbage");
  console.log(JSON.stringify({ product, boot, heapUsedBytes: (await metrics()).JSHeapUsedSize }));

  if (profileCpu) {
    for (const { name, profile: cpu } of profiles) {
      const self = new Map();
      const interval = (cpu.endTime - cpu.startTime) / Math.max(1, cpu.samples.length);
      for (const node of cpu.nodes) {
        const frame = node.callFrame;
        const key = `${frame.functionName || "(anonymous)"} ${frame.url.split("/").pop()}:${frame.lineNumber}`;
        self.set(key, (self.get(key) ?? 0) + (node.hitCount ?? 0) * interval / 1000);
      }
      const top = [...self].filter(([key]) => !key.startsWith("(idle)") && !key.startsWith("(program)")).sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([fn, ms]) => ({ fn, ms: Math.round(ms * 10) / 10 }));
      const sum = filter => Math.round([...self].filter(([key]) => filter(key)).reduce((s, [, ms]) => s + ms, 0) * 10) / 10;
      console.log(JSON.stringify({ profile: name, busyMs: sum(key => !key.startsWith("(idle)") && !key.startsWith("(program)")), wasmMs: sum(key => key.startsWith("wasm-function")), top }));
    }
  }
  await send("Browser.close");
} finally {
  socket?.close();
  if (edge.exitCode === null) edge.kill();
  await new Promise(r => server.close(r));
  await new Promise(r => setTimeout(r, 500));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
