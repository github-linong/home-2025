import assert from "node:assert/strict";
import {
  SOCIETY_BASE_ROWS,
  SOCIETY_FACTION_ROWS,
  SOCIETY_FOREST_CARDS,
  SOCIETY_GRAPH_EDGES,
  SOCIETY_GRAPH_NODES,
  SOCIETY_REGION_CARDS,
  SOCIETY_SPACE_CARDS,
  SOCIETY_TEAM_ROWS,
  assertSocietyGraph,
} from "../src/lib/societyFactions.js";

assertSocietyGraph(SOCIETY_GRAPH_NODES, SOCIETY_GRAPH_EDGES);
assert.equal(SOCIETY_REGION_CARDS.length, 5);
assert.ok(SOCIETY_SPACE_CARDS.length >= 4);
assert.ok(SOCIETY_FACTION_ROWS.length >= 10);
assert.ok(SOCIETY_FACTION_ROWS.some((r) => r.name.includes("重联")));
assert.ok(SOCIETY_FACTION_ROWS.some((r) => r.name.includes("第九种植")));
assert.ok(SOCIETY_FACTION_ROWS.some((r) => r.name.includes("五十号山试验")));
assert.ok(SOCIETY_FACTION_ROWS.some((r) => r.name.includes("十一号")));
assert.ok(SOCIETY_FACTION_ROWS.some((r) => r.name.includes("蓝血")));
assert.ok(SOCIETY_FACTION_ROWS.some((r) => r.camp.includes("黑")));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "center9"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.name.includes("第九种植")));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.name.includes("五十号山")));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "chonglian"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "plot11"));
assert.ok(
  SOCIETY_GRAPH_EDGES.some((e) => e.source === "blue" && e.target === "hui1"),
);
assert.ok(SOCIETY_FOREST_CARDS.length >= 4);
assert.ok(SOCIETY_TEAM_ROWS.some((r) => r.name.includes("烈火")));
assert.ok(SOCIETY_TEAM_ROWS.some((r) => r.name.includes("青龙")));
assert.ok(SOCIETY_TEAM_ROWS.some((r) => r.name.includes("寒霜")));
assert.ok(SOCIETY_TEAM_ROWS.some((r) => r.name.includes("黑豹")));
assert.ok(SOCIETY_BASE_ROWS.some((r) => r.name === "晖一"));
assert.ok(SOCIETY_BASE_ROWS.some((r) => r.name === "晖二"));
assert.ok(SOCIETY_BASE_ROWS.some((r) => r.name === "晖三"));
assert.ok(SOCIETY_BASE_ROWS.some((r) => r.name === "白一"));
assert.ok(SOCIETY_BASE_ROWS.some((r) => r.name === "红一"));
assert.ok(SOCIETY_BASE_ROWS.some((r) => r.name === "兰五"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "hui1"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "bai1"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "hong1"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "lan5"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "fire"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "huoshan"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "sufeng"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "heibao"));
assert.ok(SOCIETY_GRAPH_NODES.some((n) => n.id === "forest-n"));
assert.ok(
  SOCIETY_GRAPH_EDGES.some((e) => e.source === "huoshan" && e.target === "fire"),
);

assert.throws(() => assertSocietyGraph([], []));

console.log("societyFactions.test.mjs OK");
