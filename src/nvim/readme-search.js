let root;
let matches = [];
let activeIndex = -1;
let currentQuery = "";
let highlightsVisible = true;

function updatePosition() {
  const indicator = document.querySelector("#search-position");
  if (indicator) {
    indicator.textContent =
      matches.length > 0
        ? `${currentQuery} ${activeIndex + 1}/${matches.length}`
        : "";
    indicator.hidden = matches.length === 0 || !highlightsVisible;
  }
}

function clear() {
  for (const match of root?.querySelectorAll("mark.readme-search-match") ?? []) {
    match.replaceWith(document.createTextNode(match.textContent ?? ""));
  }
  root?.classList.remove("readme-search-hidden");
  root?.normalize();
  root = undefined;
  matches = [];
  activeIndex = -1;
  currentQuery = "";
  highlightsVisible = true;
  updatePosition();
}

function activate(index) {
  if (matches.length === 0) return -1;
  highlightsVisible = true;
  root?.classList.remove("readme-search-hidden");
  activeIndex = (index + matches.length) % matches.length;
  updatePosition();
  matches.forEach((match, matchIndex) => {
    match.classList.toggle("active", matchIndex === activeIndex);
  });
  matches[activeIndex].scrollIntoView({ block: "center", inline: "nearest" });
  return activeIndex;
}

export function search(searchQuery) {
  clear();
  currentQuery = searchQuery;
  updatePosition();
  root = document.querySelector(".readme-content, .raw-readme");
  if (!root || !searchQuery) return 0;

  const searchText = searchQuery.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest("script, style, mark.readme-search-match")) {
      textNodes.push(node);
    }
  }

  for (const node of textNodes) {
    const text = node.textContent ?? "";
    const lowerText = text.toLowerCase();
    const fragment = document.createDocumentFragment();
    let offset = 0;
    let found = false;

    while (offset < text.length) {
      const matchIndex = lowerText.indexOf(searchText, offset);
      if (matchIndex < 0) break;

      if (matchIndex > offset) {
        fragment.append(document.createTextNode(text.slice(offset, matchIndex)));
      }
      const match = document.createElement("mark");
      match.className = "readme-search-match";
      match.textContent = text.slice(matchIndex, matchIndex + searchQuery.length);
      fragment.append(match);
      matches.push(match);
      offset = matchIndex + searchQuery.length;
      found = true;
    }

    if (found) {
      if (offset < text.length) {
        fragment.append(document.createTextNode(text.slice(offset)));
      }
      node.replaceWith(fragment);
    }
  }

  if (matches.length > 0) activate(0);
  return matches.length;
}

export function move(direction, count = 1) {
  if (matches.length === 0) return -1;
  return activate(activeIndex + direction * count);
}

export function activeMatch() {
  return matches[activeIndex] ?? null;
}

export function hideHighlights() {
  highlightsVisible = false;
  root?.classList.add("readme-search-hidden");
  updatePosition();
}

export { clear };
