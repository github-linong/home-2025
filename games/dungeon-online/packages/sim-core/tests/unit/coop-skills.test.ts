/**
 * coop-skills.test.ts — 协作技 golden/unit 锁定（E8 系统⑨，闭合 O-A）
 *
 * 以「世界集成」视角锁定三条协作技的核心契约（C1）：
 *   1) SHIELD_ALLY：tank 给 healer 施加减伤护盾（shieldUntilTick > tick，shieldReduction ≈ 0.5）。
 *   2) TAUNT：tank 获得吸引敌火窗口（tauntUntilTick > tick）。
 *   3) REVIVE_BOOST：对倒地 healer 施放 → rescueTicks 增加（加速归队）。
 *   4) 冷却门控：冷却内二次 SHIELD_ALLY 被忽略（不刷新护盾/不刷新冷却）。
 *
 * 与 coop-skill.test.ts（纯函数 + 目标校验 + 纪律 B 静态）互补：本文件锁定
 * 「经 world.step 落地的端到端状态」，作为协作技的 golden/unit 锚点。
 *
 * 运行：node --experimental-strip-types --test tests/unit/coop-skills.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import {
  InputAction,
  EntityStatus,
  SKILL_IDS,
  type PlayerClass,
} from "../../src/types.ts";

function approx(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

/** 构造 2 名玩家（tank + healer）世界（无敌人，隔离战斗噪声，聚焦协作技落地）。 */
function makeWorld() {
  const players = [
    { seatId: 0, userId: "tank", classId: "tank" as PlayerClass },
    { seatId: 1, userId: "healer", classId: "healer" as PlayerClass },
  ];
  const w = createWorld({
    runId: "COOP-SKILLS",
    seed: "EMBER-S1",
    biomeId: 0,
    players,
    spawnEnemies: false,
  });
  const actors = w.actors();
  const bySeat = (s: number) => actors.find((a) => a.ownerId === s)!;
  return { w, bySeat };
}

test("SHIELD_ALLY: tank shields healer (shieldUntilTick > tick, shieldReduction ≈ 0.5)", () => {
  const { w, bySeat } = makeWorld();
  const tank = bySeat(0);
  const healer = bySeat(1);
  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: healer.id,
    param: SKILL_IDS.SHIELD_ALLY,
  });
  w.step();
  const tick = w.tick; // = 1（step 末尾自增）
  assert.ok((healer.shieldUntilTick ?? 0) > tick, "healer gains shield window > current tick");
  assert.ok(approx(healer.shieldReduction ?? 0, 0.5), "healer shield reduction ≈ 0.5");
  // 纪律 B：护盾仅设减伤窗口，不直改 hp/status。
  assert.equal(healer.hp, healer.maxHp, "healer hp unchanged by shield (no direct mutation)");
  void tank;
});

test("TAUNT: tank gains taunt window (tauntUntilTick > tick)", () => {
  const { w, bySeat } = makeWorld();
  const tank = bySeat(0);
  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    param: SKILL_IDS.TAUNT, // SELF 模式，无需 target
  });
  w.step();
  const tick = w.tick;
  assert.ok((tank.tauntUntilTick ?? 0) > tick, "tank gains taunt window > current tick");
});

test("REVIVE_BOOST: downed healer's rescueTicks increased", () => {
  // C4：REVIVE_BOOST 仅 ranger/healer 可施；healer 已倒地，故由 ranger(seat0) 施放。
  const players = [
    { seatId: 0, userId: "ranger", classId: "ranger" as PlayerClass },
    { seatId: 1, userId: "healer", classId: "healer" as PlayerClass },
  ];
  const w = createWorld({
    runId: "COOP-SKILLS",
    seed: "EMBER-S1",
    biomeId: 0,
    players,
    spawnEnemies: false,
  });
  const actors = w.actors();
  const ranger = actors.find((a) => a.ownerId === 0)!;
  const healer = actors.find((a) => a.ownerId === 1)!;
  // 击倒 healer（保留 ALIVE 位，符合 world 约定）。
  healer.hp = 0;
  healer.status = EntityStatus.ALIVE | EntityStatus.DOWNED;
  const before = healer.rescueTicks;
  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: healer.id,
    param: SKILL_IDS.REVIVE_BOOST,
  });
  w.step();
  assert.ok(healer.rescueTicks > before, "downed healer rescue readbar increased by REVIVE_BOOST");
  void ranger;
});

test("cooldown gating: second SHIELD_ALLY within cooldown is ignored", () => {
  const { w, bySeat } = makeWorld();
  const tank = bySeat(0);
  const healer = bySeat(1);

  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: healer.id,
    param: SKILL_IDS.SHIELD_ALLY,
  });
  w.step();
  const shieldAfterFirst = healer.shieldUntilTick;
  const cdAfterFirst = tank.cooldownUntilTick;
  assert.ok(shieldAfterFirst != null && shieldAfterFirst > 0, "first cast applied shield");
  assert.ok(cdAfterFirst != null && cdAfterFirst > 0, "first cast entered cooldown");

  // 冷却内（tick 仍 << cooldown）再次尝试施放。
  w.enqueueInput(0, {
    seq: 2,
    tick: 1,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: healer.id,
    param: SKILL_IDS.SHIELD_ALLY,
  });
  w.step();
  assert.equal(healer.shieldUntilTick, shieldAfterFirst, "shield not re-applied while on cooldown");
  assert.equal(tank.cooldownUntilTick, cdAfterFirst, "cooldown not refreshed by blocked recast");
});
