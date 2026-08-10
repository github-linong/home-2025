/**
 * class-skill-restriction.test.ts — C4 每职业协作技白名单（权威校验）
 *
 * 覆盖（M15 / C4）：
 *  - CLASS_SKILLS 数据契约：4 职业，各 2 个可用技。
 *  - resolveSkillApplication 在「职业无权施放该技」时返回 null（不进冷却、不落地）。
 *  - 白名单仅作用于「已知 classId」的 caster；classId 为 undefined（legacy/未知）时
 *    跳过白名单（向后兼容安全网），任何技能均可施放。
 *
 * 纯单元验证：直接构造 SkillActorView，无需完整 world。
 * 运行：node --experimental-strip-types --test tests/unit/class-skill-restriction.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_SKILLS,
  PLAYER_CLASSES,
  SKILL_IDS,
  EntityKind,
  EntityStatus,
} from "../../src/types.ts";
import { resolveSkillApplication, type SkillActorView } from "../../src/skills.ts";

// 只读视图构造辅助（与 skills.ts SkillActorView 对齐；kind=PLAYER, status=ALIVE）。
const caster = (classId: SkillActorView["classId"], id = 1): SkillActorView => ({
  id,
  kind: EntityKind.PLAYER,
  status: EntityStatus.ALIVE,
  classId,
});
const ally: SkillActorView = { id: 2, kind: EntityKind.PLAYER, status: EntityStatus.ALIVE };
const downedAlly: SkillActorView = {
  id: 3,
  kind: EntityKind.PLAYER,
  status: EntityStatus.ALIVE | EntityStatus.DOWNED,
};

// ---------------------------------------------------------------------------
// 1) CLASS_SKILLS 数据契约：4 职业，tank/healer 各 2 个可用技，ranger/mage (C4b 进攻技) 各 3 个
// ---------------------------------------------------------------------------
test("CLASS_SKILLS: exactly 4 classes with expected whitelist sizes (C4b: ranger/mage = 3)", () => {
  assert.equal(Object.keys(CLASS_SKILLS).length, 4, "4 class entries");
  const EXPECTED: Record<string, number> = { tank: 2, ranger: 3, mage: 3, healer: 2 };
  for (const cls of PLAYER_CLASSES) {
    assert.ok(cls in CLASS_SKILLS, `${cls} present in CLASS_SKILLS`);
    assert.equal(CLASS_SKILLS[cls].length, EXPECTED[cls], `${cls} has ${EXPECTED[cls]} allowed skills`);
  }
  // SHIELD_ALLY 为通用技：每职业都拥有。
  for (const cls of PLAYER_CLASSES) {
    assert.ok(
      CLASS_SKILLS[cls].includes(SKILL_IDS.SHIELD_ALLY),
      `${cls} includes universal SHIELD_ALLY`,
    );
  }
  // C4b：ranger 持有专属进攻技 MARK，mage 持有专属进攻技 BARRAGE。
  assert.ok(CLASS_SKILLS.ranger.includes(SKILL_IDS.MARK), "ranger whitelist includes MARK");
  assert.ok(CLASS_SKILLS.mage.includes(SKILL_IDS.BARRAGE), "mage whitelist includes BARRAGE");
  // tank/healer 不持有任何进攻技（保持 2 技）。
  assert.ok(!CLASS_SKILLS.tank.includes(SKILL_IDS.MARK), "tank whitelist excludes MARK");
  assert.ok(!CLASS_SKILLS.tank.includes(SKILL_IDS.BARRAGE), "tank whitelist excludes BARRAGE");
  assert.ok(!CLASS_SKILLS.healer.includes(SKILL_IDS.MARK), "healer whitelist excludes MARK");
  assert.ok(!CLASS_SKILLS.healer.includes(SKILL_IDS.BARRAGE), "healer whitelist excludes BARRAGE");
});

// ---------------------------------------------------------------------------
// 2) tank 可施 TAUNT（招牌技），不可施 REVIVE_BOOST
// ---------------------------------------------------------------------------
test("tank: TAUNT allowed, REVIVE_BOOST rejected", () => {
  assert.ok(
    resolveSkillApplication(caster("tank"), null, SKILL_IDS.TAUNT, 0) != null,
    "tank casting TAUNT → allowed",
  );
  assert.equal(
    resolveSkillApplication(caster("tank"), downedAlly, SKILL_IDS.REVIVE_BOOST, 0),
    null,
    "tank casting REVIVE_BOOST → rejected (not in whitelist)",
  );
});

// ---------------------------------------------------------------------------
// 3) healer 可施 REVIVE_BOOST（招牌技），不可施 TAUNT
// ---------------------------------------------------------------------------
test("healer: REVIVE_BOOST allowed, TAUNT rejected", () => {
  assert.ok(
    resolveSkillApplication(caster("healer"), downedAlly, SKILL_IDS.REVIVE_BOOST, 0) != null,
    "healer casting REVIVE_BOOST on DOWNED ally → allowed",
  );
  assert.equal(
    resolveSkillApplication(caster("healer"), null, SKILL_IDS.TAUNT, 0),
    null,
    "healer casting TAUNT → rejected (not in whitelist)",
  );
});

// ---------------------------------------------------------------------------
// 4) ranger 可施 SHIELD_ALLY（通用技）
// ---------------------------------------------------------------------------
test("ranger: SHIELD_ALLY allowed", () => {
  assert.ok(
    resolveSkillApplication(caster("ranger"), ally, SKILL_IDS.SHIELD_ALLY, 0) != null,
    "ranger casting SHIELD_ALLY on ally → allowed",
  );
});

// ---------------------------------------------------------------------------
// 5) mage：TAUNT 允许，REVIVE_BOOST 拒绝（与 tank 同款白名单）
// ---------------------------------------------------------------------------
test("mage: TAUNT allowed, REVIVE_BOOST rejected", () => {
  assert.ok(
    resolveSkillApplication(caster("mage"), null, SKILL_IDS.TAUNT, 0) != null,
    "mage casting TAUNT → allowed",
  );
  assert.equal(
    resolveSkillApplication(caster("mage"), downedAlly, SKILL_IDS.REVIVE_BOOST, 0),
    null,
    "mage casting REVIVE_BOOST → rejected (not in whitelist)",
  );
});

// ---------------------------------------------------------------------------
// 6) 向后兼容：classId 为 undefined（legacy/未知 caster）跳过白名单 → 任意技可施
// ---------------------------------------------------------------------------
test("legacy caster (classId undefined): whitelist skipped, any skill allowed", () => {
  const legacy: SkillActorView = { id: 1, kind: EntityKind.PLAYER, status: EntityStatus.ALIVE };
  // SHIELD_ALLY（ALLY 模式）需有效盟友目标。
  assert.ok(
    resolveSkillApplication(legacy, ally, SKILL_IDS.SHIELD_ALLY, 0) != null,
    "legacy caster SHIELD_ALLY → allowed (whitelist skipped)",
  );
  // REVIVE_BOOST（ALLY 模式）需倒地盟友目标。
  assert.ok(
    resolveSkillApplication(legacy, downedAlly, SKILL_IDS.REVIVE_BOOST, 0) != null,
    "legacy caster REVIVE_BOOST → allowed (whitelist skipped)",
  );
  // TAUNT（SELF 模式）无需目标。
  assert.ok(
    resolveSkillApplication(legacy, null, SKILL_IDS.TAUNT, 0) != null,
    "legacy caster TAUNT → allowed (whitelist skipped)",
  );
});
