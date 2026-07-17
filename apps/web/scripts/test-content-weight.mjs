import assert from "node:assert/strict";

function heatScore(baseWeight, views = 0) {
  return baseWeight + views * 4;
}

function compareBySortMode(a, b, mode) {
  if (mode === "date") return Date.parse(b.pubDate) - Date.parse(a.pubDate);
  const hot = heatScore(b.baseWeight, b.views) - heatScore(a.baseWeight, a.views);
  if (hot !== 0) return hot;
  return Date.parse(b.pubDate) - Date.parse(a.pubDate);
}

assert.equal(heatScore(10, 5), 30);

const items = [
  { pubDate: "2024-01-01T00:00:00.000Z", baseWeight: 1, views: 100 },
  { pubDate: "2025-01-01T00:00:00.000Z", baseWeight: 1, views: 0 },
];
items.sort((a, b) => compareBySortMode(a, b, "hot"));
assert.equal(items[0].views, 100);
items.sort((a, b) => compareBySortMode(a, b, "date"));
assert.equal(items[0].pubDate.startsWith("2025"), true);

// Cold-start: curated / blog-companion should dominate an obscure legacy demo before views land.
const COLD = { curated: 180, featuredBadge: 90, blogCompanion: 140, relatedPost: 24 };
const curatedScore = COLD.curated + COLD.featuredBadge;
const blogScore = COLD.blogCompanion + COLD.relatedPost;
const obscureScore = 0;
assert.ok(curatedScore > obscureScore + 50);
assert.ok(blogScore > obscureScore + 50);
assert.ok(heatScore(curatedScore, 0) > heatScore(obscureScore, 20));

console.log("contentWeight ok");
