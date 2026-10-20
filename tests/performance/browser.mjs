import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join, extname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import assert from "node:assert/strict";

if (!process.argv[2]) throw new Error("Pass the published wwwroot directory.");
const root = resolve(process.argv[2]);
const usePublishedSnapshots = process.argv.includes("--published-snapshots");
const profile = await mkdtemp(join(tmpdir(), "portfolio-perf-"));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  if (req.url === "/measurement.html") {
    res.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>Measurement</title><body></body>");
    return;
  }
  const path = resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname).replaceAll("/", sep));
  if (!path.startsWith(root + sep) && path !== root) { res.writeHead(403).end(); return; }
  try {
    const file = path === root || path.endsWith(sep) ? join(path, "index.html") : path;
    const content = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" }).end(content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") res.writeHead(404).end("Not found");
    else {
      console.error(error);
      res.writeHead(500).end("File read failed");
    }
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
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
    edge.once("error", error => { clearTimeout(timeout); reject(error); });
    edge.once("exit", code => { clearTimeout(timeout); reject(new Error(`Edge exited ${code}: ${stderr}`)); });
  });
  socket = new WebSocket(endpoint);
  await once(socket, "open");
  let id = 0;
  const pending = new Map();
  const diagnostics = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (["Runtime.exceptionThrown", "Runtime.consoleAPICalled", "Log.entryAdded"].includes(message.method))
      diagnostics.push(message.params);
    const task = pending.get(message.id);
    if (task) {
      pending.delete(message.id);
      clearTimeout(task.timeout);
      if (message.error) task.reject(new Error(JSON.stringify(message.error)));
      else task.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const callId = ++id;
    const timeout = setTimeout(() => {
      pending.delete(callId);
      reject(new Error(`CDP timeout: ${method}`));
    }, 60000);
    pending.set(callId, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  console.log(JSON.stringify(await send("Browser.getVersion")));
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  await send("Target.activateTarget", { targetId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify({ exception: result.exceptionDetails, diagnostics: diagnostics.slice(-10) }));
    return result.result.value;
  };
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Log.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  let readmeRequests = 0;
  let snapshotRequests = 0;
  const externalSource = "# Local performance fixture\n\n" + Array.from({ length: 200 }, (_, i) =>
    `## Section ${i}\n\nRepresentative text with [memo](https://github.com/sravioli/memo.wz).\n\n`,
  ).join("");
  const externalHtml = '<h1 id="readme-local-performance-fixture">Local performance fixture</h1>\n' +
    Array.from({ length: 200 }, (_, i) =>
      `<h2 id="readme-section-${i}">Section ${i}</h2>\n<p>Representative text with <a href="https://github.com/sravioli/memo.wz">memo</a>.</p>\n`,
    ).join("");
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method !== "Fetch.requestPaused") return;
    const raw = message.params.request.url.startsWith("https://raw.githubusercontent.com/");
    const snapshot = message.params.request.url.startsWith(origin + "/readmes/");
    if (raw) readmeRequests++;
    if (snapshot) snapshotRequests++;
    if (snapshot && usePublishedSnapshots) {
      void send("Fetch.continueRequest", { requestId: message.params.requestId }, message.sessionId);
      return;
    }
    const segments = new URL(message.params.request.url).pathname.split("/");
    const body = snapshot ? JSON.stringify({
      Repository: decodeURIComponent(segments.at(-2)),
      ReadmePath: Buffer.from(segments.at(-1).slice(0, -5), "hex").toString("utf8"),
      Source: externalSource,
      Html: externalHtml,
    }) : raw ? externalSource : "[]";
    void send("Fetch.fulfillRequest", {
      requestId: message.params.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: "Content-Type", value: raw ? "text/plain" : "application/json" },
        { name: "Access-Control-Allow-Origin", value: "*" },
      ],
      body: Buffer.from(body).toString("base64"),
    }, message.sessionId);
  });
  await call("Fetch.enable", { patterns: [
    { urlPattern: "https://raw.githubusercontent.com/*" },
    { urlPattern: "https://api.github.com/*" },
    { urlPattern: origin + "/readmes/*" },
  ] });
  await call("Page.navigate", { url: origin });
  const deadline = Date.now() + 60000;
  while (!(await evaluate('!!document.querySelector(".welcome-screen")'))) {
    if (Date.now() > deadline) throw new Error("Published app startup timeout");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await evaluate('import("/Pages/Home.razor.js").then(module => Object.keys(module))');
  const { result: documentObject } = await call("Runtime.evaluate", { expression: "document" });
  const keyboardDeadline = Date.now() + 10000;
  for (;;) {
    const { listeners } = await call("DOMDebugger.getEventListeners", { objectId: documentObject.objectId });
    // Home installs keyboard and image-error handlers together; Blazor's delegates are in another script.
    if (listeners.some(listener => listener.type === "error" && listeners.some(
      key => key.type === "keydown" && key.scriptId === listener.scriptId,
    ))) break;
    if (Date.now() > keyboardDeadline) throw new Error("Published app keyboard initialization timeout: " + JSON.stringify({
      listeners: (await call("DOMDebugger.getEventListeners", { objectId: documentObject.objectId })).listeners,
      diagnostics: diagnostics.slice(-10),
    }));
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  console.log(JSON.stringify(await evaluate(`({
    startupMs: performance.now(),
    resources: performance.getEntriesByType("resource").length,
    decodedBytes: performance.getEntriesByType("resource").reduce((sum, entry) => sum + entry.decodedBodySize, 0)
  })`)));
  const ui = await evaluate(`(async () => {
    const waitFor = async (predicate) => {
      for (let i = 0; i < 400; i++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error("Published app interaction timeout: " + predicate.toString() + " " + JSON.stringify({
        scripts: performance.getEntriesByType("resource").filter(entry => entry.name.endsWith(".js")).map(entry => entry.name),
        reading: document.querySelector(".portfolio-shell")?.dataset.reading,
        cursor: document.querySelector(".nvim-cursor")?.outerHTML,
        error: document.querySelector("#blazor-error-ui")?.style.display,
      }));
    };
    const doubleClick = element => element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const key = value => document.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
    document.querySelector(".entry").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await waitFor(() => document.querySelector(".readme-content h1"));
    await waitFor(() => document.querySelector(".nvim-cursor")?.dataset.visible === "true");
    const article = document.querySelector(".readme-content");
    if (!article?.querySelector("h1")) throw new Error("Root README did not render");
    const rootHeadings = article.querySelectorAll("h1,h2,h3,h4,h5,h6").length;
    key("p");
    await waitFor(() => document.querySelector(".raw-line")?.textContent.startsWith("# Hi"));
    key("p");
    await waitFor(() => document.querySelector(".readme-content h1"));
    const folder = [...document.querySelectorAll(".entry")].find(entry => entry.textContent.includes("chrono/"));
    const originalCount = document.querySelectorAll(".entry").length;
    folder.click();
    await waitFor(() => document.querySelectorAll(".entry").length === originalCount + 1);
    folder.click();
    await waitFor(() => document.querySelectorAll(".entry").length === originalCount);
    folder.click();
    await waitFor(() => folder.getAttribute("aria-expanded") === "true");
    const opening = performance.now();
    doubleClick(folder.nextElementSibling);
    await waitFor(() => document.querySelector(".readme-content h1")?.textContent === "Local performance fixture");
    const externalOpenMs = performance.now() - opening;
    if (document.querySelectorAll(".readme-content h2").length !== 200)
      throw new Error("External Markdown rendering changed");
    key("G");
    await waitFor(() => [...document.querySelectorAll(".heading-crumb")].some(crumb => crumb.textContent.includes("Section 199")));
    key("p");
    await waitFor(() => document.querySelector(".raw-line")?.textContent === "# Local performance fixture");
    key("p");
    await waitFor(() => document.querySelector(".readme-content h1")?.textContent === "Local performance fixture");
    key("-");
    await waitFor(() => document.querySelector(".portfolio-shell").dataset.reading === "false");
    doubleClick(folder.nextElementSibling);
    await waitFor(() => document.querySelector(".readme-content h1")?.textContent === "Local performance fixture");
    return { rootHeadings, externalHeadings: 201, rawToggle: true, folderToggle: true, bottomBreadcrumb: true, reopen: true, externalOpenMs };
  })()`);
  assert.equal(ui.rootHeadings, 3);
  assert.equal(readmeRequests + snapshotRequests, 1, "Reopening a README must reuse its source cache");
  const rendererResources = await evaluate(`performance.getEntriesByType("resource").filter(entry =>
    /\\/(Srv\\.Portfolio\\.Rendering|AngleSharp|HtmlSanitizer|Markdig|System\\.Text\\.Encoding\\.CodePages)[.]/.test(new URL(entry.name).pathname)
  ).map(entry => ({ url: entry.name, decodedBytes: entry.decodedBodySize }))`);
  if (snapshotRequests) assert.equal(rendererResources.length, 0, "Snapshots must not load the Markdown renderer");
  console.log(JSON.stringify({ ...ui, readmeRequests, snapshotRequests, rendererResources }));
  await evaluate(`(async () => {
    const waitFor = async predicate => {
      for (let i = 0; i < 400; i++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error("Dynamic collection interaction timeout: " + predicate.toString());
    };
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true }));
    await waitFor(() => document.querySelector(".portfolio-shell").dataset.reading === "false");
    const folder = [...document.querySelectorAll(".entry")].find(entry => entry.textContent.includes("wezterm-plugins/"));
    if (folder.getAttribute("aria-expanded") !== "true") folder.click();
    await waitFor(() => folder.getAttribute("aria-expanded") === "true");
    folder.nextElementSibling.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await waitFor(() => document.querySelector(".readme-content h1")?.textContent === "WezTerm plugins");
    if (!document.querySelector(".readme-content").textContent.includes("Non-blocking update notifications."))
      throw new Error("Dynamic collection lost catalog description fallback");
  })()`);
  const dynamicRendererLoaded = await evaluate(`performance.getEntriesByType("resource").some(entry =>
    /\\/Srv\\.Portfolio\\.Rendering[.]/.test(new URL(entry.name).pathname))`);
  assert.equal(dynamicRendererLoaded, true, "Dynamic collection must retain lazy renderer support");
  console.log(JSON.stringify({ dynamicCollection: true, dynamicRendererLoaded }));
  // Isolate geometry measurements from Blazor's event/render loop.
  await call("Page.navigate", { url: origin + "/measurement.html" });
  const measurementDeadline = Date.now() + 10000;
  while (!(await evaluate('document.title === "Measurement"'))) {
    if (Date.now() > measurementDeadline) throw new Error("Measurement page navigation timeout");
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  console.log(JSON.stringify(await evaluate(`(async () => {
    const headings = await import("/js/readme-headings.js");
    document.body.innerHTML = "<main></main>";
    const root = document.querySelector("main");
    const cases = [];
    for (const size of [20, 2000]) {
      root.innerHTML = Array.from({length:size}, (_, i) =>
        "<h" + (i % 6 + 1) + " id='h" + i + "'>Section " + i + "</h" + (i % 6 + 1) + "><p>Representative README content.</p>"
      ).join("");
      const elements = headings.getHeadingElements(root);
      let reads = 0;
      for (const heading of elements) {
        const original = heading.getBoundingClientRect.bind(heading);
        heading.getBoundingClientRect = () => { reads++; return original(); };
      }
      const index = headings.createHeadingIndex?.(root);
      const buildTimes = [];
      if (index) {
        for (let sample = 0; sample < 21; sample++) {
          const start = performance.now();
          headings.createHeadingIndex(root);
          buildTimes.push(performance.now() - start);
        }
        buildTimes.sort((a,b) => a-b);
      }
      const lookup = top => index ? index.active(top) : headings.getActiveHeadings(
        headings.getHeadingElements(root).map(heading => ({
          ...headings.readHeading(heading), top: heading.getBoundingClientRect().top,
        })), top);
      const targets = [0, Math.floor(size / 2), size - 1].map(i => elements[i].getBoundingClientRect().top + 1);
      let checksum = 0;
      const run = () => { for (const top of targets) checksum += lookup(top).length; };
      for (let i = 0; i < 50; i++) run();
      reads = 0;
      const times = [];
      for (let sample = 0; sample < 31; sample++) {
        const start = performance.now();
        for (let i = 0; i < 20; i++) run();
        times.push((performance.now() - start) / 60);
      }
      times.sort((a,b) => a-b);
      const rectReadsPerReport = reads / (31 * 60);
      for (const top of targets) {
        const expected = headings.getActiveHeadings(elements.map(heading => ({
          ...headings.readHeading(heading), top: heading.getBoundingClientRect().top,
        })), top);
        if (JSON.stringify(lookup(top)) !== JSON.stringify(expected))
          throw new Error("Indexed headings differ from linear reference");
      }
      cases.push({ size, medianMs: times[15], p95Ms: times[29], rectReadsPerReport, indexBuildMedianMs: buildTimes[10] ?? null, checksum });
    }
    return cases;
  })()`)));
  await send("Browser.close");
} finally {
  socket?.close();
  if (edge.exitCode === null) edge.kill();
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => setTimeout(resolve, 500));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
