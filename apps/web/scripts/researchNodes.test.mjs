import assert from "node:assert/strict";
import {
  RESEARCH_NODES,
  RESEARCH_OUTPUT_ROWS,
  assertResearchNodes,
} from "../src/lib/researchNodes.js";

assertResearchNodes(RESEARCH_NODES);
assert.equal(RESEARCH_NODES.length, 5);
assert.ok(RESEARCH_NODES.some((n) => n.lead.includes("张陶")));
assert.ok(RESEARCH_NODES.some((n) => n.lead.includes("张何")));
assert.ok(RESEARCH_NODES.some((n) => n.lead.includes("唐怀")));
assert.ok(RESEARCH_NODES.some((n) => n.mission.includes("恢复因子")));
assert.ok(RESEARCH_OUTPUT_ROWS.length === 5);
assert.throws(() => assertResearchNodes([]));
assert.throws(() =>
  assertResearchNodes(
    RESEARCH_NODES.slice(0, 4).concat([
      { name: "x", axis: "a", lead: "b", mission: "c", note: "d" },
    ]),
  ),
);

console.log("researchNodes.test.mjs OK");
