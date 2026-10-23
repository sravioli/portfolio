import type { APIRoute, GetStaticPaths } from "astro";
import { documentAssetPaths, loadDocument } from "../../build/documents.ts";

export const getStaticPaths = documentAssetPaths satisfies GetStaticPaths;

/** Rendered article body, fetched when the client opens a document without a page load. */
export const GET: APIRoute = async ({ props }) =>
  new Response((await loadDocument(props.entry)).html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
