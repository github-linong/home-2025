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
  return countTags(posts.map((post) => post.data.tags ?? []));
}

/** Meta tags that should not appear as topic filters in unified search. */
export const HIDDEN_SEARCH_TAGS = new Set(["legacy"]);

/**
 * One shared tag vocabulary across blog + demos.
 * Counts how many content items carry each tag.
 */
export function buildUnifiedTagCounts(
  tagLists: Iterable<readonly string[] | undefined>,
  options: { hide?: Set<string> } = {},
): TagCount[] {
  const hide = options.hide ?? HIDDEN_SEARCH_TAGS;
  const counts = new Map<string, number>();
  for (const tags of tagLists) {
    for (const tag of tags ?? []) {
      if (hide.has(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
}

function countTags(tagLists: Iterable<readonly string[]>): TagCount[] {
  return buildUnifiedTagCounts(tagLists, { hide: new Set() });
}
