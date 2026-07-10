import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const IGNORE_SEGMENTS = new Set(["404", "500"]);

function collectUrls(distDir, siteBase) {
  const urls = new Set();

  function walk(currentDir, urlPath) {
    const entries = readdirSync(currentDir);
    const hasIndex = entries.includes("index.html");

    if (hasIndex && !IGNORE_SEGMENTS.has(urlPath.replace(/^\/|\/$/g, ""))) {
      urls.add(new URL(urlPath || "/", siteBase).href);
    }

    for (const name of entries) {
      if (name === "index.html") continue;
      const full = join(currentDir, name);
      if (!statSync(full).isDirectory()) continue;
      const nextPath = `${urlPath}${name}/`;
      walk(full, nextPath);
    }
  }

  walk(distDir, "/");
  return [...urls].sort();
}

/**
 * Sitemap generator that walks the static dist output (includes paginated routes).
 */
export function lilnongSitemap() {
  return {
    name: "lilnong-sitemap",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const site = process.env.SITE_URL ?? "https://www.lilnong.top";
        const base = site.endsWith("/") ? site : `${site}/`;
        const outDir = dir.pathname;
        const urls = collectUrls(outDir, base);

        const urlEntries = urls
          .map((loc) => `  <url><loc>${loc}</loc></url>`)
          .join("\n");

        writeFileSync(
          join(outDir, "sitemap-0.xml"),
          `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`,
          "utf8"
        );

        writeFileSync(
          join(outDir, "sitemap-index.xml"),
          `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${new URL("sitemap-0.xml", base).href}</loc></sitemap>
</sitemapindex>`,
          "utf8"
        );

        logger.info(`[lilnong-sitemap] wrote ${urls.length} URLs`);
      },
    },
  };
}
