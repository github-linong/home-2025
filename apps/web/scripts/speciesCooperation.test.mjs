import assert from "node:assert/strict";
import {
  SPECIES_COOPERATION_EVENTS,
  SPECIES_FACTION_CARDS,
  SPECIES_SYMBIOSIS_DOCTRINE,
  SPECIES_SYMBIOSIS_PRINCIPLES,
  SPECIES_SYMBIOSIS_THESIS,
  assertSpeciesCooperationEvents,
  assertSpeciesSymbiosis,
  filterSpeciesCooperationEvents,
} from "../src/lib/speciesCooperation.js";

assertSpeciesCooperationEvents(SPECIES_COOPERATION_EVENTS);
assertSpeciesSymbiosis(SPECIES_SYMBIOSIS_PRINCIPLES, SPECIES_SYMBIOSIS_THESIS);
assert.equal(SPECIES_FACTION_CARDS.length, 5);
assert.ok(SPECIES_SYMBIOSIS_THESIS.summary.includes("活案例"));
assert.ok(SPECIES_SYMBIOSIS_PRINCIPLES.some((p) => p.name.includes("平等共生")));
assert.ok(SPECIES_SYMBIOSIS_PRINCIPLES.some((p) => p.name.includes("谨慎保护")));
assert.ok(SPECIES_SYMBIOSIS_DOCTRINE.includes("共生体"));
assert.ok(SPECIES_COOPERATION_EVENTS.length >= 18);
assert.ok(SPECIES_COOPERATION_EVENTS.some((e) => e.event.includes("羊老大")));
assert.ok(SPECIES_COOPERATION_EVENTS.some((e) => e.event.includes("老四")));
assert.ok(SPECIES_COOPERATION_EVENTS.some((e) => e.factions.includes("tigers")));
assert.ok(SPECIES_COOPERATION_EVENTS.some((e) => e.factions.includes("avian")));
assert.ok(SPECIES_COOPERATION_EVENTS.some((e) => e.factions.includes("bears")));

const wolves = filterSpeciesCooperationEvents(SPECIES_COOPERATION_EVENTS, "wolves");
assert.ok(wolves.length >= 5);
assert.ok(wolves.every((e) => e.factions.includes("wolves")));
assert.equal(
  filterSpeciesCooperationEvents(SPECIES_COOPERATION_EVENTS, "all").length,
  SPECIES_COOPERATION_EVENTS.length,
);
assert.throws(() => assertSpeciesSymbiosis([], SPECIES_SYMBIOSIS_THESIS));

console.log("speciesCooperation.test.mjs OK");
