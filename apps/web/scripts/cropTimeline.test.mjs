import assert from "node:assert/strict";
import {
  CROP_TIMELINE_EVENTS,
  CROP_KIND_CARDS,
  assertCropTimelineEvents,
  filterCropTimelineEvents,
} from "../src/lib/cropTimeline.js";

assertCropTimelineEvents(CROP_TIMELINE_EVENTS);
assert.equal(CROP_KIND_CARDS.length, 4);
assert.ok(CROP_TIMELINE_EVENTS.some((e) => e.event.includes("稻种")));
assert.ok(CROP_TIMELINE_EVENTS.some((e) => e.kinds.includes("tech")));

const grains = filterCropTimelineEvents(CROP_TIMELINE_EVENTS, "grain");
assert.ok(grains.length >= 3);
assert.ok(grains.every((e) => e.kinds.includes("grain")));

console.log("cropTimeline.test.mjs OK");
