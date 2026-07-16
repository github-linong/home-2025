import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSimpleFrontmatter } from "../lib/frontmatter.mjs";
import {
  shouldIncludeInSitemap,
  isSitemapWorthyDemo,
  parseCuratedDemoSlugsFromSource,
} from "../lib/seo.mjs";

const IGNORE_SEGMENTS = new Set(["404", "500"]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "../..");

/**
 * Build allowlist of demo slugs for sitemap (non-legacy + curated + blog-linked).
 * @param {string} [demosDir]
 * @param {string} [curatedFile]
 * @returns {Set<string>}
 */
export function loadDemoSitemapAllowlist(
  demosDir = join(webRoot, "src/content/demos"),
  curatedFile = join(webRoot, "src/data/curated-demos.ts"),
) {
  const curated = existsSync(curatedFile)
    ? parseCuratedDemoSlugsFromSource(readFileSync(curatedFile, "utf8"))
    : new Set();

  const allow = new Set();
  if (!existsSync(demosDir)) return allow;

  for (const name of readdirSync(demosDir)) {
    if (!name.endsWith(".md") && !name.endsWith(".mdx")) continue;
    const slug = name.replace(/\.mdx?$/, "");
    const meta = parseSimpleFrontmatter(readFileSync(join(demosDir, name), "utf8"));
    if (
      isSitemapWorthyDemo(
        {
          slug,
          tags: /** @type {string[]} */ (meta.tags || []),
          relatedPosts: /** @type {string[]} */ (meta.relatedPosts || []),
          badge: /** @type {string|undefined} */ (meta.badge),
        },
        curated,
      )
    ) {
      allow.add(slug);
    }
  }
  return allow;
}

/**
 * @param {string} distDir
 * @param {string} siteBase
 * @param {{ demoAllowlist?: Set<string> | null }} [options]
 * @returns {{ loc: string, lastmod: string }[]}
 */
export function collectSitemapEntries(distDir, siteBase, options = {}) {
  const entries = [];
  const filterOpts = { demoAllowlist: options.demoAllowlist ?? null };

  function walk(currentDir, urlPath) {
    const names = readdirSync(currentDir);
    const hasIndex = names.includes("index.html");
    const segment = urlPath.replace(/^\/|\/$/g, "");

    if (hasIndex && !IGNORE_SEGMENTS.has(segment)) {
      const pathname = urlPath || "/";
      if (shouldIncludeInSitemap(pathname, filterOpts)) {
        const indexPath = join(currentDir, "index.html");
        const mtime = statSync(indexPath).mtime.toISOString();
        entries.push({
          loc: new URL(pathname, siteBase).href,
          lastmod: mtime.slice(0, 10),
        });
      }
    }

    for (const name of names) {
      if (name === "index.html") continue;
      const full = join(currentDir, name);
      if (!statSync(full).isDirectory()) continue;
      walk(full, `${urlPath}${name}/`);
    }
  }

  walk(distDir, "/");
  return entries.sort((a, b) => a.loc.localeCompare(b.loc));
}

/**
 * Sitemap generator that walks the static dist output, drops thin/utility URLs,
 * and keeps only crawl-worthy demos for Baidu budget.
 */
export function lilnongSitemap() {
  return {
    name: "lilnong-sitemap",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const site = process.env.SITE_URL ?? "https://www.lilnong.top";
        const base = site.endsWith("/") ? site : `${site}/`;
        const outDir = dir.pathname;
        const demoAllowlist = loadDemoSitemapAllowlist();
        const entries = collectSitemapEntries(outDir, base, { demoAllowlist });

        const urlEntries = entries
          .map(
            ({ loc, lastmod }) =>
              `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
          )
          .join("\n");

        writeFileSync(
          join(outDir, "sitemap-0.xml"),
          `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`,
          "utf8",
        );

        writeFileSync(
          join(outDir, "sitemap-index.xml"),
          `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${new URL("sitemap-0.xml", base).href}</loc></sitemap>
</sitemapindex>`,
          "utf8",
        );

        logger.info(
          `[lilnong-sitemap] wrote ${entries.length} URLs (demo allowlist ${demoAllowlist.size})`,
        );
      },
    },
  };
}
