/**
 * Shared SEO helpers for Baidu / Google (canonical, JSON-LD, sitemap filters).
 */

/** Paths that should not appear in sitemap (thin / private / utility). */
const SITEMAP_EXCLUDE_EXACT = new Set([
  "/search/",
  "/login/",
  "/blog/search/",
  "/demos/search/",
  "/404/",
  "/500/",
]);

/** Pagination: /blog/2/, /demos/3/, /demos/archive/4/ — not /blog/2026-foo/ */
const SITEMAP_PAGINATION_RE =
  /^\/(?:blog|demos)(?:\/archive)?\/\d+\/$/;

/** Tag listing pages tend to be thin for Baidu crawl budget. */
const SITEMAP_TAG_LIST_RE = /^\/blog\/tag\//;

/** System notices are not meant for search landing. */
const SITEMAP_NOTICE_BLOG_RE = /^\/blog\/notice-/;

/** Raw whole-site project bundles (Cocos/PWA/etc.) are runnable apps, not SEO pages. */
const SITEMAP_PROJECT_BUNDLE_RE = /^\/demos\/project(\/|$)/;

/**
 * @param {string} pathname pathname with leading slash, preferably trailing slash
 * @param {{ demoAllowlist?: Set<string> | null }} [options]
 * @returns {boolean}
 */
export function shouldIncludeInSitemap(pathname, options = {}) {
  const path = normalizePathname(pathname);
  if (!path || path === "/") return true;
  if (SITEMAP_EXCLUDE_EXACT.has(path)) return false;
  if (SITEMAP_PAGINATION_RE.test(path)) return false;
  if (SITEMAP_TAG_LIST_RE.test(path)) return false;
  if (SITEMAP_NOTICE_BLOG_RE.test(path)) return false;
  if (SITEMAP_PROJECT_BUNDLE_RE.test(path)) return false;

  // Detail demos only when allowlisted (featured / curated / blog-linked).
  const demoDetail = path.match(/^\/demos\/([^/]+)\/$/);
  if (demoDetail) {
    const slug = demoDetail[1];
    if (slug === "archive") return true;
    if (options.demoAllowlist) return options.demoAllowlist.has(slug);
  }

  return true;
}

/**
 * Whether a demo collection entry is worth Baidu/Google crawl budget.
 * @param {{ slug: string, tags?: string[], relatedPosts?: string[], badge?: string }} demo
 * @param {Set<string>} [curatedSlugs]
 */
export function isSitemapWorthyDemo(demo, curatedSlugs) {
  const tags = demo.tags ?? [];
  const isLegacy = tags.includes("legacy");
  if (!isLegacy) return true;
  if (curatedSlugs?.has(demo.slug)) return true;
  if ((demo.relatedPosts ?? []).length > 0) return true;
  if (demo.badge === "精选" || demo.badge === "博客配套") return true;
  if (tags.includes("博客配套") || tags.includes("精选")) return true;
  return false;
}

/**
 * @param {string} pathname
 * @returns {string} pathname ending with /
 */
export function normalizePathname(pathname) {
  if (!pathname) return "/";
  let path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const q = path.indexOf("?");
  const h = path.indexOf("#");
  const cut = Math.min(q === -1 ? path.length : q, h === -1 ? path.length : h);
  path = path.slice(0, cut);
  if (!path.endsWith("/")) path += "/";
  return path;
}

/**
 * Absolute canonical URL for the current page (www preferred via siteBase).
 * @param {string | URL} siteBase e.g. https://www.lilnong.top
 * @param {string | URL} pageUrl current page URL or pathname
 */
export function buildCanonicalUrl(siteBase, pageUrl) {
  const base = String(siteBase).replace(/\/$/, "");
  if (pageUrl instanceof URL || /^https?:\/\//i.test(String(pageUrl))) {
    const u = new URL(String(pageUrl));
    return `${base}${normalizePathname(u.pathname)}`;
  }
  return `${base}${normalizePathname(String(pageUrl))}`;
}

/**
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.url
 * @param {string} [opts.description]
 * @param {string} [opts.image]
 */
export function buildPersonJsonLd(opts) {
  const person = {
    "@type": "Person",
    name: opts.name,
    url: opts.url,
  };
  if (opts.description) person.description = opts.description;
  if (opts.image) person.image = opts.image;
  return person;
}

/**
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.url
 * @param {string} opts.description
 * @param {object} [opts.author] Person JSON-LD
 * @param {object} [opts.publisher] Organization JSON-LD
 */
export function buildWebSiteJsonLd(opts) {
  return {
    "@type": "WebSite",
    name: opts.name,
    url: opts.url,
    description: opts.description,
    inLanguage: "zh-CN",
    ...(opts.publisher ? { publisher: opts.publisher } : {}),
    ...(opts.author ? { author: opts.author } : {}),
  };
}

