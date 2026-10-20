let overlay = null;
let restoreFocus = null;

export function isOpen() {
    return overlay !== null;
}

export function open(image) {
    const source = image?.currentSrc || image?.src;
    if (!source) return false;
    close();
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay = document.createElement("div");
    overlay.className = "image-viewer";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", image.alt ? `Image preview: ${image.alt}` : "Image preview");
    overlay.tabIndex = -1;
    const picture = document.createElement("img");
    picture.src = source;
    picture.alt = image.alt ?? "";
    const caption = document.createElement("div");
    caption.className = "image-viewer-hint";
    caption.textContent = image.alt ? `${image.alt} — Esc to close` : "Esc to close";
    overlay.append(picture, caption);
    overlay.addEventListener("click", close);
    document.body.append(overlay);
    overlay.focus({ preventScroll: true });
    return true;
}

export function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    const target = restoreFocus?.isConnected && restoreFocus !== document.body
        ? restoreFocus
        : document.querySelector(".preview-scroll");
    target?.focus({ preventScroll: true });
    restoreFocus = null;
}

// Every key is swallowed while the viewer is open; Esc, q and Enter close it.
export function handleKey(key) {
    if (key === "Escape" || key === "q" || key === "Enter") close();
}
