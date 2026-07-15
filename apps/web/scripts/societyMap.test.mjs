import assert from "node:assert/strict";
import { buildAdminNestGraphData } from "../src/lib/adminNestMap.js";
import {
  SOCIETY_ADMIN_NESTS,
  SOCIETY_MAP_ANNOTATIONS,
  SOCIETY_MAP_MARKERS,
  SOCIETY_MAP_PATHS,
  SOCIETY_MAP_ZONES,
  SOCIETY_MOUNTAIN_ROWS,
  SOCIETY_PACK_ROWS,
  SOCIETY_TERRITORY_ADJACENCY,
  SOCIETY_TERRITORY_OUTPOST_NOTE,
  SOCIETY_TERRITORY_ROWS,
  SOCIETY_XIAQING_FRONTS,
  SOCIETY_XIAQING_LAYOUT_DIAGRAM,
  SOCIETY_XIAQING_LAYOUT_NOTE,
  assertAdminNests,
  assertNumberedCatalog,
  assertSocietyMap,
} from "../src/lib/societyMap.js";

assertSocietyMap(SOCIETY_MAP_MARKERS, SOCIETY_MAP_PATHS, SOCIETY_MAP_ZONES);
assertNumberedCatalog(SOCIETY_MOUNTAIN_ROWS, SOCIETY_TERRITORY_ROWS, SOCIETY_PACK_ROWS);
assertAdminNests(SOCIETY_ADMIN_NESTS);
assert.equal(SOCIETY_MAP_ZONES.length, 5);
assert.ok(SOCIETY_MAP_ANNOTATIONS.length >= 3);
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "mt-49"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "mt-50"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "mt-51"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "mt-52"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "mt-55"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "mt-60"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "mt-61"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "mt-22"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "mt-26"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "pack-n"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "c-laosi"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "c-laoer"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "t1"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "t9"));
assert.ok(SOCIETY_MAP_MARKERS.some((m) => m.id === "t11"));
assert.ok(SOCIETY_MOUNTAIN_ROWS.some((r) => r.code.includes("五十五")));
assert.equal(SOCIETY_TERRITORY_ADJACENCY.length, 4);
assert.ok(SOCIETY_TERRITORY_ADJACENCY.every((r) => r.neighbors.includes("★")));
assert.ok(SOCIETY_TERRITORY_ADJACENCY.some((r) => r.plot === "三号" && r.neighbors.includes("九号")));
assert.ok(SOCIETY_TERRITORY_ADJACENCY.some((r) => r.plot === "二号" && r.neighbors.includes("十一号")));
assert.ok(/前哨区|弧形防线/.test(SOCIETY_TERRITORY_OUTPOST_NOTE));
assert.ok(SOCIETY_TERRITORY_ROWS.some((r) => r.code === "九号领地"));
assert.equal(SOCIETY_XIAQING_FRONTS.length, 3);
assert.ok(SOCIETY_XIAQING_FRONTS.some((r) => r.direction === "北部" && /神狼/.test(r.note)));
assert.ok(SOCIETY_XIAQING_FRONTS.some((r) => r.direction === "西部" && /西部狼/.test(r.focus)));
assert.ok(SOCIETY_XIAQING_FRONTS.some((r) => r.direction === "东北" && /霍/.test(r.note)));
assert.ok(/旧隔离带|战略纵深/.test(SOCIETY_XIAQING_LAYOUT_NOTE));
assert.ok(SOCIETY_XIAQING_LAYOUT_DIAGRAM.some((line) => line.includes("西部狼群")));
assert.ok(SOCIETY_PACK_ROWS.some((r) => r.code.includes("北部狼") && /神狼/.test(r.note + r.name)));
assert.throws(() => assertSocietyMap([], [], []));
assert.throws(() => assertNumberedCatalog([], [], [{ code: "x", name: "y", note: "z" }]));

const nestGraph = buildAdminNestGraphData("hui3");
assert.ok(nestGraph.combos.some((c) => String(c.id).endsWith(":nation")));
assert.ok(nestGraph.combos.some((c) => String(c.id).endsWith(":outer")));
assert.ok(nestGraph.nodes.some((n) => String(n.id).endsWith(":inner")));
assert.ok(nestGraph.nodes.some((n) => String(n.id).endsWith(":t3")));
assert.ok(nestGraph.nodes.some((n) => String(n.id).endsWith(":mt49")));
assert.ok(nestGraph.nodes.every((n) => n.combo));
assert.ok(nestGraph.combos.some((c) => c.type === "circle"));

const hui1Graph = buildAdminNestGraphData("hui1");
assert.ok(hui1Graph.nodes.some((n) => String(n.id).endsWith(":inner")));
assert.ok(hui1Graph.combos.some((c) => String(c.id).endsWith(":lord-belt")));

console.log("societyMap.test.mjs OK");
