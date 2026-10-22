// Attributes owned by the browser or by other client modules; a re-render must not reset them.
const PRESERVED_ATTRIBUTES = new Set(["open", "data-pick-label"]);

// Elements whose content another module owns, such as the search position the search module fills in.
const OWNED_ELEMENTS = new Set(["search-position"]);

const template = (): HTMLTemplateElement => document.createElement("template");

/**
 * Patches the children of `target` to match `html`, keeping existing elements (and so focus, scroll
 * positions, and listeners) wherever the structure is unchanged.
 */
export function morph(target: Element, html: string): void {
  const source = template();
  source.innerHTML = html;
  patchChildren(target, source.content);
}

function patchChildren(target: Node, source: Node): void {
  let current = target.firstChild;
  for (const next of [...source.childNodes]) {
    if (current === null) {
      target.appendChild(next);
      continue;
    }
    const following: ChildNode | null = current.nextSibling;
    patchNode(current, next);
    current = following;
  }
  while (current !== null) {
    const following: ChildNode | null = current.nextSibling;
    current.remove();
    current = following;
  }
}

function patchNode(current: ChildNode, next: ChildNode): void {
  if (
    current.nodeType !== next.nodeType ||
    (current instanceof Element && current.tagName !== (next as Element).tagName)
  ) {
    current.replaceWith(next);
    return;
  }
  if (!(current instanceof Element)) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  if (OWNED_ELEMENTS.has(current.id)) return;
  patchAttributes(current, next as Element);
  patchChildren(current, next);
}

function patchAttributes(current: Element, next: Element): void {
  for (const { name } of [...current.attributes])
    if (!PRESERVED_ATTRIBUTES.has(name) && !next.hasAttribute(name)) current.removeAttribute(name);
  for (const { name, value } of next.attributes)
    if (current.getAttribute(name) !== value) current.setAttribute(name, value);
}

/** Morphs only when the markup differs from what was last applied to the same target. */
export class Region {
  #html: string | null = null;
  readonly element: Element;

  constructor(element: Element) {
    this.element = element;
  }

  update(html: string): void {
    if (html === this.#html) return;
    this.#html = html;
    morph(this.element, html);
  }
}
