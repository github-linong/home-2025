import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  shouldIncludeInSitemap,
  normalizePathname,
  buildCanonicalUrl,
  buildArticleJsonLd,
  wrapJsonLdGraph,
  getBaiduCorePushUrls,
  isSitemapWorthyDemo,
} from "../src/lib/seo.mjs";
import { parseSimpleFrontmatter } from "../src/lib/frontmatter.mjs";
import {
  collectSitemapEntries,
  loadDemoSitemapAllowlist,
} from "../src/integrations/lilnong-sitemap.mjs";

test("normalizePathname strips query/hash and adds trailing slash", () => {
  assert.equal(normalizePathname("/blog/foo"), "/blog/foo/");
  assert.equal(normalizePathname("/blog/foo/?x=1#y"), "/blog/foo/");
  assert.equal(normalizePathname(""), "/");
});

test("buildCanonicalUrl prefers site base + pathname", () => {
  assert.equal(
    buildCanonicalUrl("https://www.lilnong.top", "/about"),
    "https://www.lilnong.top/about/",
  );
  assert.equal(
    buildCanonicalUrl("https://www.lilnong.top/", "https://lilnong.top/blog/x/?utm=1"),
    "https://www.lilnong.top/blog/x/",
  );
});

test("sitemap filter drops utility, pagination, notices, and tag lists", () => {
  assert.equal(shouldIncludeInSitemap("/"), true);
  assert.equal(shouldIncludeInSitemap("/about/"), true);
  assert.equal(shouldIncludeInSitemap("/blog/my-post/"), true);
  assert.equal(shouldIncludeInSitemap("/demos/waterfall/"), true);

  assert.equal(shouldIncludeInSitemap("/search/"), false);
  assert.equal(shouldIncludeInSitemap("/login/"), false);
  assert.equal(shouldIncludeInSitemap("/blog/search/"), false);
  assert.equal(shouldIncludeInSitemap("/demos/search/"), false);
  assert.equal(shouldIncludeInSitemap("/blog/2/"), false);
  assert.equal(shouldIncludeInSitemap("/demos/10/"), false);
  assert.equal(shouldIncludeInSitemap("/demos/archive/3/"), false);
  assert.equal(shouldIncludeInSitemap("/blog/tag/javascript/"), false);
  assert.equal(shouldIncludeInSitemap("/blog/notice-site-upgrade/"), false);
  assert.equal(shouldIncludeInSitemap("/demos/project/dashboard/001/"), false);
  assert.equal(shouldIncludeInSitemap("/demos/project/"), false);
  assert.equal(shouldIncludeInSitemap("/demos/project-dashboard/"), true);

  // Slug that starts with digits must still be kept
  assert.equal(shouldIncludeInSitemap("/blog/10-tips/"), true);
});

test("demo allowlist filters legacy mass archive from sitemap", () => {
  const allow = new Set(["cool-demo"]);
  assert.equal(
    shouldIncludeInSitemap("/demos/cool-demo/", { demoAllowlist: allow }),
    true,
  );
  assert.equal(
    shouldIncludeInSitemap("/demos/random-legacy/", { demoAllowlist: allow }),
    false,
  );
  assert.equal(
    shouldIncludeInSitemap("/demos/archive/", { demoAllowlist: allow }),
    true,
  );
});

test("isSitemapWorthyDemo keeps featured and curated legacy", () => {
  assert.equal(isSitemapWorthyDemo({ slug: "new", tags: [] }), true);
  assert.equal(isSitemapWorthyDemo({ slug: "old", tags: ["legacy"] }), false);
  assert.equal(
    isSitemapWorthyDemo({ slug: "old", tags: ["legacy"], badge: "精选" }),
    true,
  );
  assert.equal(
    isSitemapWorthyDemo({ slug: "curated", tags: ["legacy"] }, new Set(["curated"])),
    true,
  );
  assert.equal(
    isSitemapWorthyDemo({
      slug: "linked",
      tags: ["legacy"],
      relatedPosts: ["some-post"],
    }),
    true,
  );
});

test("parseSimpleFrontmatter reads inline tags arrays", () => {
  const meta = parseSimpleFrontmatter(`---
title: "x"
tags: ["jsrun", "legacy"]
badge: "精选"
relatedPosts: ["a", "b"]
---
body`);
  assert.deepEqual(meta.tags, ["jsrun", "legacy"]);
  assert.equal(meta.badge, "精选");
  assert.deepEqual(meta.relatedPosts, ["a", "b"]);
});

test("article JSON-LD includes isBasedOn for migrated posts", () => {
  const article = buildArticleJsonLd({
    headline: "标题",
    description: "描述",
    url: "https://www.lilnong.top/blog/x/",
    datePublished: "2026-07-16T00:00:00.000Z",
    isBasedOn: "https://segmentfault.com/a/119000001",
  });
  const graph = wrapJsonLdGraph(article);
  assert.equal(graph["@context"], "https://schema.org");
  assert.equal(graph["@graph"][0].isBasedOn, "https://segmentfault.com/a/119000001");
  assert.equal(graph["@graph"][0]["@type"], "Article");
});

test("getBaiduCorePushUrls returns evergreen pages", () => {
  const urls = getBaiduCorePushUrls("https://www.lilnong.top");
  assert.ok(urls.includes("https://www.lilnong.top/"));
  assert.ok(urls.includes("https://www.lilnong.top/about/"));
  assert.ok(urls.includes("https://www.lilnong.top/blog/"));
});

test("loadDemoSitemapAllowlist stays far below full demo count", () => {
  const allow = loadDemoSitemapAllowlist();
  assert.ok(allow.size > 20);
  assert.ok(allow.size < 400);
});

test("collectSitemapEntries writes lastmod and filters pagination", () => {
  const root = mkdtempSync(join(tmpdir(), "seo-sitemap-"));
  try {
    const pages = [
      "index.html",
      "about/index.html",
      "search/index.html",
      "login/index.html",
      "blog/index.html",
      "blog/2/index.html",
      "blog/my-post/index.html",
      "blog/notice-x/index.html",
      "blog/tag/js/index.html",
      "demos/3/index.html",
      "demos/cool-demo/index.html",
      "demos/skip-me/index.html",
    ];
    for (const rel of pages) {
      const full = join(root, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, "<html></html>");
    }

    const entries = collectSitemapEntries(root, "https://www.lilnong.top/", {
      demoAllowlist: new Set(["cool-demo"]),
    });
    const locs = entries.map((e) => e.loc);

    assert.ok(locs.includes("https://www.lilnong.top/"));
    assert.ok(locs.includes("https://www.lilnong.top/about/"));
    assert.ok(locs.includes("https://www.lilnong.top/blog/"));
    assert.ok(locs.includes("https://www.lilnong.top/blog/my-post/"));
    assert.ok(locs.includes("https://www.lilnong.top/demos/cool-demo/"));

    assert.ok(!locs.includes("https://www.lilnong.top/search/"));
    assert.ok(!locs.includes("https://www.lilnong.top/login/"));
    assert.ok(!locs.includes("https://www.lilnong.top/blog/2/"));
    assert.ok(!locs.includes("https://www.lilnong.top/demos/3/"));
    assert.ok(!locs.includes("https://www.lilnong.top/blog/tag/js/"));
    assert.ok(!locs.includes("https://www.lilnong.top/blog/notice-x/"));
    assert.ok(!locs.includes("https://www.lilnong.top/demos/skip-me/"));

    for (const e of entries) {
      assert.match(e.lastmod, /^\d{4}-\d{2}-\d{2}$/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
