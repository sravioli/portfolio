const HEADING_SELECTOR = "h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]";

export function getHeadingElements(root) {
    return [...root.querySelectorAll(HEADING_SELECTOR)];
}

export function readHeading(heading) {
    return {
        id: heading.id,
        title: heading.textContent.trim(),
        level: Number(heading.tagName.slice(1))
    };
}

function appendHeading(path, heading) {
    while (path.length && path[path.length - 1].level >= heading.level) path.pop();
    path.push(heading);
}

export function getActiveHeadings(headings, top) {
    const path = [];
    for (const heading of headings) {
        if (heading.top > top) break;
        appendHeading(path, { id: heading.id, title: heading.title, level: heading.level });
    }
    return path;
}

export function buildHeadingTree(headings) {
    const path = [];
    return headings.map(heading => {
        while (path.length && path[path.length - 1].level >= heading.level) path.pop();
        const node = { ...heading, parent: path.length ? path[path.length - 1].id : null };
        path.push(node);
        return node;
    });
}
