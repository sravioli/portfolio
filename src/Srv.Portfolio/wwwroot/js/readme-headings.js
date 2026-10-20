const HEADING_SELECTOR = "h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]";

export function getHeadingElements(root) {
  return [...root.querySelectorAll(HEADING_SELECTOR)];
}

export function readHeading(heading) {
  return {
    id: heading.id,
    title: heading.textContent.trim(),
    level: Number(heading.tagName.slice(1)),
  };
}

function pruneAncestors(path, heading) {
  while (path.length && path[path.length - 1].level >= heading.level)
    path.pop();
}

export function getActiveHeadings(headings, top) {
  const path = [];
  for (const heading of headings) {
    if (heading.top > top) break;
    const activeHeading = {
      id: heading.id,
      title: heading.title,
      level: heading.level,
    };
    pruneAncestors(path, activeHeading);
    path.push(activeHeading);
  }
  return path;
}

export function buildHeadingTree(headings) {
  const path = [];
  return headings.map((heading) => {
    pruneAncestors(path, heading);
    const node = {
      ...heading,
      parent: path.length ? path[path.length - 1].id : null,
    };
    path.push(node);
    return node;
  });
}
