/**
 * System notices are blog posts tagged with PUBLIC_NOTICE_TAG.
 * Personal notices will use a different tag in a later phase.
 */

export const PUBLIC_NOTICE_TAG = "用户公告";

export const NOTICE_SCOPE = {
  PUBLIC: "public",
  USER: "user",
};

const PUBLIC_READ_STORAGE_KEY = "site:system-notice:read:v1";

export function hasNoticeTag(tags) {
  return Array.isArray(tags) && tags.includes(PUBLIC_NOTICE_TAG);
}

export function isPublished(pubDate, now = new Date()) {
  if (!pubDate) return false;
  const t = pubDate instanceof Date ? pubDate.getTime() : Date.parse(pubDate);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return !Number.isNaN(t) && t <= nowMs;
}

export function mapPostToNotice(post, createSlugFn) {
  const id = createSlugFn(post.data.title, post.slug);
  const badge = post.data.badge || "";
  let level = "info";
  if (badge.includes("重要") || badge.includes("警告")) level = "warning";
  if (badge.includes("紧急")) level = "critical";

  return {
    id,
    scope: NOTICE_SCOPE.PUBLIC,
    title: post.data.title,
    message: post.data.description,
    url: `/blog/${id}`,
    pubDate: post.data.pubDate.toISOString(),
    level,
  };
}

export function getPublicNoticesFromPosts(posts, createSlugFn, now = new Date()) {
  if (!Array.isArray(posts)) return [];
  return posts
    .filter((post) => hasNoticeTag(post.data?.tags))
    .filter((post) => isPublished(post.data?.pubDate, now))
    .map((post) => mapPostToNotice(post, createSlugFn))
    .sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));
}

export function excludeNoticePosts(posts) {
  if (!Array.isArray(posts)) return [];
  return posts.filter((post) => !hasNoticeTag(post.data?.tags));
}

export function readStorageKeyForScope(scope) {
  if (scope === NOTICE_SCOPE.PUBLIC) return PUBLIC_READ_STORAGE_KEY;
  return "";
}
