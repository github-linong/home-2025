/**
 * combat.test.ts — E4 服务端权威伤害结算单测
 * ===========================================================================
 * 覆盖：resolveDamage 忽略客户端 amount（C11）、parry 覆盖减伤 0.6、未覆盖全伤、
 * resolveSkill 产出伤害意图（按槽位）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDamage, resolveSkill, SKILL_DAMAGE, SKILL_RANGE } from "../../src/combat.ts";

test("resolveDamage: 忽略客户端 amount，仅用 baseAmount（C11 反作弊）", () => {
  // 伪造 amount=9999 必须被服务端 baseAmount=10 覆盖。
  const ev = resolveDamage({ targetId: 1, amount: 9999, tick: 5, baseAmount: 10 });
  assert.equal(ev.targetId, 1);
  assert.equal(ev.deltaHp, -10, "deltaHp 必须基于 baseAmount，而非客户端 amount");
});

test("resolveDamage: parry 覆盖 → 减伤 0.6（deltaHp = -(base*0.4)）", () => {
  const ev = resolveDamage({
    targetId: 1,
    amount: 9999, // 忽略
    tick: 5,
    baseAmount: 10,
    targetParry: { active: true, windowEndTick: 100 },
  });
  // 10 * (1 - 0.6) = 4
  assert.equal(ev.deltaHp, -4, "格挡覆盖应减伤 60%");
});

test("judgeParry 集成：过期窗口全额伤害", () => {
  const ev = resolveDamage({
    targetId: 1,
    amount: 0,
    tick: 150,
    baseAmount: 10,
    targetParry: { active: true, windowEndTick: 100 },
  });
  assert.equal(ev.deltaHp, -10, "窗口过期 → 全额伤害");
});

test("resolveDamage: 最低伤害钳制为 1（max(1, ...)）", () => {
  const ev = resolveDamage({
    targetId: 1,
    amount: 0,
    tick: 5,
    baseAmount: 1,
    targetParry: { active: true, windowEndTick: 100 }, // 1*0.4=0.4 → round=0 → 钳 1
  });
  assert.equal(ev.deltaHp, -1, "极小伤害经格挡后仍至少 1");
});

test("resolveSkill: 按槽位返回伤害意图（攻击者=玩家、范围、CD）", () => {
  const intent = resolveSkill(7, 3, 10);
  assert.equal(intent.sourceId, 7);
  assert.equal(intent.slot, 3);
  assert.equal(intent.damage, SKILL_DAMAGE[3]);
  assert.equal(intent.range, SKILL_RANGE);
  assert.equal(intent.tick, 10);
});

test("resolveSkill: slot 越界归约到 0..3", () => {
  const a = resolveSkill(1, 5, 0);
  const b = resolveSkill(1, -1, 0);
  assert.equal(a.slot, 1); // 5 % 4 = 1
  assert.equal(b.slot, 3); // -1 % 4 + 4 = 3
});