/**
 * Organization node — used as the publisher across WebSite/Article/CreativeWork
 * so Google can attach the site to a verifiable entity (E-E-A-T signal).
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.url
 * @param {string} [opts.logo]
 * @param {string[]} [opts.sameAs]
 */
export function buildOrganizationJsonLd(opts) {
  const org = {
    "@type": "Organization",
    name: opts.name,
    url: opts.url,
    inLanguage: "zh-CN",
  };
  if (opts.logo) org.logo = opts.logo;
  if (opts.sameAs && opts.sameAs.length) org.sameAs = opts.sameAs;
  return org;
}

/**
 * BreadcrumbList derived from the current pathname. Covers every page from a
 * single helper so breadcrumb rich results show site-wide.
 * @param {string} pathname e.g. /blog/some-slug/
 * @param {string} title current page title (used for the terminal crumb)
 * @param {string} siteBase e.g. https://www.lilnong.top
 */
export function buildBreadcrumbJsonLd(pathname, title, siteBase) {
  const base = String(siteBase).replace(/\/$/, "");
  const segments = String(pathname).split("/").filter(Boolean);
  const labelMap = {
    blog: "博客",
    demos: "项目",
    about: "关于",
    "texas-holdem": "德州扑克",
    "learn-english": "学英语",
    archive: "归档",
    search: "搜索",
  };
  const crumbs = [{ name: "首页", url: `${base}/` }];
  let acc = "";
  segments.forEach((seg, i) => {
    acc += `/${seg}`;
    const isLast = i === segments.length - 1;
    const name = isLast ? title || seg : labelMap[seg] || seg;
    crumbs.push({ name, url: `${base}${acc}/` });
  });
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

/**
 * @param {object} opts
 * @param {string} opts.headline
 * @param {string} opts.description
 * @param {string} opts.url
 * @param {string} opts.datePublished ISO date
 * @param {string} [opts.dateModified]
 * @param {string} [opts.image]
 * @param {object} [opts.author]
 * @param {object} [opts.publisher] Organization JSON-LD
 * @param {string} [opts.isBasedOn] original URL when syndicated / migrated
 */
export function buildArticleJsonLd(opts) {
  const article = {
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    url: opts.url,
    mainEntityOfPage: opts.url,
    datePublished: opts.datePublished,
    inLanguage: "zh-CN",
  };
  if (opts.dateModified) article.dateModified = opts.dateModified;
  if (opts.image) article.image = opts.image;
  if (opts.author) article.author = opts.author;
  if (opts.publisher) article.publisher = opts.publisher;
  if (opts.isBasedOn) article.isBasedOn = opts.isBasedOn;
  return article;
}

/**
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.description
 * @param {string} opts.url
 * @param {string} [opts.datePublished]
 * @param {string} [opts.dateModified]
 * @param {string} [opts.image]
 * @param {object} [opts.author]
 * @param {object} [opts.publisher] Organization JSON-LD
 */
export function buildCreativeWorkJsonLd(opts) {
  const work = {
    "@type": "CreativeWork",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    inLanguage: "zh-CN",
  };
  if (opts.datePublished) work.datePublished = opts.datePublished;
  if (opts.dateModified) work.dateModified = opts.dateModified;
  if (opts.image) work.image = opts.image;
  if (opts.author) work.author = opts.author;
  if (opts.publisher) work.publisher = opts.publisher;
  return work;
}

/**
 * Wrap one or more schema.org nodes in @graph.
 * @param {object | object[]} nodes
 */
export function wrapJsonLdGraph(nodes) {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  return {
    "@context": "https://schema.org",
    "@graph": list,
  };
}

/**
 * Core URLs worth pushing to Baidu first (home + evergreen pages).
 * Blog/demo detail URLs should be appended by the push script from recent content.
 * @param {string} siteBase
 * @returns {string[]}
 */
export function getBaiduCorePushUrls(siteBase) {
  const base = String(siteBase).replace(/\/$/, "");
  return [
    `${base}/`,
    `${base}/about/`,
    `${base}/blog/`,
    `${base}/demos/`,
    `${base}/archive/segmentfault/`,
  ];
}

/**
 * Parse curated demo slug strings from curated-demos.ts source text.
 * @param {string} source
 * @returns {Set<string>}
 */
export function parseCuratedDemoSlugsFromSource(source) {
  return new Set(
    [...source.matchAll(/^\s*"([A-Za-z0-9][A-Za-z0-9._-]*)",?\s*$/gm)].map((m) => m[1]),
  );
}
