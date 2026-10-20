import { readFile } from "node:fs/promises";

// Data URL modules need absolute imports; overrides keep each suite's stubs local.
export async function importSourceModule(url, overrides = {}, importBase = url) {
    const source = (await readFile(url, "utf8"))
        .replace(/(\bfrom\s+)(["'])(\.[^"']+)\2/g, (_, prefix, quote, specifier) =>
            prefix + JSON.stringify(overrides[specifier] ?? new URL(specifier, importBase).href));
    return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

export function importHomeModule(overrides = {}) {
    const url = new URL("../../../src/Srv.Portfolio/Pages/Home.razor.js", import.meta.url);
    // Blazor serves collocated scripts under wwwroot/Pages, not their source directory.
    return importSourceModule(url, overrides, new URL("../wwwroot/Pages/Home.razor.js", url));
}
