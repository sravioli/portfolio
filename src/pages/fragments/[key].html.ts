import type { APIRoute, GetStaticPaths } from "astro";
import { loadDocument } from "../../build/documents.ts";
import { documentEntries } from "../../build/readmes.ts";
import { documentKey } from "../../lib/routes.ts";

export const getStaticPaths = (() =>
  documentEntries().map((entry) => ({
    params: { key: documentKey(entry) },
    props: { entry },
  }))) satisfies GetStaticPaths;

/** Rendered article body, fetched when the client opens a document without a page load. */
export const GET: APIRoute = async ({ props }) =>
  new Response((await loadDocument(props.entry)).html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
