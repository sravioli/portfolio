import { createRequire } from "node:module";
import Parser from "web-tree-sitter";
import type { Element, ElementContent } from "hast";

const KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "for", "function", "goto", "if", "in",
  "local", "not", "or", "repeat", "return", "then", "until", "while",
]);

interface Span {
  start: number;
  end: number;
  className: string[];
}

await Parser.init();
const wasm = createRequire(import.meta.url).resolve("tree-sitter-wasms/out/tree-sitter-lua.wasm");
const parser = new Parser();
parser.setLanguage(await Parser.Language.load(wasm));

const same = (a: Parser.SyntaxNode | null, b: Parser.SyntaxNode): boolean =>
  a !== null && a.type === b.type && a.startIndex === b.startIndex && a.endIndex === b.endIndex;

function isFunctionName(node: Parser.SyntaxNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (parent.type === "local_function_definition_statement") {
    return same(parent.childForFieldName("name"), node);
  }
  if (parent.type !== "variable" || same(parent.childForFieldName("table"), node)) return false;
  const owner = parent.parent;
  if (!owner) return false;
  return (
    (owner.type === "call" || owner.type === "function_definition_statement") &&
    same(owner.childForFieldName(owner.type === "call" ? "function" : "name"), parent)
  );
}

function classify(node: Parser.SyntaxNode): string[] | undefined {
  switch (node.type) {
    case "string":
      return ["hljs-string"];
    case "comment":
      return ["hljs-comment"];
    case "number":
      return ["hljs-number"];
    case "nil":
    case "true":
    case "false":
      return ["hljs-literal"];
    case "identifier":
      return isFunctionName(node) ? ["hljs-title", "function_"] : undefined;
    default:
      return !node.isNamed() && KEYWORDS.has(node.type) ? ["hljs-keyword"] : undefined;
  }
}

function collect(node: Parser.SyntaxNode, spans: Span[]): void {
  const className = classify(node);
  if (className) {
    spans.push({ start: node.startIndex, end: node.endIndex, className });
    if (node.type === "string" || node.type === "comment") return;
  }
  for (const child of node.children) collect(child, spans);
}

export function highlightLua(source: string): ElementContent[] {
  const spans: Span[] = [];
  const tree = parser.parse(source);
  try {
    collect(tree.rootNode, spans);
  } finally {
    tree.delete();
  }
  spans.sort((a, b) => a.start - b.start);

  const out: ElementContent[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) out.push({ type: "text", value: source.slice(cursor, span.start) });
    const element: Element = {
      type: "element",
      tagName: "span",
      properties: { className: span.className },
      children: [{ type: "text", value: source.slice(span.start, span.end) }],
    };
    out.push(element);
    cursor = span.end;
  }
  if (cursor < source.length) out.push({ type: "text", value: source.slice(cursor) });
  return out;
}
