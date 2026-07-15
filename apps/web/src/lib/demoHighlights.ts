import type { CollectionEntry } from "astro:content";
import { CURATED_DEMO_SLUGS } from "../data/curated-demos";

type DemoEntry = CollectionEntry<"demos">;

function isLegacy(d: DemoEntry) {
  return d.data.tags?.includes("legacy") ?? false;
}

function isProject(d: DemoEntry) {
  return d.data.tags?.includes("project") ?? false;
}

function dateOf(d: DemoEntry) {
  return (d.data.updatedDate ?? d.data.pubDate).valueOf();
}

/** Homepage picks: curated + blog-linked demos only (not the full archive pool). */
export function getHomeDemoPicks(allDemos: DemoEntry[]): DemoEntry[] {
  const bySlug = new Map<string, DemoEntry>(allDemos.map((d) => [d.slug, d]));
  const seen = new Set<string>();
  const picks: DemoEntry[] = [];

  for (const slug of CURATED_DEMO_SLUGS) {
    const demo = bySlug.get(slug);
    if (!demo || seen.has(demo.slug)) continue;
    seen.add(demo.slug);
    picks.push(demo);
  }

  for (const demo of allDemos) {
    if (seen.has(demo.slug)) continue;
    const blogLinked =
      (demo.data.relatedPosts?.length ?? 0) > 0 ||
      demo.data.badge === "博客配套" ||
      (demo.data.tags?.includes("博客配套") ?? false);
    if (!blogLinked) continue;
    seen.add(demo.slug);
    picks.push(demo);
  }

  picks.sort((a, b) => dateOf(b) - dateOf(a));
  return picks;
}

/** Same highlight pool as /demos/ — featured + curated + blog-linked legacy. */
export function getDemoHighlights(allDemos: DemoEntry[]): DemoEntry[] {
  const bySlug = new Map<string, DemoEntry>(allDemos.map((d) => [d.slug, d]));

  const featured = allDemos.filter((d) => !isLegacy(d) && !isProject(d));

  const blogLinked = allDemos.filter(
    (d) => isLegacy(d) && (d.data.relatedPosts?.length ?? 0) > 0,
  );

  const curated = [...CURATED_DEMO_SLUGS]
    .map((slug) => bySlug.get(slug))
    .filter((d): d is DemoEntry => !!d);

  const seen = new Set<string>();
  const highlights: DemoEntry[] = [];
  for (const demo of featured.concat(curated, blogLinked)) {
    if (seen.has(demo.slug)) continue;
    seen.add(demo.slug);
    highlights.push(demo);
  }

  // Default list order = newest update/publish first (matches the "最新" sort control).
  // Tie-break: prefer curated / 精选 / blog-linked, then title.
  highlights.sort((a, b) => {
    const byDate = dateOf(b) - dateOf(a);
    if (byDate !== 0) return byDate;

    const badgeRank = (d: DemoEntry) => {
      if (!isLegacy(d) && !isProject(d)) return 0;
      if (d.data.badge === "精选" || CURATED_DEMO_SLUGS.has(d.slug)) return 1;
      if ((d.data.relatedPosts?.length ?? 0) > 0) return 2;
      return 3;
    };
    const r = badgeRank(a) - badgeRank(b);
    if (r !== 0) return r;
    return a.data.title.localeCompare(b.data.title, "zh");
  });

  return highlights;
}
