import type { CollectionEntry } from "astro:content";
import createSlug from "./createSlug";

export interface BlogSearchItem {
  title: string;
  description: string;
  tags: string[];
  badge?: string;
  kind?: string;
  source?: string;
  url: string;
  pubDate: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

export function buildBlogSearchIndex(
  posts: CollectionEntry<"blog">[]
): BlogSearchItem[] {
  return posts
    .map((post) => ({
      title: post.data.title,
      description: post.data.description,
      tags: post.data.tags ?? [],
      badge: post.data.badge,
      kind: post.data.kind,
      source: post.data.source ?? (post.data.sourceUrl ? "segmentfault" : "site"),
      url: "/blog/" + createSlug(post.data.title, post.slug),
      pubDate: post.data.pubDate.toISOString(),
    }))
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}

export function buildTagCounts(posts: CollectionEntry<"blog">[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
}
