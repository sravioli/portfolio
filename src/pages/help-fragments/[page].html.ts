import type { APIRoute, GetStaticPaths } from "astro";
import { loadHelp } from "../../build/help.ts";

export const getStaticPaths = (async () => {
  const help = await loadHelp();
  return help.documents.map((document) => ({
    params: { page: document.name },
    props: { html: help.html[document.name] },
  }));
}) satisfies GetStaticPaths;

/** Rendered help file, fetched when `:help` opens it without a page load. */
export const GET: APIRoute = ({ props }) =>
  new Response(props.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
