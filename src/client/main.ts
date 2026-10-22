import { start } from "./app.ts";

const errorUi = document.getElementById("error-ui");

function showErrorUi(): void {
  errorUi?.classList.add("visible");
}

window.addEventListener("error", showErrorUi);
window.addEventListener("unhandledrejection", showErrorUi);
errorUi?.querySelector(".dismiss")?.addEventListener("click", () => errorUi.classList.remove("visible"));
errorUi?.querySelector(".reload")?.addEventListener("click", (event) => {
  event.preventDefault();
  location.reload();
});
// Enter restarts the app while the error is showing, except on the dismiss button.
document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key !== "Enter" ||
      !errorUi?.classList.contains("visible") ||
      (event.target instanceof Element && event.target.closest(".dismiss") !== null)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.reload();
  },
  true,
);

try {
  start();
} catch (error) {
  showErrorUi();
  throw error;
}
