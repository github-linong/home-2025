import assert from "node:assert/strict";
import {
  SPECIES_COOPERATION_EVENTS,
  SPECIES_FACTION_CARDS,
  assertSpeciesCooperationEvents,
  filterSpeciesCooperationEvents,
} from "../src/lib/speciesCooperation.js";

assertSpeciesCooperationEvents(SPECIES_COOPERATION_EVENTS);
assert.equal(SPECIES_FACTION_CARDS.length, 5);
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

console.log("speciesCooperation.test.mjs OK");
