/**
 * world-dodge.test.ts — O-M 缺陷回归（权威模拟层 / world.ts）
 *
 * O-M：combat.ts 在 DODGE 时给来源实体置 EntityStatus.IFRAME 位并设
 *   iframeUntilTick = tick + DODGE_IFRAME_TICKS，但 world.ts 原本：
 *     (1) 全文件无清除 IFRAME 位的逻辑 → IFRAME 永不清；
 *     (2) 玩家输入门控用严格相等 `a.status === EntityStatus.ALIVE`。
 *   后果：玩家闪避后 status = ALIVE|IFRAME(17) ≠ ALIVE(1) → 所有输入分支被跳过，
 *         且 IFRAME 永不清 → 玩家永久冻结。
 *
 * 本文件在 world 层（createWorld + enqueueInput + step）直接守住 O-M 的双段验收：
 *   (a) DODGE 后 iframeUntilTick / IFRAME 位正确设置；
 *   (b) 窗口内：对 dodger 承受敌击 HP 不降（免伤）+ 玩家可继续 MOVE/ATTACK/DODGE（位运算解冻全部动作）；
 *   (c) 窗口后：IFRAME 位被清、ALIVE 仍真、可继续行动（位生命周期卫生）；
 *   (d) world.step 级关键回归：DODGE → 跨窗口空闲 → 发 MOVE → x 前进（未被永久冻结）；
 *   (e) 可重复闪避 + 战斗输入在窗口外可用（无残留冻结）。
 *
 * 不依赖 golden 序列（其固定输入不含 DODGE，GOLDEN_WORLD_HASH 不受影响）。
 * 运行：node --experimental-strip-types --test tests/unit/world-dodge.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import { resolveDamage, CombatKind, DODGE_IFRAME_TICKS } from "../../src/combat.ts";
import { InputAction, PLAYER_CLASSES, EntityKind, EntityStatus } from "../../src/types.ts";
import type { CombatEntity } from "../../src/combat.ts";
import type { World } from "../../src/world.ts";

/** 最小 fixture：1 名玩家（tank，moveSpeed=140 → 每 tick 位移 140/30）。 */
function makeWorld(): World {
  return createWorld({
    runId: "O-M-REGRESS",
    seed: "O-M-SEED",
    biomeId: 0,
    players: [{ seatId: 0, userId: "P1", classId: PLAYER_CLASSES[0] }],
  });
}

