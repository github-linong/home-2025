import { getCollection } from "astro:content";
import createSlug from "./createSlug";
import { CURATED_DEMO_SLUGS } from "../data/curated-demos";
import { getDemoHighlights, getHomeDemoPicks } from "./demoHighlights";
import { blogBaseWeight, demoBaseWeight } from "./contentWeight";
import { toPlainText } from "./plainText";

export type SortCatalogItem = {
  id: string;
  url: string;
  title: string;
  desc: string;
  img?: string;
  badge?: string;
  tags?: string[];
  pubDate: string;
  updatedDate?: string;
  category?: string;
  baseWeight: number;
  kind?: string;
  votes?: number;
  accepted?: boolean;
  dateAsUpdate?: boolean;
};

function toIso(value?: Date | string): string | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export async function buildBlogSortCatalog(): Promise<SortCatalogItem[]> {
  const posts = (await getCollection("blog")).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
  return posts.map((post) => {
    const pathSlug = createSlug(post.data.title, post.slug);
    return {
      id: pathSlug,
      url: "/blog/" + pathSlug,
      title: post.data.title,
      desc: toPlainText(post.data.description, 180),
      img: post.data.heroImage,
      badge: post.data.badge,
      tags: post.data.tags,
      pubDate: post.data.pubDate.toISOString(),
      updatedDate: toIso(post.data.updatedDate),
      baseWeight: blogBaseWeight(post.data),
      kind: post.data.kind,
      votes: post.data.votes,
      accepted: post.data.accepted,
    };
  });
}

export async function buildDemoHighlightsCatalog(): Promise<SortCatalogItem[]> {
  const allDemos = await getCollection("demos");
  return getDemoHighlights(allDemos).map((demo) => {
    const pathSlug = createSlug(demo.data.title, demo.slug);
    return {
      id: pathSlug,
      url: "/demos/" + pathSlug,
      title: demo.data.title,
      desc: toPlainText(demo.data.description, 180),
      img: demo.data.heroImage,
      badge: demo.data.badge,
      tags: demo.data.tags,
      pubDate: demo.data.pubDate.toISOString(),
      updatedDate: toIso(demo.data.updatedDate),
      category: demo.data.category,
      baseWeight: demoBaseWeight(demo.data, {
        curated: CURATED_DEMO_SLUGS.has(demo.slug),
      }),
      dateAsUpdate: true,
    };
  });
}

export async function buildHomeDemoCatalog(): Promise<SortCatalogItem[]> {
  const allDemos = await getCollection("demos");
  return getHomeDemoPicks(allDemos).map((demo) => {
    const pathSlug = createSlug(demo.data.title, demo.slug);
    return {
      id: pathSlug,
      url: "/demos/" + pathSlug,
      title: demo.data.title,
      desc: toPlainText(demo.data.description, 180),
      img: demo.data.heroImage,
      badge: demo.data.badge,
      tags: demo.data.tags,
      pubDate: demo.data.pubDate.toISOString(),
      updatedDate: toIso(demo.data.updatedDate),
      category: demo.data.category,
      baseWeight: demoBaseWeight(demo.data, {
        curated: CURATED_DEMO_SLUGS.has(demo.slug),
      }),
      dateAsUpdate: true,
    };
  });
}

export async function buildDemoLegacyCatalog() {
  const allDemos = (await getCollection("demos")).filter((d) =>
    d.data.tags?.includes("legacy"),
  );
  return allDemos.map((demo) => {
    const pathSlug = createSlug(demo.data.title, demo.slug);
    return {
      id: pathSlug,
      url: "/demos/" + pathSlug,
      title: demo.data.title,
      desc: toPlainText(demo.data.description, 180),
      category: demo.data.category || "",
      posts: demo.data.relatedPosts?.length ?? 0,
      pubDate: demo.data.pubDate.toISOString(),
      updatedDate: toIso(demo.data.updatedDate) || "",
      baseWeight: demoBaseWeight(demo.data, {
        curated: CURATED_DEMO_SLUGS.has(demo.slug),
      }),
    };
  });
}

export function jsonCatalogResponse(data: unknown, maxAge = 3600) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
}
