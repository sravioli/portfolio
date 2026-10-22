// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://sravio.li",
  output: "static",
  trailingSlash: "ignore",
  compressHTML: true,
  build: {
    format: "directory",
    // The whole stylesheet is small enough that inlining it beats an extra render-blocking request.
    inlineStylesheets: "always",
  },
  devToolbar: { enabled: false },
});
