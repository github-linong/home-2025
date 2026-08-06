/**
 * downed-rescue.test.ts — E7 倒地/救援/超时/托管（系统⑪，sim-core 权威）
 *
 * 覆盖（S7.1–S7.7 + D8）：
 *  1) S7.2 救援读条：队友邻近累积 RESCUE_TICKS → 复活（回血 revivalHp）。
 *  2) S7.4 倒地免疫补刀：DOWNED 玩家再受致命伤害 → hp/status 不变，绝不进 OUT。
 *  3) S7.2 降级分支：无队友时 SOLO_SELF_RESCUE_TICKS 自动复活（1hp 降级）。
 *  4) S7.5 超时 → OUT：有队友但不在半径内（无人施援）→ 600 tick 后 OUT。
 *  5) S7.6/D8 断线托管：断开瞬间抓拍 PersonalState（单次持有）+ 暂停 DOWNED/救援计时，
 *     重连无跳变恢复剩余窗口。
 *  6) S7.2 救援读条保持（不衰减）：队友不在半径内时 rescueTicks 不累积。
 *
 * 运行：node --experimental-strip-types --test tests/unit/downed-rescue.test.ts
 * 说明：测试直接操作 world.actors() 返回的实体引用（同对象）以隔离战斗噪声、聚焦 ⑪ 机制；
 *       断线/倒地置位在生产中仅由 ⑦ resolveDamage 与 world.step 完成（纪律 B）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import { resolveDamage, CombatKind } from "../../src/combat.ts";
import {
  EntityStatus,
  EntityKind,
  PLAYER_CLASSES,
} from "../../src/types.ts";
import {
  RESCUE_TICKS,
  SOLO_SELF_RESCUE_TICKS,
  DOWNED_TIMEOUT_TICKS,
  RESCUE_RADIUS,
  revivalHp,
} from "../../src/rescue.ts";
import type { CombatEntity } from "../../src/combat.ts";
import type { World } from "../../src/world.ts";

/** 构造 2 名玩家（tank+ranger）的世界（敌人存在但不参与 ⑪ 判定，测试会隔离其干扰）。 */
function makeWorld(players = 2): World {
  const seats = [];
  for (let i = 0; i < players; i++) {
    seats.push({ seatId: i, userId: `P${i + 1}`, classId: PLAYER_CLASSES[i % PLAYER_CLASSES.length] });
  }
  return createWorld({
    runId: "E7-RESCUE",
    seed: "EMBER-S1",
    biomeId: 0,
    players: seats,
  });
}

/** 将某座位玩家经 ⑦ 权威结算击倒（hp→0，置 DOWNED）。返回该玩家实体引用。 */
function downPlayer(world: World, seatId: number) {
  const target = world.actors().find((a) => a.ownerId === seatId)!;
  const m = new Map<number, CombatEntity>(world.actors().map((a) => [a.id, a as CombatEntity]));
  resolveDamage(
    { tick: world.tick, entities: m },
    {
      sourceId: target.id + 1000,
      targetId: target.id,
      amount: 0,
      tick: world.tick,
      kind: CombatKind.ATTACK,
      enemyDamage: target.maxHp + 999,
    },
  );
  assert.equal(target.hp, 0, "downed player hp clamped to 0");
  assert.equal(target.status & EntityStatus.DOWNED, EntityStatus.DOWNED, "downed bit set");
  return target;
}

/** 将救援者每 tick 钉在倒地玩家身旁并保活（隔离敌人干扰，聚焦 ⑪ 救援判定）。 */
function pinRescuerAdjacent(world: World, downedSeat: number, rescuerSeat: number) {
  const downed = world.actors().find((a) => a.ownerId === downedSeat)!;
  const rescuer = world.actors().find((a) => a.ownerId === rescuerSeat)!;
  rescuer.x = downed.x;
  rescuer.y = downed.y;
  rescuer.status = EntityStatus.ALIVE;
  rescuer.hp = rescuer.maxHp;
}

/** 将救援者每 tick 钉在远处且保活（有效候选但不在 RESCUE_RADIUS 内，验证不施援/超时）。 */
function pinRescuerFar(world: World, downedSeat: number, rescuerSeat: number) {
  const downed = world.actors().find((a) => a.ownerId === downedSeat)!;
  const rescuer = world.actors().find((a) => a.ownerId === rescuerSeat)!;
  rescuer.x = downed.x + RESCUE_RADIUS * 4;
  rescuer.y = downed.y;
  rescuer.status = EntityStatus.ALIVE;
  rescuer.hp = rescuer.maxHp;
}

test("S7.2 救援读条：队友邻近累积 RESCUE_TICKS → 复活（回血 revivalHp）", () => {
  const world = makeWorld(2);
  const p0 = downPlayer(world, 0);
  const expectedHp = revivalHp(p0.maxHp);

  // 救援者每 tick 贴身保活，推进至刚好超过 RESCUE_TICKS。
  for (let i = 0; i < RESCUE_TICKS; i++) {
    pinRescuerAdjacent(world, 0, 1);
    world.step();
  }

  assert.equal(p0.status & EntityStatus.DOWNED, 0, "revived: DOWNED cleared");
  assert.equal(p0.hp, expectedHp, `revived hp = revivalHp(maxHp)=${expectedHp}`);
  assert.ok(p0.hp > 0, "revived with positive hp");
});

