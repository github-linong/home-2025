import assert from "node:assert/strict";
import {
  adjacencyPairs,
  assertChildrenFillParent,
  buildBaiInteriorLayer,
  buildGuiInteriorLayer,
  buildHongInteriorLayer,
  buildHui3LocalLayer,
  buildHuiInteriorLayer,
  buildLanInteriorLayer,
  buildMacroRegionLayer,
  buildSocietyRegionBundle,
  clipPolygonToConvex,
  composeFullNation,
  featureArea,
  featureRingXY,
  macroRingForZone,
  pointInRing,
  REGION_LAYER_META,
  ringArea,
} from "../src/lib/regionVoronoi.js";

// Clip unit: square ∩ half → half square area
{
  const subject = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const clip = [
    [0, 0],
    [5, 0],
    [5, 10],
    [0, 10],
  ];
  const clipped = clipPolygonToConvex(subject, clip);
  assert.ok(clipped.length >= 3);
  assert.ok(Math.abs(Math.abs(ringArea(clipped)) - 50) < 1e-6);
}

const macro = buildMacroRegionLayer();
assert.equal(macro.features.length, 5);
assert.ok(macro.features.every((f) => f.geometry?.type === "Polygon"));

const adj = adjacencyPairs(macro);
assert.ok(adj.length >= 4, `expected adjacent macro pairs, got ${adj.length}`);

const ringHui = macroRingForZone(macro, "z-hui");
assert.ok(ringHui.length >= 3);
assert.ok(pointInRing(500, 500, ringHui), "晖三 canvas center should fall in 晖城 cell");

const interiors = {
  "in-bai": buildBaiInteriorLayer(macroRingForZone(macro, "z-bai")),
  "in-lan": buildLanInteriorLayer(macroRingForZone(macro, "z-lan")),
  "in-hong": buildHongInteriorLayer(macroRingForZone(macro, "z-hong")),
  "in-hui": buildHuiInteriorLayer(ringHui),
  "in-gui": buildGuiInteriorLayer(macroRingForZone(macro, "z-gui")),
};

for (const zoneId of ["z-bai", "z-lan", "z-hong", "z-hui", "z-gui"]) {
  const parent = macro.features.find((f) => f.properties?.id === zoneId);
  const mapKey = {
    "z-bai": "in-bai",
    "z-lan": "in-lan",
    "z-hong": "in-hong",
    "z-hui": "in-hui",
    "z-gui": "in-gui",
  }[zoneId];
  assertChildrenFillParent(parent, interiors[mapKey], 0.14);
}

assert.ok(interiors["in-bai"].features.some((f) => f.properties?.id === "bai1"));
assert.ok(interiors["in-lan"].features.some((f) => f.properties?.id === "lan5"));
assert.ok(interiors["in-hong"].features.some((f) => f.properties?.id === "hong1"));
assert.ok(interiors["in-hui"].features.some((f) => f.properties?.id === "hui3"));
assert.ok(interiors["in-gui"].features.some((f) => f.properties?.id === "gui3"));
assert.ok(adjacencyPairs(interiors["in-hui"]).length >= 3);

const hui3 = interiors["in-hui"].features.find((f) => f.properties?.id === "hui3");
assert.ok(hui3);
const local = buildHui3LocalLayer(featureRingXY(hui3));
assert.ok(local.features.length >= 8);
assert.ok(local.features.some((f) => f.properties?.id === "t3"));
assert.ok(local.features.some((f) => f.properties?.id === "mt-49"));
assertChildrenFillParent(hui3, local, 0.18);

const full = composeFullNation(interiors);
const macroArea = macro.features.reduce((s, f) => s + featureArea(f), 0);
const fullArea = full.features.reduce((s, f) => s + featureArea(f), 0);
assert.ok(
  Math.abs(macroArea - fullArea) / macroArea < 0.14,
  `full should tile macro: macro=${macroArea.toFixed(0)} full=${fullArea.toFixed(0)}`,
);

const bundle = buildSocietyRegionBundle();
assert.equal(REGION_LAYER_META.length, 9);
assert.ok(bundle.layers.full);
assert.ok(bundle.layers["full-local"]);
assert.ok(bundle.layers["in-bai"]);
assert.ok(bundle.layers["in-lan"]);
assert.ok(bundle.layers["in-hong"]);
assert.ok(bundle.layers["in-hui"]);
assert.ok(bundle.layers["in-gui"]);
assert.ok(bundle.layers.local);
assert.ok(!bundle.layers.bases);
assert.ok(bundle.adjacency.macro.length >= 4);
assert.ok(bundle.parentRings["z-hui"].length >= 3);
assert.ok(bundle.parentRings.hui3.length >= 3);

// Local features' seeds should lie in 晖三 parent
for (const f of bundle.layers.local.features) {
  const sx = f.properties?.seedX;
  const sy = f.properties?.seedY;
  assert.ok(pointInRing(sx, sy, bundle.parentRings.hui3), `seed ${f.properties?.id} outside 晖三`);
}

console.log("regionVoronoi.test.mjs OK", {
  macroAdj: bundle.adjacency.macro.length,
  huiInterior: bundle.layers["in-hui"].features.length,
  localCells: bundle.layers.local.features.length,
  fullCells: bundle.layers.full.features.length,
});
