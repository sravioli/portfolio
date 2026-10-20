// dropbar.nvim-style breadcrumb picker: letter labels on each segment, then nested menus.
const LABELS = "abcdefghijklmnopqrstuvwxyz";
const ICONS = { readme: "\u{f48a}", file: "\u{f48a}", folder: "\u{f024b}" };
const MODIFIERS = ["Shift", "Control", "Alt", "Meta", "CapsLock"];

let state = null;
let actions = { loadMenu: async () => [], open: () => { }, jump: () => { } };

export function configure(handlers) {
    actions = handlers;
}

export function isActive() {
    return state !== null;
}

export function buildHeadingTree(headings) {
    const stack = [];
    return headings.map(heading => {
        while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop();
        const node = { ...heading, parent: stack.length ? stack[stack.length - 1].id : null };
        stack.push(node);
        return node;
    });
}

export function headingItems(nodes, parent, currentId) {
    return nodes.filter(node => node.parent === parent).map(node => ({
        key: `heading:${node.id}`,
        label: node.title,
        kind: "heading",
        level: node.level,
        headingId: node.id,
        hasChildren: nodes.some(child => child.parent === node.id),
        current: node.id === currentId
    }));
}

function documentHeadings() {
    const article = document.querySelector(".readme-content");
    if (!article) return [];
    return buildHeadingTree([...article.querySelectorAll("h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]")]
        .map(heading => ({ id: heading.id, title: heading.textContent.trim(), level: Number(heading.tagName.slice(1)) })));
}

function activeHeadings() {
    return new Set([...document.querySelectorAll(".breadcrumb [data-readme-heading]")].map(crumb => crumb.dataset.readmeHeading));
}

export function start() {
    cancel();
    const breadcrumb = document.querySelector(".breadcrumb");
    const segments = [...(breadcrumb?.querySelectorAll("[data-pick-segment]") ?? [])].slice(0, LABELS.length);
    if (!segments.length) return false;
    segments.forEach((segment, index) => { segment.dataset.pickLabel = LABELS[index]; });
    breadcrumb.classList.add("picking");
    state = { segments, menus: [] };
    return true;
}

function clearLabels() {
    for (const segment of state?.segments ?? []) delete segment.dataset.pickLabel;
    document.querySelector(".breadcrumb")?.classList.remove("picking");
}

export function cancel() {
    if (!state) return;
    clearLabels();
    for (const menu of state.menus) menu.element.remove();
    state = null;
}

export async function openSegment(segment) {
    if (state) {
        clearLabels();
        for (const menu of state.menus) menu.element.remove();
    }
    state = { segments: [], menus: [] };
    const session = state;
    let items;
    const headingId = segment.dataset.readmeHeading;
    if (headingId) {
        const nodes = documentHeadings();
        const node = nodes.find(candidate => candidate.id === headingId);
        items = node ? headingItems(nodes, node.parent, headingId) : [];
    } else {
        items = await folderItems(segment.dataset.pickMenu ?? "", segment.dataset.pickCurrent);
    }
    if (state !== session) return;
    if (!items.length) {
        cancel();
        return;
    }
    const rect = segment.getBoundingClientRect();
    pushMenu(items, rect.left, rect.bottom + 2);
}

async function folderItems(repository, currentKey) {
    const items = (await actions.loadMenu(repository)) ?? [];
    return items.map(item => ({ ...item, current: item.key === currentKey }));
}

function pushMenu(items, left, top) {
    const element = document.createElement("div");
    element.className = "pick-menu";
    element.setAttribute("role", "menu");
    const menu = { element, items, index: Math.max(0, items.findIndex(item => item.current)) };
    items.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "pick-item" + (item.current ? " current" : "");
        row.setAttribute("role", "menuitem");
        const icon = document.createElement("span");
        icon.className = item.kind === "heading" ? "pick-icon heading-level" : `pick-icon pick-${item.kind}`;
        icon.textContent = item.kind === "heading" ? `H${item.level}` : ICONS[item.kind] ?? "";
        const text = document.createElement("span");
        text.className = "pick-text";
        text.textContent = item.label;
        const arrow = document.createElement("span");
        arrow.className = "pick-arrow";
        arrow.textContent = item.hasChildren ? "\u{f0142}" : "";
        row.append(icon, text, arrow);
        row.addEventListener("mouseenter", () => select(menu, index));
        row.addEventListener("click", event => {
            event.stopPropagation();
            select(menu, index);
            activate(false);
        });
        element.append(row);
    });
    element.addEventListener("click", event => event.stopPropagation());
    document.body.append(element);
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    element.style.left = `${Math.max(4, Math.min(left, window.innerWidth - width - 4))}px`;
    element.style.top = `${Math.max(4, Math.min(top, window.innerHeight - height - 4))}px`;
    state.menus.push(menu);
    select(menu, menu.index);
}

function select(menu, index) {
    menu.index = Math.min(menu.items.length - 1, Math.max(0, index));
    [...menu.element.children].forEach((row, rowIndex) => row.classList.toggle("selected", rowIndex === menu.index));
    menu.element.children[menu.index]?.scrollIntoView({ block: "nearest" });
}

async function expand(menu) {
    const item = menu.items[menu.index];
    const session = state;
    const children = item.kind === "heading"
        ? headingItems(documentHeadings(), item.headingId, null).map(child => ({ ...child, current: activeHeadings().has(child.headingId) }))
        : await folderItems(item.repository, null);
    if (state !== session || !children.length) return;
    const menuRect = menu.element.getBoundingClientRect();
    const rowRect = menu.element.children[menu.index].getBoundingClientRect();
    pushMenu(children, menuRect.right + 2, rowRect.top);
}

async function activate(preferSubmenu) {
    const menu = state?.menus[state.menus.length - 1];
    const item = menu?.items[menu.index];
    if (!item) return;
    if (item.kind === "folder" || (preferSubmenu && item.hasChildren)) {
        await expand(menu);
        return;
    }
    cancel();
    if (item.kind === "heading") actions.jump(item.headingId);
    else await actions.open(item.repository);
}

function back() {
    const menu = state.menus.pop();
    menu?.element.remove();
    if (!state.menus.length) cancel();
}

export async function handleKey(key) {
    if (!state || MODIFIERS.includes(key)) return;
    if (!state.menus.length) {
        const segment = state.segments[LABELS.indexOf(key)];
        if (key.length === 1 && segment?.isConnected) await openSegment(segment);
        else cancel();
        return;
    }
    const menu = state.menus[state.menus.length - 1];
    switch (key) {
        case "j": case "ArrowDown": case "<C-n>": select(menu, menu.index + 1); break;
        case "k": case "ArrowUp": case "<C-p>": select(menu, menu.index - 1); break;
        case "g": select(menu, 0); break;
        case "G": select(menu, menu.items.length - 1); break;
        case "l": case "ArrowRight": await activate(true); break;
        case "Enter": await activate(false); break;
        case "h": case "ArrowLeft": back(); break;
        case "Escape": case "q": cancel(); break;
    }
}
