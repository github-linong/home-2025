import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLearnRouter, normalizeLemma } from "../src/learn/routes.js";

describe("normalizeLemma", () => {
  it("lowercases and strips punctuation", () => {
    assert.equal(normalizeLemma("  Hello, "), "hello");
    assert.equal(normalizeLemma("don't."), "don't");
    assert.equal(normalizeLemma("Progress!"), "progress");
  });

  it("returns empty for non-letter tokens", () => {
    assert.equal(normalizeLemma("..."), "");
    assert.equal(normalizeLemma("123"), "");
  });
});

describe("createLearnRouter", () => {
  it("registers expected GET paths", () => {
    const router = createLearnRouter({ query: async () => ({ rows: [] }) });
    const paths = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
      }));

    assert.deepEqual(paths, [
      { path: "/decks", methods: ["get"] },
      { path: "/decks/:slug/cards", methods: ["get"] },
      { path: "/passages", methods: ["get"] },
      { path: "/passages/:slug", methods: ["get"] },
      { path: "/words", methods: ["get"] },
      { path: "/ipa", methods: ["get"] },
      { path: "/audio/status", methods: ["get"] },
      { path: "/audio/ipa", methods: ["get"] },
      { path: "/audio/word", methods: ["get"] },
    ]);
  });
});
