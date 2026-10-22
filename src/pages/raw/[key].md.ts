import type { APIRoute, GetStaticPaths } from "astro";
import { loadDocument } from "../../build/documents.ts";
import { documentEntries } from "../../build/readmes.ts";
import { documentKey } from "../../lib/routes.ts";

export const getStaticPaths = (() =>
  documentEntries().map((entry) => ({
    params: { key: documentKey(entry) },
    props: { entry },
  }))) satisfies GetStaticPaths;

/** README source, used by the raw view, copying, and the file finder preview. */
export const GET: APIRoute = async ({ props }) =>
  new Response((await loadDocument(props.entry)).source, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
