import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createWorld } from "../../src/world.ts";
import { EntityKind } from "../../src/types.ts";

function hashEntities(world: ReturnType<typeof createWorld>): string {
  return createHash("sha256")
    .update(JSON.stringify(world.snapshot().entities))
    .digest("hex");
}

const playerOf = (world: ReturnType<typeof createWorld>) =>
  world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0)!;

test("META-P1: startingPerks applies dmg/hp/spd stacking at spawn", () => {
  const w = createWorld({
    runId: "META-P1",
    seed: "EMBER-S1",
    biomeId: 0,
    players: [{ seatId: 0, userId: "P1", classId: "tank" }],
    startingPerks: ["dmg_up", "dmg_up", "hp_up", "spd_up"],
  });
  const p = playerOf(w);
  assert.deepEqual(p.perks, ["dmg_up", "dmg_up", "hp_up", "spd_up"]);
  assert.ok(Math.abs(p.perkDamageMult! - 1.15 * 1.15) < 1e-9, "dmg stacking ×1.3225");
  assert.equal(p.perkSpeedMult, 1.12);
  assert.equal(p.perkMaxHpBonus, 20);
  assert.equal(p.maxHp, 255 + 20);
  assert.equal(p.hp, p.maxHp, "满血开局");
});

test("META-P2: same startingPerks → deterministic world hash", () => {
  const mk = () =>
    createWorld({
      runId: "META-P2",
      seed: "EMBER-S1",
      biomeId: 0,
      players: [{ seatId: 0, userId: "P1", classId: "tank" }],
      startingPerks: ["dmg_up", "hp_up"],
    });
  assert.equal(hashEntities(mk()), hashEntities(mk()), "重跑字节一致");
});

test("META-P3: no startingPerks → behavior unchanged (undefined fields, base hp)", () => {
  const w = createWorld({
    runId: "META-P3",
    seed: "EMBER-S1",
    biomeId: 0,
    players: [{ seatId: 0, userId: "P1", classId: "tank" }],
  });
  const p = playerOf(w);
  assert.equal(p.perks, undefined);
  assert.equal(p.perkDamageMult, undefined);
  assert.equal(p.maxHp, 255);
});