test("S7.4 倒地免疫补刀：DOWNED 玩家再受致命伤害 → hp/status 不变，绝不进 OUT", () => {
  const world = makeWorld(2);
  const p0 = downPlayer(world, 0);

  // 倒地后再次提交致命伤害请求。
  const m = new Map<number, CombatEntity>(world.actors().map((a) => [a.id, a as CombatEntity]));
  const ev = resolveDamage(
    { tick: world.tick, entities: m },
    {
      sourceId: p0.id + 1000,
      targetId: p0.id,
      amount: 0,
      tick: world.tick,
      kind: CombatKind.ATTACK,
      enemyDamage: 9999,
    },
  );

  assert.equal(ev.deltaHp, 0, "no damage applied to downed target (no-op)");
  assert.equal(p0.hp, 0, "hp unchanged at 0");
  assert.equal(p0.status & EntityStatus.DOWNED, EntityStatus.DOWNED, "still DOWNED, not cleared");
  assert.equal(p0.status & EntityStatus.OUT, 0, "OUT never entered via damage (S7.4)");
});

test("S7.2 降级分支：无队友时 SOLO_SELF_RESCUE_TICKS 自动复活（1hp 降级）", () => {
  const world = makeWorld(1); // 单人世界：无候选救援者
  const p0 = downPlayer(world, 0);

  for (let i = 0; i < SOLO_SELF_RESCUE_TICKS; i++) world.step();

  assert.equal(p0.status & EntityStatus.DOWNED, 0, "solo revived: DOWNED cleared");
  assert.equal(p0.hp, 1, "degraded revive at 1 hp");
});

test("S7.5 超时 → OUT：有队友但不在半径内（无人施援）→ 600 tick 后 OUT", () => {
  const world = makeWorld(2);
  const p0 = downPlayer(world, 0);

  // 救援者存在（有效候选）但始终远处 → 不施援 → 倒地计时累计至超时。
  for (let i = 0; i < DOWNED_TIMEOUT_TICKS; i++) {
    pinRescuerFar(world, 0, 1);
    world.step();
  }

  assert.equal(p0.status & EntityStatus.DOWNED, 0, "timed out: DOWNED cleared");
  assert.equal(p0.status & EntityStatus.OUT, EntityStatus.OUT, "OUT set on timeout (S7.5)");
  assert.equal(p0.status & EntityStatus.ALIVE, EntityStatus.ALIVE, "ALIVE retained (spectator this run)");
});

test("S7.6/D8 断线托管：抓拍 PersonalState + 暂停计时，重连无跳变恢复", () => {
  const world = makeWorld(2);
  const p0 = downPlayer(world, 0);

  // 倒地后推进 50 tick（不施援），计时应累计至 50。
  for (let i = 0; i < 50; i++) world.step();
  assert.equal(p0.downedTicks, 50, "downedTicks accumulates before disconnect");

  // 断开：应单次抓拍 PersonalState（剩余窗口 = 600-50 = 550）。
  world.setDisconnected(0, true);
  assert.ok(p0.personalState, "PersonalState captured on disconnect");
  assert.equal(p0.personalState!.seatId, 0);
  assert.equal(p0.personalState!.status & EntityStatus.DOWNED, EntityStatus.DOWNED);
  assert.equal(p0.personalState!.hp, 0);
  assert.equal(p0.personalState!.downedRemainingTicks, DOWNED_TIMEOUT_TICKS - 50);
  assert.equal(p0.personalState!.rescueProgressTicks, 0);

  // 断开期间推进 100 tick：计时应冻结（不进 OUT）。
  for (let i = 0; i < 100; i++) world.step();
  assert.equal(p0.downedTicks, 50, "downedTicks frozen while disconnected (D8 pause)");
  assert.equal(p0.status & EntityStatus.OUT, 0, "no OUT while disconnected");
  assert.equal(p0.status & EntityStatus.DOWNED, EntityStatus.DOWNED, "still DOWNED while disconnected");

  // 重连：剩余窗口无损恢复，计时从 50 继续累计。
  world.setDisconnected(0, false);
  for (let i = 0; i < 5; i++) world.step();
  assert.equal(p0.downedTicks, 55, "resumes from remaining window (no jump) after reconnect");
});

test("S7.2 救援读条保持（不衰减）：队友不在半径内时 rescueTicks 不累积", () => {
  const world = makeWorld(2);
  const p0 = downPlayer(world, 0);

  // 救援者在远处 50 tick：rescueTicks 应保持 0（不衰减，无累积）。
  for (let i = 0; i < 50; i++) {
    pinRescuerFar(world, 0, 1);
    world.step();
  }
  assert.equal(p0.rescueTicks, 0, "rescueTicks stays 0 while rescuer out of radius");

  // 救援者贴身再 90 tick：从 0 起累积，复活。
  for (let i = 0; i < RESCUE_TICKS; i++) {
    pinRescuerAdjacent(world, 0, 1);
    world.step();
  }
  assert.equal(p0.status & EntityStatus.DOWNED, 0, "revives after adjacent rescue progress");
  assert.equal(p0.hp, revivalHp(p0.maxHp), "revived hp = revivalHp(maxHp)");
});
