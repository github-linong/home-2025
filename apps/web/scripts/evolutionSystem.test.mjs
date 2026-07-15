import assert from "node:assert/strict";
import {
  EVOLUTION_BODY_TRACKS,
  EVOLUTION_BRAIN_FUNCS,
  EVOLUTION_DANGER_TIERS,
  EVOLUTION_DIMENSION_CARDS,
  EVOLUTION_MULTI_SYSTEM,
  EVOLUTION_ORGAN_TRACKS,
  EVOLUTION_RULE_ROWS,
  EVOLUTION_SENSE_TRACKS,
  EVOLUTION_SPECIAL_TRACKS,
  EVOLUTION_XIAQING_LINE,
  assertEvolutionSystem,
} from "../src/lib/evolutionSystem.js";

assertEvolutionSystem(
  EVOLUTION_DIMENSION_CARDS,
  EVOLUTION_BODY_TRACKS,
  EVOLUTION_ORGAN_TRACKS,
);
assert.equal(EVOLUTION_DIMENSION_CARDS.length, 5);
assert.ok(EVOLUTION_BODY_TRACKS.some((t) => t.name.includes("弹力")));
assert.ok(EVOLUTION_BODY_TRACKS.some((t) => t.name.includes("爆发力")));
assert.ok(EVOLUTION_ORGAN_TRACKS.some((t) => t.name.includes("肺")));
assert.ok(EVOLUTION_ORGAN_TRACKS.some((t) => t.name.includes("胃") || t.name.includes("胃肠")));
assert.ok(EVOLUTION_SPECIAL_TRACKS.some((t) => t.name.includes("磁觉")));
assert.equal(EVOLUTION_SENSE_TRACKS.length, 5);
assert.ok(EVOLUTION_BRAIN_FUNCS.some((f) => f.name === "同频"));
assert.ok(EVOLUTION_MULTI_SYSTEM.some((r) => r.name.includes("四系")));
assert.ok(EVOLUTION_RULE_ROWS.some((r) => r.name.includes("能量")));
assert.ok(EVOLUTION_XIAQING_LINE.some((r) => r.note.includes("四系")));
assert.equal(EVOLUTION_DANGER_TIERS.length, 3);
assert.throws(() => assertEvolutionSystem([]));

console.log("evolutionSystem.test.mjs OK");
