export const THEME_STORAGE_KEY = "portfolio.theme";

const BACKGROUNDS = { wave: "#1f1f28", lotus: "#f2ecbc" } as const;

// Runs in the head before the body is painted, including pages without the app controller.
export const THEME_INIT_SCRIPT =
  `(()=>{let theme="wave";try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="lotus")theme="lotus"}catch{}` +
  `document.documentElement.dataset.theme=theme;` +
  `document.querySelector('meta[name="theme-color"]').content=${JSON.stringify(BACKGROUNDS)}[theme]})()`;

export function syncThemeToggle(): void {
  document.querySelector('[data-action="toggle-theme"]')?.setAttribute(
    "aria-pressed",
    String(document.documentElement.dataset.theme === "lotus"),
  );
}

export function toggleTheme(): void {
  const theme = document.documentElement.dataset.theme === "lotus" ? "wave" : "lotus";
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta !== null) meta.content = BACKGROUNDS[theme];
  syncThemeToggle();
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies to this visit.
  }
}
