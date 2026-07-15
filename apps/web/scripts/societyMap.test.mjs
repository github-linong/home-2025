import assert from "node:assert/strict";
import {
  SOCIETY_MAP_ANNOTATIONS,
  SOCIETY_MAP_MARKERS,
  SOCIETY_MAP_PATHS,
  SOCIETY_MAP_ZONES,
  SOCIETY_MOUNTAIN_ROWS,
  SOCIETY_PACK_ROWS,
  SOCIETY_TERRITORY_ROWS,
  assertNumberedCatalog,
  assertSocietyMap,
} from "../src/lib/societyMap.js";

assertSocietyMap(SOCIETY_MAP_MARKERS, SOCIETY_MAP_PATHS, SOCIETY_MAP_ZONES);
assertNumberedCatalog(SOCIETY_MOUNTAIN_ROWS, SOCIETY_TERRITORY_ROWS, SOCIETY_PACK_ROWS);
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
assert.ok(SOCIETY_MOUNTAIN_ROWS.some((r) => r.code.includes("五十五")));
assert.throws(() => assertSocietyMap([], [], []));
assert.throws(() => assertNumberedCatalog([], [], [{ code: "x", name: "y", note: "z" }]));

console.log("societyMap.test.mjs OK");
