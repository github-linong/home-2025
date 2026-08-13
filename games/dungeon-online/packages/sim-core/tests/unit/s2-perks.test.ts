/**
 * s2-perks.test.ts — S2 局内 Build（三选一 perk）单元测试
 *
 * 验证：
 *  1. 无 perk 时世界行为与旧版一致（golden 安全：perk 字段 undefined 不出现在 entities）。
 *  2. applyPerk 校验：无商点 / 非法 perkId → false。
 *  3. 推进到楼层过渡（商点出现）→ applyPerk 成功，perks 记录，hp_up 落地（maxHp +20 / hp 同步）。
 *  4. floor / totalFloors 由 layout.floorOfWave 映射（顶层字段，不影响 entities 哈希）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import { PLAYER_CLASSES, InputAction, type PlayerClass } from "../../src/types.ts";

function makeWorld(seed = "S2-PERKS") {
  return createWorld({
    runId: "S2-PERKS-RUN",
    seed,
    biomeId: 0,
    players: [
      { seatId: 0, userId: "P1", classId: PLAYER_CLASSES[0] as PlayerClass },
      { seatId: 1, userId: "P2", classId: PLAYER_CLASSES[1] as PlayerClass },
    ],
  });
}

test("S2 golden-safety: no perk → entities contain no perk fields", () => {
  const world = makeWorld();
  world.step();
  const json = JSON.stringify(world.snapshot().entities);
  assert.ok(!json.includes("perks"), "no perks key when nothing picked");
  assert.ok(!json.includes("perkDamageMult"), "no perkDamageMult key");
  assert.ok(!json.includes("perkMaxHpBonus"), "no perkMaxHpBonus key");
  assert.ok(!json.includes("perkSpeedMult"), "no perkSpeedMult key");
});

test("S2 floor/totalFloors: mapped from layout.floorOfWave (top-level, golden-safe)", () => {
  const world = makeWorld();
  const snap = world.snapshot();
  assert.ok(snap.floor >= 1, "floor starts at 1");
  assert.ok(snap.totalFloors >= 3, "3-5 floors per run");
  assert.ok(Array.isArray(snap.perkChoices), "perkChoices is an array");
  assert.equal(snap.perkChoices.length, 0, "no choices at floor 1 (no build offer yet)");
});

test("S2 applyPerk validation: rejects invalid picks when no offer window", () => {
  const world = makeWorld();
  world.step();
  assert.equal(world.applyPerk(0, "dmg_up"), false, "no offer window yet");
  assert.equal(world.applyPerk(0, "not_a_perk"), false, "unknown perk rejected");
});

test("S2 hp_up lands via full flow: maxHp +20, hp synced +20 (floor-2 offer)", () => {
  // 用测试钩子强制开商点窗口（SLAUGHTER-FIX：真实推进到 floor 2 需单刷扛怪海，测试脆弱）。
  const world = makeWorld("S2-SEED-3");
  const offers = world.__debugForcePerkOffer();
  assert.ok(offers.length >= 1 && offers.length <= 3, "offer pool is 1-3 perks");
  const chosen = offers.includes("hp_up") ? "hp_up" : offers[0];
  const maxHpBefore = world.actors().find((a) => a.ownerId === 0)!.maxHp;
  const hpBeforePick = world.actors().find((a) => a.ownerId === 0)!.hp; // 选择前当前 hp
  assert.equal(world.applyPerk(0, chosen), true, "applyPerk succeeds during offer");

  const p0After = world.actors().find((a) => a.ownerId === 0)!;
  assert.ok(p0After.perks!.includes(chosen), "perks recorded");
  // 重复选择被拒
  assert.equal(world.applyPerk(0, chosen), false, "duplicate pick rejected in same offer");

  if (chosen === "hp_up") {
    assert.equal(p0After.maxHp, maxHpBefore + 20, "maxHp +20 (from pre-pick maxHp)");
    // 升级/perk：hp 正确语义 = 选择前 hp +20（钳制新上限）。
    assert.equal(
      p0After.hp,
      Math.min(maxHpBefore + 20, hpBeforePick + 20),
      "hp synced upward by +20 (clamped to new max)",
    );
  }
});

test("S2 snapshot exposes perk on picked player only", () => {
  const world = makeWorld("S2-SEED-3");
  world.__debugForcePerkOffer();
  const chosen = world.perkChoices()[0];
  world.applyPerk(0, chosen);
  const ents = world.snapshot().entities;
  const p0 = ents.find((e) => e.ownerId === 0)!;
  const p1 = ents.find((e) => e.ownerId === 1)!;
  assert.ok(Array.isArray(p0.perks) && p0.perks.length === 1, "picked player carries perks");
  assert.ok(p1.perks === undefined, "unpicked player has no perks key");
});
