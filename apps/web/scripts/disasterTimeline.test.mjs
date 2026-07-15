import assert from "node:assert/strict";
import {
  DISASTER_TIMELINE_EVENTS,
  assertDisasterTimelineEvents,
  filterDisasterTimelineEvents,
} from "../src/lib/disasterTimeline.js";

assertDisasterTimelineEvents(DISASTER_TIMELINE_EVENTS);
assert.ok(DISASTER_TIMELINE_EVENTS.length >= 20);
assert.equal(DISASTER_TIMELINE_EVENTS[0].event, "核污染水排海");
assert.equal(DISASTER_TIMELINE_EVENTS[0].era, "prelude");
assert.ok(
  DISASTER_TIMELINE_EVENTS.some((e) => e.event === "走出安全区种田"),
);
assert.ok(DISASTER_TIMELINE_EVENTS.some((e) => e.event.includes("跨物种")));
assert.equal(DISASTER_TIMELINE_EVENTS.at(-1).yearLabel, "连载中");
assert.equal(DISASTER_TIMELINE_EVENTS.at(-1).era, "story");

const prelude = filterDisasterTimelineEvents(DISASTER_TIMELINE_EVENTS, "prelude");
const story = filterDisasterTimelineEvents(DISASTER_TIMELINE_EVENTS, "story");
assert.ok(prelude.length >= 8);
assert.ok(story.length >= 8);
assert.equal(
  filterDisasterTimelineEvents(DISASTER_TIMELINE_EVENTS, "all").length,
  DISASTER_TIMELINE_EVENTS.length,
);
assert.ok(prelude.every((e) => e.era === "prelude"));
assert.ok(story.every((e) => e.era === "story"));

assert.throws(() => assertDisasterTimelineEvents([]));

console.log("disasterTimeline.test.mjs OK");
