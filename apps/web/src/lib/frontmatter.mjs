/**
 * Lightweight YAML-ish frontmatter helpers for build scripts (no deps).
 */

/**
 * @param {string} raw file contents
 * @returns {Record<string, unknown>}
 */
export function parseSimpleFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = m[1];
  /** @type {Record<string, unknown>} */
  const out = {};

  out.tags = parseStringList(fm, "tags");
  out.relatedPosts = parseStringList(fm, "relatedPosts");

  const badge = fm.match(/^badge:\s*["']?(.+?)["']?\s*$/m);
  if (badge) out.badge = badge[1].trim();

  const title = fm.match(/^title:\s*["'](.+?)["']\s*$/m) || fm.match(/^title:\s*(.+)\s*$/m);
  if (title) out.title = title[1].trim();

  const pubDate = fm.match(/^pubDate:\s*["']?(.+?)["']?\s*$/m);
  if (pubDate) out.pubDate = pubDate[1].trim();

  const updatedDate = fm.match(/^updatedDate:\s*["']?(.+?)["']?\s*$/m);
  if (updatedDate) out.updatedDate = updatedDate[1].trim();

  const sourceUrl = fm.match(/^sourceUrl:\s*["']?(.+?)["']?\s*$/m);
  if (sourceUrl) out.sourceUrl = sourceUrl[1].trim();

  return out;
}

/**
 * @param {string} fm
 * @param {string} key
 * @returns {string[]}
 */
function parseStringList(fm, key) {
  const inline = fm.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m"));
  if (inline) {
    return inline[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  const block = fm.match(new RegExp(`^${key}:\\s*\\n((?:\\s*-\\s*.+\\n?)+)`, "m"));
  if (!block) return [];
  return [...block[1].matchAll(/-\s*(.+)/g)].map((x) =>
    x[1].trim().replace(/^["']|["']$/g, ""),
  );
}
