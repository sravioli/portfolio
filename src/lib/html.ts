const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Renders an attribute, omitting it when the value is null or false. */
export function attr(name: string, value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === false) return "";
  return value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
}
