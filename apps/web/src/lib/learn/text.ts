/** Text helpers for the learn-english feature. */

export type PassageToken = { type: "word" | "sep"; value: string };

/** Lowercase a word and strip everything but letters / apostrophes / hyphens. */
export function normalizeLemma(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z'-]/g, "");
}

/** Split a passage body into word / separator tokens for clickable rendering. */
export function tokenizePassage(body: string): PassageToken[] {
  return body
    .split(/([A-Za-z][A-Za-z']*)/g)
    .filter((p) => p.length > 0)
    .map((value) =>
      /^[A-Za-z][A-Za-z']*$/.test(value)
        ? { type: "word" as const, value }
        : { type: "sep" as const, value },
    );
}

/** Minimal HTML escape for interpolating server text into innerHTML templates. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
