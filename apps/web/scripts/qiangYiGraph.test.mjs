import assert from "node:assert/strict";
import {
  QIANG_YI_CATEGORIES,
  QIANG_YI_EDGES,
  QIANG_YI_NODES,
  assertQiangYiGraph,
} from "../src/lib/qiangYiGraph.js";

assertQiangYiGraph(QIANG_YI_NODES, QIANG_YI_EDGES);
assert.equal(QIANG_YI_CATEGORIES.length, 5);
assert.ok(QIANG_YI_NODES.some((n) => n.name === "戕"));
assert.ok(QIANG_YI_NODES.some((n) => n.name === "颐"));
assert.ok(QIANG_YI_NODES.some((n) => n.id === "spring"));
assert.ok(QIANG_YI_NODES.some((n) => n.id === "yi6"));
assert.ok(QIANG_YI_NODES.some((n) => n.id === "yi7"));
assert.ok(QIANG_YI_NODES.some((n) => n.name.includes("泉水")));
assert.ok(QIANG_YI_EDGES.some((e) => e.source === "spring" && e.target === "farming"));
assert.ok(QIANG_YI_EDGES.some((e) => e.source === "yi7" && e.target === "farming"));
assert.ok(QIANG_YI_EDGES.some((e) => e.source === "qiang" && e.target === "balance"));
assert.ok(QIANG_YI_EDGES.some((e) => e.source === "yi" && e.target === "balance"));
assert.ok(QIANG_YI_EDGES.length >= 12);

assert.throws(() => assertQiangYiGraph([], []));

console.log("qiangYiGraph.test.mjs OK");
