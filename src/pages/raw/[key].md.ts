import type { APIRoute, GetStaticPaths } from "astro";
import { documentAssetPaths, loadDocument } from "../../build/documents.ts";

export const getStaticPaths = documentAssetPaths satisfies GetStaticPaths;

/** README source, used by the raw view, copying, and the file finder preview. */
export const GET: APIRoute = async ({ props }) =>
  new Response((await loadDocument(props.entry)).source, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
