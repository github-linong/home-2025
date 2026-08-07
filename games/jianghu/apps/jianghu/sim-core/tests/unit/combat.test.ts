/**
 * combat.test.ts — E4 服务端权威伤害结算单测
 * ===========================================================================
 * 覆盖：resolveDamage 忽略客户端 amount（C11）、parry 覆盖减伤 0.6、未覆盖全伤、
 * resolveSkill 产出伤害意图（按槽位）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDamage, resolveSkill, getSkillDef, SKILL_DAMAGE, SKILL_RANGE, SKILL_RANGE_BY_SLOT, SKILL_NAMES, SKILL_DESCS } from "../../src/combat.ts";

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
  // E11：用槽 0 断言（range 保持旧统一值 SKILL_RANGE，playtest golden 锚点）。
  const intent = resolveSkill(7, 0, 10);
  assert.equal(intent.sourceId, 7);
  assert.equal(intent.slot, 0);
  assert.equal(intent.damage, SKILL_DAMAGE[0]);
  assert.equal(intent.range, SKILL_RANGE);
  assert.equal(intent.tick, 10);
});

test("E11 SKILL_RANGE_BY_SLOT: 各槽 range 差异化（槽0=72 / 槽1=120 / 槽2=96 / 槽3≈86 px）", () => {
  assert.equal(SKILL_RANGE_BY_SLOT.length, 4);
  assert.equal(SKILL_RANGE_BY_SLOT[0], 72, "槽0 烈斩 1.5×TILE=72px（保持现值）");
  assert.equal(SKILL_RANGE_BY_SLOT[1], 120, "槽1 剑气 2.5×TILE=120px");
  assert.equal(SKILL_RANGE_BY_SLOT[2], 96, "槽2 震地 2.0×TILE=96px");
  assert.equal(SKILL_RANGE_BY_SLOT[3], 86, "槽3 破军 1.8×TILE≈86px");
  assert.equal(SKILL_RANGE, SKILL_RANGE_BY_SLOT[0], "SKILL_RANGE 兼容引用 = 槽0 值");
});

test("E11 getSkillDef: 各槽 range 按 SKILL_RANGE_BY_SLOT 取（槽 0 回退兼容=旧值，playtest 锚点）", () => {
  const d0 = getSkillDef(0);
  assert.equal(d0.damage, 20, "槽0 伤害 20 保持（golden 锚点）");
  assert.equal(d0.range, 72, "槽0 range 72px 保持（golden 锚点）");
  assert.equal(d0.cdTicks, 36, "槽0 CD 36tick=3s 保持（golden 锚点）");
  // 其余槽位 range 与 SKILL_RANGE_BY_SLOT 一致（伤害/CD 数值未动）。
  for (let s = 0; s < SKILL_RANGE_BY_SLOT.length; s++) {
    const def = getSkillDef(s);
    assert.equal(def.range, SKILL_RANGE_BY_SLOT[s], `槽${s} range 必须 = SKILL_RANGE_BY_SLOT[${s}]`);
  }
  // 差异化成立：range 全不相同（近战<震地<破军<剑气），且伤害/CD 与常量一致。
  const ranges = SKILL_RANGE_BY_SLOT.map((_, i) => getSkillDef(i).range);
  assert.equal(new Set(ranges).size, 4, "4 槽 range 应两两不同");
  for (let s = 0; s < SKILL_DAMAGE.length; s++) {
    assert.equal(getSkillDef(s).damage, SKILL_DAMAGE[s]);
  }
});

test("E11 SKILL_NAMES / SKILL_DESCS: 非空且 4 项（与 SKILL_DAMAGE 槽位对齐）", () => {
  assert.equal(SKILL_NAMES.length, 4, "4 个中文技能名");
  assert.equal(SKILL_DESCS.length, 4, "4 条定位描述");
  assert.equal(SKILL_NAMES.length, SKILL_DAMAGE.length, "名称/伤害槽位对齐");
  for (let i = 0; i < SKILL_NAMES.length; i++) {
    assert.ok(SKILL_NAMES[i].trim().length > 0, `SKILL_NAMES[${i}] 非空`);
    assert.ok(SKILL_DESCS[i].trim().length > 0, `SKILL_DESCS[${i}] 非空`);
  }
  assert.deepEqual([...SKILL_NAMES], ["烈斩", "剑气", "震地", "破军"], "中文名按设计表落地");
});

test("resolveSkill: slot 越界归约到 0..3", () => {
  const a = resolveSkill(1, 5, 0);
  const b = resolveSkill(1, -1, 0);
  assert.equal(a.slot, 1); // 5 % 4 = 1
  assert.equal(b.slot, 3); // -1 % 4 + 4 = 3
});
