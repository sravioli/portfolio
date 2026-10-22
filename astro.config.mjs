// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.PAGES_SITE_URL || "https://sravioli.github.io",
  base: process.env.PAGES_BASE_PATH || "/",
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