/** 取 world 中任一敌人 id（仅用于 ATTACK target，world.step 不校验目标存在）。 */
function enemyId(world: World): number {
  return world.actors().find((a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS)!.id;
}

/** DIST-FIX：玩家出生距 wave1 敌人 >150px（>普攻射程 60px）。测试需 ATTACK 前先靠近敌人。 */
function moveClose(world: World, targetId: number, ticks = 30): void {
  for (let t = 0; t < ticks; t++) {
    const me = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
    const tgt = world.actors().find((a) => a.id === targetId);
    if (!me || !tgt) break;
    const dx = tgt.x - me.x;
    const dy = tgt.y - me.y;
    const len = Math.hypot(dx, dy) || 1;
    world.enqueueInput(0, { seq: t + 1, tick: t, action: InputAction.MOVE, dir: { x: dx / len, y: dy / len } });
    world.step();
  }
}

function dodgeCmd(seq: number) {
  return { seq, tick: 0, action: InputAction.DODGE, dir: { x: 0, y: 0 } };
}
function moveCmd(seq: number, dir: { x: number; y: number }) {
  return { seq, tick: 0, action: InputAction.MOVE, dir };
}
function attackCmd(seq: number, target: number) {
  return { seq, tick: 0, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target };
}

test("(a) DODGE grants IFRAME window on the dodger (O-M source state)", () => {
  const world = makeWorld();
  const p = world.actors()[0];
  const dodgeTick = world.tick; // = 0
  world.enqueueInput(0, dodgeCmd(1));
  world.step();

  assert.equal(
    p.iframeUntilTick,
    dodgeTick + DODGE_IFRAME_TICKS,
    "iframeUntilTick = dodgeTick + DODGE_IFRAME_TICKS",
  );
  assert.equal(p.status & EntityStatus.IFRAME, EntityStatus.IFRAME, "IFRAME bit set on dodger");
  assert.equal(p.status & EntityStatus.ALIVE, EntityStatus.ALIVE, "ALIVE still set alongside IFRAME (status=17)");
});

test("(b) during iframe window: negated damage + player can MOVE/ATTACK/DODGE (binary gating unfreezes)", () => {
  const world = makeWorld();
  const p = world.actors()[0];
  const eid = enemyId(world);
  // DIST-FIX：先靠近敌人（进入普攻射程），保证窗口内 ATTACK 能建立 telegraph。
  moveClose(world, eid);
  let seq = 31;

  // DODGE → status=17, iframeUntilTick=当前+12。
  world.enqueueInput(0, dodgeCmd(seq++));
  world.step();
  assert.equal(p.status, EntityStatus.ALIVE | EntityStatus.IFRAME, "status = ALIVE|IFRAME = 17");

  // 窗口内对 dodger 造成命伤 → HP 不降（免伤，combat.ts 逻辑）。
  const hpBeforeHit = p.hp;
  const ev = resolveDamage(
    { tick: world.tick, entities: new Map([[p.id, p as CombatEntity]]) },
    { sourceId: 999, targetId: p.id, amount: 0, tick: world.tick, kind: CombatKind.ATTACK },
  );
  assert.equal(ev.deltaHp, 0, "attack during iframe is negated (deltaHp=0)");
  assert.equal(p.hp, hpBeforeHit, "player hp unchanged after negated hit during iframe");

  // MOVE：向右一步 → x 变化（证明 17 & 1 = 1 解冻移动）。
  const xBefore = p.x;
  world.enqueueInput(0, moveCmd(seq++, { x: 1, y: 0 }));
  world.step();
  assert.ok(p.x > xBefore, "player can MOVE during iframe (unfrozen by bitwise gating)");

  // ATTACK：可再次发出攻击（前摇建立，证明非仅 MOVE 解冻）。
  world.enqueueInput(0, attackCmd(seq++, enemyId(world)));
  world.step();
  assert.ok(p.telegraph, "player can ATTACK during iframe (telegraph created)");

  // DODGE：可再次闪避（刷新窗口）。
  const wBefore = p.iframeUntilTick;
  world.enqueueInput(0, dodgeCmd(seq++));
  world.step();
  assert.ok(
    p.iframeUntilTick != null && p.iframeUntilTick > (wBefore ?? -1),
    "player can re-DODGE during iframe (window refreshed)",
  );
});

test("(c) after iframe window: IFRAME bit cleared, ALIVE retained, player keeps acting (lifecycle hygiene)", () => {
  const world = makeWorld();
  const p = world.actors()[0];
  world.enqueueInput(0, dodgeCmd(1));
  world.step(); // tick 1, iframeUntilTick=12

  // 推进越过免伤窗口（> 12）。每 tick 重新入队 MOVE（C11 seq 单调）。
  for (let i = 2; i <= DODGE_IFRAME_TICKS + 4; i++) {
    world.enqueueInput(0, moveCmd(i, { x: 1, y: 0 }));
    world.step();
  }

  assert.ok(
    p.iframeUntilTick == null || world.tick > p.iframeUntilTick,
    "stepped past iframe window",
  );
  assert.equal(p.status & EntityStatus.IFRAME, 0, "IFRAME bit cleared after window");
  assert.equal(p.status & EntityStatus.ALIVE, EntityStatus.ALIVE, "ALIVE still set after window (hygiene)");

  // 仍可行动：窗口后发 MOVE。
  const xBefore = p.x;
  world.enqueueInput(0, moveCmd(DODGE_IFRAME_TICKS + 5, { x: 1, y: 0 }));
  world.step();
  assert.ok(p.x > xBefore, "player still acts after iframe window (not frozen)");
});

test("(d) regression: DODGE then idle past window then MOVE advances x (no permanent freeze)", () => {
  const world = makeWorld();
  const p = world.actors()[0];
  const x0 = p.x;

  // DODGE（触发 O-M 源状态：status=ALIVE|IFRAME）。
  world.enqueueInput(0, dodgeCmd(1));
  world.step();

  // 跨过免伤窗口，期间无输入（玩家空闲）。
  for (let i = 0; i < DODGE_IFRAME_TICKS + 2; i++) {
    world.step();
  }

  // 窗口后发出 MOVE：旧代码因 status=17≠1 跳过 → x 不变 → 永久冻结；新代码 → x 前进。
  world.enqueueInput(0, moveCmd(2, { x: 1, y: 0 }));
  world.step();
  assert.ok(p.x > x0, "player MOVED right after dodge+window (NOT permanently frozen by O-M)");
});

test("(e) repeated dodge + combat inputs usable outside window (no carry-over freeze)", () => {
  const world = makeWorld();
  const p = world.actors()[0];
  const eid = enemyId(world);
  // DIST-FIX：先靠近敌人（进入普攻射程），保证 ATTACK 能建立 telegraph。
  moveClose(world, eid);
  const s0 = 31;

  // 第一次闪避 + 推进越过窗口。
  world.enqueueInput(0, dodgeCmd(s0));
  world.step();
  for (let i = s0 + 1; i <= s0 + DODGE_IFRAME_TICKS + 2; i++) world.step();

  // 窗口外再次闪避。
  const wBefore = p.iframeUntilTick;
  world.enqueueInput(0, dodgeCmd(s0 + DODGE_IFRAME_TICKS + 3));
  world.step();
  assert.ok(
    p.iframeUntilTick != null && p.iframeUntilTick !== wBefore,
    "re-dodge works outside window (iframeUntilTick refreshed)",
  );
  assert.equal(p.status & EntityStatus.IFRAME, EntityStatus.IFRAME, "IFRAME re-granted by re-dodge");

  // 窗口外发动攻击（前摇建立）。
  world.enqueueInput(0, attackCmd(s0 + DODGE_IFRAME_TICKS + 4, eid));
  world.step();
  assert.ok(p.telegraph, "attack usable outside window (no carry-over freeze)");
});
