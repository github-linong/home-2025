import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_NOTICE_TAG,
  NOTICE_SCOPE,
  hasNoticeTag,
  isPublished,
  mapPostToNotice,
  getPublicNoticesFromPosts,
  excludeNoticePosts,
  readStorageKeyForScope,
} from "../src/lib/systemNotices.mjs";

function fakeSlug(title, slug) {
  return slug;
}

test("detects notice tag on blog posts", () => {
  assert.equal(hasNoticeTag(["用户公告", "站点"]), true);
  assert.equal(hasNoticeTag(["博客"]), false);
  assert.equal(hasNoticeTag(undefined), false);
});

test("filters unpublished notice posts", () => {
  const now = new Date("2026-07-16T10:00:00.000Z");
  assert.equal(isPublished("2026-07-01T00:00:00.000Z", now), true);
  assert.equal(isPublished("2030-01-01T00:00:00.000Z", now), false);
});

test("maps blog posts to notice items", () => {
  const post = {
    slug: "notice-site-upgrade",
    data: {
      title: "站点升级",
      description: "搜索能力已升级。",
      pubDate: new Date("2026-07-16T00:00:00.000Z"),
      badge: "重要",
      tags: [PUBLIC_NOTICE_TAG],
    },
  };

  assert.deepEqual(mapPostToNotice(post, fakeSlug), {
    id: "notice-site-upgrade",
    scope: NOTICE_SCOPE.PUBLIC,
    title: "站点升级",
    message: "搜索能力已升级。",
    url: "/blog/notice-site-upgrade",
    pubDate: "2026-07-16T00:00:00.000Z",
    level: "warning",
  });
});

test("returns published notice posts sorted by date", () => {
  const now = new Date("2026-07-16T10:00:00.000Z");
  const posts = [
    {
      slug: "old",
      data: {
        title: "旧公告",
        description: "old",
        pubDate: new Date("2026-07-10T00:00:00.000Z"),
        tags: [PUBLIC_NOTICE_TAG],
      },
    },
    {
      slug: "new",
      data: {
        title: "新公告",
        description: "new",
        pubDate: new Date("2026-07-16T00:00:00.000Z"),
        tags: [PUBLIC_NOTICE_TAG],
      },
    },
    {
      slug: "article",
      data: {
        title: "普通文章",
        description: "article",
        pubDate: new Date("2026-07-15T00:00:00.000Z"),
        tags: ["博客"],
      },
    },
    {
      slug: "future",
      data: {
        title: "未来公告",
        description: "future",
        pubDate: new Date("2030-01-01T00:00:00.000Z"),
        tags: [PUBLIC_NOTICE_TAG],
      },
    },
  ];

  assert.deepEqual(
    getPublicNoticesFromPosts(posts, fakeSlug, now).map((item) => item.id),
    ["new", "old"],
  );
});

test("excludes notice posts from regular blog lists", () => {
  const posts = [
    { data: { tags: [PUBLIC_NOTICE_TAG] } },
    { data: { tags: ["博客"] } },
  ];

  assert.equal(excludeNoticePosts(posts).length, 1);
});

test("maps storage key by scope", () => {
  assert.equal(readStorageKeyForScope(NOTICE_SCOPE.PUBLIC), "site:system-notice:read:v1");
  assert.equal(readStorageKeyForScope(NOTICE_SCOPE.USER), "");
});

test("banner only promotes the newest unread notice", async () => {
  const { getBannerNotice, getUnreadNotices } = await import("../src/lib/systemNoticeUi.mjs");
  const notices = [
    { id: "new", title: "新" },
    { id: "old", title: "旧" },
  ];

  assert.equal(getBannerNotice(notices, new Set()).id, "new");
  assert.equal(getBannerNotice(notices, new Set(["new"])), null);
  assert.equal(getBannerNotice(notices, new Set(["old"])).id, "new");
  assert.deepEqual(
    getUnreadNotices(notices, new Set(["new"])).map((item) => item.id),
    ["old"],
  );
});
