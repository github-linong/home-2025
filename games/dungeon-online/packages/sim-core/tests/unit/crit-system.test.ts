/**
 * crit-system.test.ts — CRIT（P2）：暴击倍率结算。
 *
 * 验证：
 *   - resolveDamage 传入 critMult>1 → 伤害 ×critMult，事件 crit=true
 *   - 未传 critMult → 伤害不变，crit 为 undefined（golden 无损）
 *   - 世界层：玩家 AOE 攻击确定性派生暴击（15% 概率，seed 稳定）
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import { resolveDamage, CombatKind, PLAYER_ATTACK_DAMAGE } from "../../src/combat.ts";
import { EntityKind, EntityStatus } from "../../src/types.ts";

function mkCombat(hp: number, maxHp: number) {
  const ent = { id: 7, hp, maxHp, status: EntityStatus.ALIVE };
  return { ent, state: { tick: 100, entities: new Map([[7, ent]]) } };
}

test("CRIT: critMult>1 multiplies damage and sets crit flag", () => {
  const { ent, state } = mkCombat(100, 100);
  const ev = resolveDamage(state, {
    sourceId: 1, targetId: 7, amount: 0, tick: 100, kind: CombatKind.ATTACK, critMult: 1.5,
  });
  assert.equal(ent.hp, 100 - Math.round(PLAYER_ATTACK_DAMAGE * 1.5), "暴击伤害 ×1.5");
  assert.equal(ev.crit, true, "事件标记暴击");
});

test("CRIT: no critMult → normal damage, no crit flag", () => {
  const { ent, state } = mkCombat(100, 100);
  const ev = resolveDamage(state, {
    sourceId: 1, targetId: 7, amount: 0, tick: 100, kind: CombatKind.ATTACK,
  });
  assert.equal(ent.hp, 100 - PLAYER_ATTACK_DAMAGE, "普攻伤害不变");
  assert.equal(ev.crit, undefined, "无暴击标记");
});

test("CRIT: player AOE deterministically derives crit (stable seed)", () => {
  // 验证暴击派生是确定性的：同 seed 两次推进，敌人掉血序列一致（含可能的暴击 57）。
  // 不强断言必出暴击（15% 概率取决于序列）；只验证「确定性」与「伤害合法值（38 或 57）」。
  const mk = () => createWorld({
    runId: "CRIT-W", seed: "S0", biomeId: 0,
    players: [{ seatId: 0, userId: "P1", classId: "tank" }],
  });
  const collect = (w: ReturnType<typeof createWorld>) => {
    const drops: number[] = [];
    let prevHp = new Map<number, number>();
    for (let t = 0; t < 200; t++) {
      w.enqueueInput(0, { seq: 1000 + t, tick: 0, action: 0, dir: { x: 0, y: 0 } });
      w.step();
      for (const a of w.actors()) {
        if (a.kind === EntityKind.ENEMY) {
          const p = prevHp.get(a.id);
          if (p != null && a.hp < p) drops.push(p - a.hp);
          prevHp.set(a.id, a.hp);
        }
      }
    }
    return drops;
  };
  const d1 = collect(mk());
  const d2 = collect(mk());
  assert.deepEqual(d1, d2, "暴击派生确定性（两次运行掉血序列一致）");
  for (const d of d1) {
    assert.ok(d === PLAYER_ATTACK_DAMAGE || d === Math.round(PLAYER_ATTACK_DAMAGE * 1.5), `伤害合法（38 普攻或 57 暴击），实际 ${d}`);
  }
});
