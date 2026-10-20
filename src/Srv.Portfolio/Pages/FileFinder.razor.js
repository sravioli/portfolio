let dialog;
let previousFocus;

function onKeyDown(event) {
  if (event.isComposing) return;
  if (event.key === "Enter" && event.target instanceof HTMLButtonElement) {
    event.stopPropagation();
    return;
  }
  if (
    ["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key) ||
    (event.ctrlKey && ["j", "k", "n", "p"].includes(event.key))
  ) {
    event.preventDefault();
  }
}

function scrollSelection() {
  dialog
    ?.querySelector(".finder-result.selected")
    ?.scrollIntoView({ block: "nearest" });
  const preview = dialog?.querySelector(".finder-preview");
  if (preview) preview.scrollTop = 0;
}

const observer = new MutationObserver(scrollSelection);

export function open(element) {
  dialog = element;
  previousFocus = document.activeElement;
  dialog.showModal();
  dialog.addEventListener("keydown", onKeyDown);
  observer.observe(dialog.querySelector(".finder-list"), {
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-selected"],
    childList: true,
  });
  dialog.querySelector("input").focus();
}

export function close(restoreFocus) {
  observer.disconnect();
  dialog?.removeEventListener("keydown", onKeyDown);
  dialog?.close();
  if (
    restoreFocus &&
    previousFocus instanceof HTMLElement &&
    previousFocus.isConnected
  ) {
    previousFocus.focus({ preventScroll: true });
  }
  dialog = undefined;
  previousFocus = undefined;
}

export function dispose() {
  close(true);
}
