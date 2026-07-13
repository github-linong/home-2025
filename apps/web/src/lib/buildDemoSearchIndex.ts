import type { CollectionEntry } from "astro:content";
import createSlug from "./createSlug";
import { buildUnifiedTagCounts, type TagCount } from "./buildBlogSearchIndex";

export interface DemoSearchItem {
  title: string;
  description: string;
  tags: string[];
  badge?: string;
  category?: string;
  type?: string;
  url: string;
  slug: string;
  pubDate: string;
  relatedPosts: number;
}

export function buildDemoSearchIndex(
  demos: CollectionEntry<"demos">[]
): DemoSearchItem[] {
  return demos
    .map((demo) => ({
      title: demo.data.title,
      description: demo.data.description,
      tags: demo.data.tags ?? [],
      badge: demo.data.badge,
      category: demo.data.category,
      type: demo.data.type,
      url: "/demos/" + createSlug(demo.data.title, demo.slug),
      slug: demo.slug,
      pubDate: demo.data.pubDate.toISOString(),
      relatedPosts: demo.data.relatedPosts?.length ?? 0,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
}

export function buildDemoTagCounts(
  demos: CollectionEntry<"demos">[]
): TagCount[] {
  return buildUnifiedTagCounts(
    demos.map((demo) => demo.data.tags ?? []),
    { hide: new Set() },
  );
}

export function buildDemoCategoryCounts(
  demos: CollectionEntry<"demos">[]
): TagCount[] {
  const counts = new Map<string, number>();
  for (const demo of demos) {
    const cat = demo.data.category?.trim();
    if (!cat) continue;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
}
