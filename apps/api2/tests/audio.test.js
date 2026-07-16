import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { whichBinary } from "../src/learn/audio.js";

describe("audio helpers", () => {
  it("whichBinary returns boolean", async () => {
    const hasWhich = await whichBinary("which");
    assert.equal(typeof hasWhich, "boolean");
    assert.equal(hasWhich, true);
  });
});
