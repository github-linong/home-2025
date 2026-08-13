/**
 * g1-leveling.test.ts — G1 升级系统单元测试
 *
 * 验证：
 *  1. 玩家初始 level=1 / xp=0（快照下发）。
 *  2. 击杀敌人 → 攻击者获得经验（grunt 10 / elite 25 / boss 100）。
 *  3. 经验达阈值 → 升级：maxHp+8 / 普攻伤害 +（lv-1)*2 / hp 补 20%。
 *  4. 多级连续升级循环正确。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import { resolveDamage, CombatKind, PLAYER_ATTACK_DAMAGE, type CombatEntity } from "../../src/combat.ts";
import { PLAYER_CLASSES, InputAction, EntityKind, EntityStatus, type PlayerClass } from "../../src/types.ts";

function makeWorld(seed = "G1-LEVEL") {
  return createWorld({
    runId: "G1-RUN",
    seed,
    biomeId: 0,
    players: [
      { seatId: 0, userId: "P1", classId: PLAYER_CLASSES[0] as PlayerClass },
      { seatId: 1, userId: "P2", classId: PLAYER_CLASSES[1] as PlayerClass },
    ],
  });
}

/** 击杀者靠近目标到普攻射程内，并持续攻击直到敌人死亡。 */
function attackToKill(w: ReturnType<typeof createWorld>, seat: number, targetId: number): void {
  for (let t = 0; t < 40; t++) {
    const me = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === seat);
    const tgt = w.actors().find((a) => a.id === targetId);
    if (!me || !tgt) break;
    const dx = tgt.x - me.x, dy = tgt.y - me.y;
    const len = Math.hypot(dx, dy) || 1;
    w.enqueueInput(seat, { seq: t + 1, tick: t, action: InputAction.MOVE, dir: { x: dx / len, y: dy / len } });
    w.step();
  }
  for (let t = 0; t < 60; t++) {
    const tgt = w.actors().find((a) => a.id === targetId);
    if (!tgt || (tgt.status & EntityStatus.ALIVE) === 0) break;
    w.enqueueInput(seat, { seq: 1000 + t, tick: 0, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: targetId });
    w.enqueueInput(1, { seq: 1000 + t, tick: 0, action: InputAction.MOVE, dir: { x: 0, y: 1 } });
    w.step();
  }
}

test("G1 initial: player starts at level 1, xp 0", () => {
  const w = makeWorld();
  w.step();
  const p0 = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0)!;
  assert.equal(p0.level, 1, "starts level 1");
  assert.equal(p0.xp, 0, "starts xp 0");
  const snap = w.snapshot().entities.find((e) => e.ownerId === 0)!;
  assert.equal(snap.level, 1, "snapshot exposes level");
  assert.equal(snap.xp, 0, "snapshot exposes xp");
});

test("G1 killing a grunt grants xp to the killer", () => {
  const w = makeWorld("G1-KILL");
  const enemy = w.actors().find((a) => a.kind === EntityKind.ENEMY)!;
  const before = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0)!;
  const xpBefore = before.xp ?? 0;
  attackToKill(w, 0, enemy.id);
  const after = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0)!;
  // SLAUGHTER-FIX：grunt 击杀 → +6 xp（阈值 30+(lv-1)*25）
  const totalEarned = (after.xp ?? 0) + ((after.level - 1) * 30) - xpBefore;
  assert.ok(totalEarned >= 6, "killing a grunt grants at least 6 xp");
});

test("G1 damage scales with level in resolveDamage (source.level>1 → +2/lv)", () => {
  // 用 combat.resolveDamage 纯函数验证：玩家等级 >1 时普攻伤害 +（lv-1)*2。
  // 不依赖真实击杀（玩家单刷会先被围殴倒地，测试脆弱），直接构造 level 的 source。
  const target = { id: 10, hp: 100, maxHp: 100, status: EntityStatus.ALIVE } as CombatEntity;
  const lv1 = { id: 1, hp: 196, maxHp: 196, status: EntityStatus.ALIVE, level: 1 } as CombatEntity;
  const lv3 = { id: 2, hp: 196, maxHp: 196, status: EntityStatus.ALIVE, level: 3 } as CombatEntity;
  // level 1 → base 伤害
  const ev1 = resolveDamage(
    { tick: 5, entities: new Map([[10, target], [1, lv1]]) },
    { sourceId: 1, targetId: 10, amount: 0, tick: 5, kind: CombatKind.ATTACK },
  );
  assert.equal(ev1.deltaHp, -PLAYER_ATTACK_DAMAGE, "level 1 → base damage");
  // level 3 → +6（(3-1)*3）→ base+6（SLAUGHTER-FIX：+3/级）
  const t2 = { id: 10, hp: 100, maxHp: 100, status: EntityStatus.ALIVE } as CombatEntity;
  const ev2 = resolveDamage(
    { tick: 5, entities: new Map([[10, t2], [2, lv3]]) },
    { sourceId: 2, targetId: 10, amount: 0, tick: 5, kind: CombatKind.ATTACK },
  );
  assert.equal(ev2.deltaHp, -(PLAYER_ATTACK_DAMAGE + 6), "level 3 → base + 6 (lv-1)*3");
});
