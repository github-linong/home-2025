import type { BlogSchema, DemoSchema } from "../content/config";

/**
 * Cold-start weights so “热度” ranking is useful before live views accumulate.
 * Views still move the needle (heatScore), but curated / 精选 demos start ahead.
 *
 * Important: tiers must not fully stack (curated + 博客配套 + many relatedPosts
 * previously pushed obscure blog companions above hand-picked 精选 demos).
 */
export const DEMO_COLD_START = {
  curated: 220,
  featuredBadge: 100,
  blogCompanion: 120,
  relatedPost: 12,
  relatedPostCap: 2,
  nonLegacyFeatured: 40,
  projectTag: 20,
  otherBadge: 20,
} as const;

/** Content signals that are known at build time (votes, curation, etc.). */
export function blogBaseWeight(data: BlogSchema): number {
  let score = 0;
  if (data.kind === "article") score += 12;
  if (data.votes) score += data.votes * 8;
  if (data.accepted) score += 80;
  if (data.badge === "精选") score += 40;
  else if (data.badge) score += 15;
  return score;
}

function isBlogCompanion(data: DemoSchema): boolean {
  const tags = data.tags ?? [];
  if (tags.includes("博客配套")) return true;
  if (data.badge === "博客配套") return true;
  return (data.relatedPosts?.length ?? 0) > 0;
}

export function demoBaseWeight(
  data: DemoSchema,
  options: { curated?: boolean } = {},
): number {
  let score = 0;
  const tags = data.tags ?? [];
  const isLegacy = tags.includes("legacy");
  const isProject = tags.includes("project");
  const curated = Boolean(options.curated);
  const blogCompanion = isBlogCompanion(data);
  const featured = data.badge === "精选" || tags.includes("精选");

  // Exclusive cold-start tier: curated outranks blog companion alone.
  if (curated) score += DEMO_COLD_START.curated;
  else if (blogCompanion) score += DEMO_COLD_START.blogCompanion;

  if (featured) score += DEMO_COLD_START.featuredBadge;
  else if (data.badge && data.badge !== "博客配套") {
    score += DEMO_COLD_START.otherBadge;
  }

  if (!isLegacy && !isProject) score += DEMO_COLD_START.nonLegacyFeatured;
  // project / relatedPosts only lift non-curated entries so curated 精选 ties
  // break by recency (Rot.js etc.) instead of losing to older project pages.
  if (isProject && !curated) score += DEMO_COLD_START.projectTag;

  if (!curated) {
    const relatedCount = Math.min(
      data.relatedPosts?.length ?? 0,
      DEMO_COLD_START.relatedPostCap,
    );
    score += relatedCount * DEMO_COLD_START.relatedPost;
  }
  return score;
}

/** Live views lift ranking; baseWeight keeps curated / voted content visible early. */
export function heatScore(baseWeight: number, views = 0): number {
  return baseWeight + views * 4;
}

export type SortMode = "date" | "hot";

export function compareBySortMode<
  T extends {
    pubDate: string;
    baseWeight: number;
    views?: number;
    title?: string;
    updatedDate?: string;
  },
>(a: T, b: T, mode: SortMode): number {
  if (mode === "date") {
    const dateOf = (item: T) => Date.parse(item.updatedDate || item.pubDate);
    const byDate = dateOf(b) - dateOf(a);
    if (byDate !== 0) return byDate;
    const byWeight = (b.baseWeight || 0) - (a.baseWeight || 0);
    if (byWeight !== 0) return byWeight;
    return (a.title || "").localeCompare(b.title || "", "zh");
  }
  const hot = heatScore(b.baseWeight, b.views) - heatScore(a.baseWeight, a.views);
  if (hot !== 0) return hot;
  const dateOf = (item: T) => Date.parse(item.updatedDate || item.pubDate);
  const byDate = dateOf(b) - dateOf(a);
  if (byDate !== 0) return byDate;
  return (a.title || "").localeCompare(b.title || "", "zh");
}
