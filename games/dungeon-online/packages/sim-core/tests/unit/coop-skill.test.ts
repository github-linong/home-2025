/**
 * coop-skill.test.ts — E8 协作技（系统⑨，闭合 O-A 设计缺口）
 *
 * 覆盖（S8.1–S8.3 / 纪律 B）：
 *  - SHIELD_ALLY：给目标盟友施加减伤护盾（combat.resolveDamage 消费），不直改 hp/status。
 *  - REVIVE_BOOST：给倒地盟友救援读条加成（加速归队），非 hp/status。
 *  - TAUNT：施法者吸引敌火（敌人 AI 优先锁定），保护其他队友。
 *  - 冷却强制（冷却未结束不可再次施放）。
 *  - 协作技只能指向「其他玩家盟友」（self / enemy → no-op，不进入冷却）。
 *  - 纪律 B 静态契约：skills.ts 绝不直改 hp/status；施技不直改目标 hp/status。
 *
 * 运行：node --experimental-strip-types --test tests/unit/coop-skill.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createWorld } from "../../src/world.ts";
import {
  InputAction,
  EntityKind,
  EntityStatus,
  SKILL_IDS,
  SKILL_PROTOTYPES,
  type PlayerClass,
} from "../../src/types.ts";
import { resolveSkillApplication, type SkillActorView } from "../../src/skills.ts";
import { resolveDamage, CombatKind, PLAYER_ATTACK_DAMAGE } from "../../src/combat.ts";

// 协作技平衡初稿（与 SKILL_PROTOTYPES 对齐；测试断言这些值，改动需同步）。
const SHIELD_COOLDOWN = SKILL_PROTOTYPES.SHIELD_ALLY.cooldownTicks; // 360
const SHIELD_TICKS = SKILL_PROTOTYPES.SHIELD_ALLY.effect.shieldTicks; // 90
const SHIELD_REDUCTION = SKILL_PROTOTYPES.SHIELD_ALLY.effect.shieldReduction; // 0.5
const REVIVE_COOLDOWN = SKILL_PROTOTYPES.REVIVE_BOOST.cooldownTicks; // 300
const REVIVE_BOOST = SKILL_PROTOTYPES.REVIVE_BOOST.effect.rescueBoostTicks; // 45
const TAUNT_COOLDOWN = SKILL_PROTOTYPES.TAUNT.cooldownTicks; // 420
const TAUNT_TICKS = SKILL_PROTOTYPES.TAUNT.effect.tauntTicks; // 120

/** 构造 n 名玩家（tank/ranger/mage，最多 3）的世界；返回世界与按座位取 actor 的辅助。 */
function mkWorld(n = 3) {
  const classes: PlayerClass[] = ["tank", "ranger", "mage"];
  const players = [];
  for (let i = 0; i < n; i++) {
    players.push({ seatId: i, userId: "P" + (i + 1), classId: classes[i] });
  }
  const w = createWorld({ runId: "E8-COOP", seed: "EMBER-S1", biomeId: 0, players });
  const actors = w.actors();
  const bySeat = (s: number) => actors.find((a) => a.ownerId === s)!;
  const enemy = actors.find((a) => a.enemyTypeId === "grunt_swarm")!;
  return { w, actors, bySeat, enemy };
}

// ---------------------------------------------------------------------------
// 1) SHIELD_ALLY：给盟友施加减伤护盾 + 设置冷却 + 不直改 hp/status
// ---------------------------------------------------------------------------
test("SHIELD_ALLY: applies mitigation shield to target ally + sets cooldown (no direct hp/status change)", () => {
  const { w, bySeat } = mkWorld(3);
  const p0 = bySeat(0);
  const p1 = bySeat(1);
  const p1hpBefore = p1.hp;
  const p1statusBefore = p1.status;

  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: p1.id,
    param: SKILL_IDS.SHIELD_ALLY,
  });
  w.step();

  // 护盾窗口落地（由 world.step 设置，combat 消费）。
  assert.ok((p1.shieldUntilTick ?? 0) > 0, "target ally gains a shield window");
  assert.equal(p1.shieldUntilTick, SHIELD_TICKS, "shield window = SKILL_PROTOTYPES.shieldTicks");
  assert.equal(p1.shieldReduction, SHIELD_REDUCTION, "shield reduction matches prototype");
  // 冷却落地在施法者。
  assert.equal(p0.cooldownUntilTick, SHIELD_COOLDOWN, "caster enters skill cooldown");
  assert.equal(p0.activeSkill, SKILL_IDS.SHIELD_ALLY, "activeSkill recorded");
  // 纪律 B：施技不得直改目标 hp/status。
  assert.equal(p1.hp, p1hpBefore, "target hp unchanged by skill (no direct mutation)");
  assert.equal(p1.status, p1statusBefore, "target status unchanged by skill (no direct mutation)");
});

// ---------------------------------------------------------------------------
// 2) SHIELD_ALLY 减伤经 combat.resolveDamage 消费（端到端验证护盾生效）
// ---------------------------------------------------------------------------
test("SHIELD_ALLY: mitigation actually reduces incoming damage via combat.resolveDamage", () => {
  const { w, bySeat, actors } = mkWorld(3);
  const p0 = bySeat(0);
  const p1 = bySeat(1);

  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: p1.id,
    param: SKILL_IDS.SHIELD_ALLY,
  });
  w.step();

  const combatMap = new Map(actors.map((a) => [a.id, a]));
  const hpBefore = p1.hp;
  const ev = resolveDamage(
    { tick: w.tick, entities: combatMap },
    { sourceId: p0.id, targetId: p1.id, amount: 0, tick: w.tick, kind: CombatKind.ATTACK },
  );
  const dropped = hpBefore - p1.hp;
  // PLAYER_ATTACK_DAMAGE(18) * (1 - 0.5) = 9。
  assert.equal(dropped, Math.round(PLAYER_ATTACK_DAMAGE * (1 - SHIELD_REDUCTION)), "shield 50% reduction applied");
  assert.equal(ev.deltaHp, -dropped, "deltaHp reflects mitigated damage");
});

// ---------------------------------------------------------------------------
// 3) REVIVE_BOOST：加速倒地盟友救援读条；施于非倒地盟友 → no-op
// ---------------------------------------------------------------------------
test("REVIVE_BOOST: accelerates a DOWNED ally's rescue readbar; no-op on healthy ally", () => {
  const { w, bySeat } = mkWorld(3);
  const p0 = bySeat(0);
  const p1 = bySeat(1); // 将被击倒
  const p2 = bySeat(2); // 健康盟友，用作 no-op 控制

  // 击倒 p1（保留 ALIVE 位，符合 world 约定）。
  p1.hp = 0;
  p1.status = EntityStatus.ALIVE | EntityStatus.DOWNED;
  p1.downedTicks = 0;
  p1.rescueTicks = 0;

  const before = p1.rescueTicks;
  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: p1.id,
    param: SKILL_IDS.REVIVE_BOOST,
  });
  w.step();
  // 急救链直接 +rescueBoostTicks（玩家间距 > RESCUE_RADIUS，rescue 循环不再累加）。
  assert.equal(p1.rescueTicks, before + REVIVE_BOOST, "DOWNED ally rescue readbar boosted");
  assert.equal(p0.cooldownUntilTick, REVIVE_COOLDOWN, "caster enters REVIVE_BOOST cooldown");

  // no-op 控制：p2 用 REVIVE_BOOST 施于健康盟友 p0 → 应被拒（不进入冷却、不加成）。
  const r0before = p0.rescueTicks;
  w.enqueueInput(2, {
    seq: 1,
    tick: 1,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: p0.id,
    param: SKILL_IDS.REVIVE_BOOST,
  });
  w.step();
  assert.equal(p0.rescueTicks, r0before, "healthy ally gets no rescue boost");
  assert.equal(p2.cooldownUntilTick ?? 0, 0, "invalid REVIVE_BOOST target → no cooldown consumed");
});

// ---------------------------------------------------------------------------
// 4) TAUNT：施法者吸引敌火（敌人 AI 优先锁定施法者）
// ---------------------------------------------------------------------------
test("TAUNT: caster draws enemy aggro (enemy retargets to taunter, not nearest ally)", () => {
  // 无嘲讽对照组：敌人应锁定「最近」盟友 p1。
  {
    const { w, bySeat, enemy, actors } = mkWorld(2);
    const p0 = bySeat(0);
    const p1 = bySeat(1);
    // 布局：p0 远、p1 近（敌人默认会打 p1）。
    p0.x = 1024; p0.y = 640;
    p1.x = 1054; p1.y = 640;
    enemy.x = 1074; enemy.y = 640;
    let targetId: number | null = null;
    for (let i = 0; i < 15 && targetId === null; i++) {
      w.step();
      const e = actors.find((a) => a.id === enemy.id)!;
      if (e.telegraph) targetId = e.telegraph.targetId;
    }
    assert.equal(targetId, p1.id, "no taunt → enemy targets nearest ally (p1)");
  }

  // 嘲讽组：p0 嘲讽后，敌人应改锁 p0（吸引敌火保护 p1）。
  {
    const { w, bySeat, enemy, actors } = mkWorld(2);
    const p0 = bySeat(0);
    const p1 = bySeat(1);
    p0.x = 1024; p0.y = 640;
    p1.x = 1054; p1.y = 640;
    enemy.x = 1074; enemy.y = 640;

    w.enqueueInput(0, {
      seq: 1,
      tick: 0,
      action: InputAction.SKILL,
      dir: { x: 0, y: 0 },
      param: SKILL_IDS.TAUNT, // SELF 模式，无需 target
    });
    w.step();
    assert.ok((p0.tauntUntilTick ?? 0) > 0, "caster gains taunt window");
    assert.equal(p0.cooldownUntilTick, TAUNT_COOLDOWN, "caster enters TAUNT cooldown");

    let targetId: number | null = null;
    for (let i = 0; i < 15 && targetId === null; i++) {
      w.step();
      const e = actors.find((a) => a.id === enemy.id)!;
      if (e.telegraph) targetId = e.telegraph.targetId;
    }
    assert.equal(targetId, p0.id, "taunt → enemy retargets to taunter (p0), protecting p1");
  }
});

// ---------------------------------------------------------------------------
// 5) 冷却强制：冷却未结束不可再次施放（不刷新、不二次落地）
// ---------------------------------------------------------------------------
test("cooldown enforced: cannot recast a co-op skill before cooldown elapses", () => {
  const { w, bySeat } = mkWorld(3);
  const p0 = bySeat(0);
  const p1 = bySeat(1);

  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: p1.id,
    param: SKILL_IDS.SHIELD_ALLY,
  });
  w.step();
  const cdAfterFirst = p0.cooldownUntilTick;
  assert.equal(cdAfterFirst, SHIELD_COOLDOWN);

  const shieldBefore = p1.shieldUntilTick;
  // 冷却内（tick1 << 360）再次尝试施放。
  w.enqueueInput(0, {
    seq: 2,
    tick: 1,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: p1.id,
    param: SKILL_IDS.SHIELD_ALLY,
  });
  w.step();
  assert.equal(p0.cooldownUntilTick, cdAfterFirst, "cooldown not refreshed by blocked recast");
  assert.equal(p1.shieldUntilTick, shieldBefore, "shield not re-applied while on cooldown");
});

// ---------------------------------------------------------------------------
// 6) 协作技只能指向「其他玩家盟友」（self / enemy → no-op，不进入冷却）
// ---------------------------------------------------------------------------
test("co-op targeting only: SHIELD_ALLY rejects self/enemy target (no-op, no cooldown)", () => {
  const { w, bySeat, actors } = mkWorld(3);
  const p0 = bySeat(0);

  // self 目标 → no-op。
  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: p0.id,
    param: SKILL_IDS.SHIELD_ALLY,
  });
  w.step();
  assert.equal(p0.shieldUntilTick ?? 0, 0, "cannot shield self");
  assert.equal(p0.cooldownUntilTick ?? 0, 0, "self-target → no cooldown consumed");

  // enemy 目标 → no-op（协作技不可指向敌人）。
  const enemy = actors.find((a) => a.kind === EntityKind.ENEMY)!;
  w.enqueueInput(0, {
    seq: 2,
    tick: 1,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: enemy.id,
    param: SKILL_IDS.SHIELD_ALLY,
  });
  w.step();
  const enemyAfter = actors.find((a) => a.id === enemy.id)!;
  assert.equal(enemyAfter.shieldUntilTick ?? 0, 0, "cannot shield an enemy");
  assert.equal(p0.cooldownUntilTick ?? 0, 0, "enemy-target → no cooldown consumed");
});

// ---------------------------------------------------------------------------
// 7) 纪律 B 静态契约：skills.ts 绝不直改 hp/status（仅产意图结构体）
// ---------------------------------------------------------------------------
test("discipline B: skills.ts contains no direct hp/status mutation (pure intent module)", () => {
  const path = fileURLToPath(new URL("../../src/skills.ts", import.meta.url));
  const src = readFileSync(path, "utf8");

  const directHp =
    /\.\s*hp\s*=[^=]/.test(src) ||
    /\.\s*hp\s*\+=/.test(src) ||
    /\.\s*hp\s*-=/.test(src);
  const directStatus =
    /\.\s*status\s*=[^=]/.test(src) ||
    /\.\s*status\s*\|=/.test(src) ||
    /\.\s*status\s*&=/.test(src);
  assert.equal(directHp, false, "skills.ts must not mutate hp");
  assert.equal(directStatus, false, "skills.ts must not mutate status");
  // 验证它是纯函数：不 import combat / dungeon-gen 运行时（仅 import type 或 types 数据基座）。
  const runtimeCombat = /import\s+(?!type\b)[^;]*from\s+["']\.\/combat(\.js|\.ts)?["']/.test(src);
  const runtimeDungeonGen = /import\s+(?!type\b)[^;]*from\s+["']\.\/dungeon-gen(\.js|\.ts)?["']/.test(src);
  assert.equal(runtimeCombat, false, "skills.ts must not runtime-import combat");
  assert.equal(runtimeDungeonGen, false, "skills.ts must not runtime-import dungeon-gen");
});

// ---------------------------------------------------------------------------
// 8) 纯函数 resolveSkillApplication：合法性校验（独立单元验证）
// ---------------------------------------------------------------------------
test("resolveSkillApplication: validates target mode / DOWNED requirement (pure)", () => {
  const caster: SkillActorView = { id: 1, kind: EntityKind.PLAYER, ownerId: 0, status: EntityStatus.ALIVE };
  const ally: SkillActorView = { id: 2, kind: EntityKind.PLAYER, ownerId: 1, status: EntityStatus.ALIVE };
  const downedAlly: SkillActorView = {
    id: 3,
    kind: EntityKind.PLAYER,
    ownerId: 2,
    status: EntityStatus.ALIVE | EntityStatus.DOWNED,
  };
  const enemy: SkillActorView = { id: 99, kind: EntityKind.ENEMY, status: EntityStatus.ALIVE };

  // SHIELD_ALLY 指向盟友 → 有效（护盾意图）。
  const shield = resolveSkillApplication(caster, ally, SKILL_IDS.SHIELD_ALLY, 0);
  assert.ok(shield && shield.shieldTicks > 0 && shield.targetId === ally.id, "SHIELD_ALLY on ally → valid");

  // SHIELD_ALLY 指向自己 → 无效（协作技非 solo）。
  assert.equal(resolveSkillApplication(caster, caster, SKILL_IDS.SHIELD_ALLY, 0), null, "self-target rejected");

  // SHIELD_ALLY 指向敌人 → 无效。
  assert.equal(resolveSkillApplication(caster, enemy, SKILL_IDS.SHIELD_ALLY, 0), null, "enemy-target rejected");

  // REVIVE_BOOST 指向健康盟友 → 无效（只救倒地）。
  assert.equal(resolveSkillApplication(caster, ally, SKILL_IDS.REVIVE_BOOST, 0), null, "REVIVE on healthy ally rejected");

  // REVIVE_BOOST 指向倒地盟友 → 有效（救援加成意图）。
  const revive = resolveSkillApplication(caster, downedAlly, SKILL_IDS.REVIVE_BOOST, 0);
  assert.ok(revive && revive.rescueBoostTicks > 0 && revive.targetId === downedAlly.id, "REVIVE_BOOST on DOWNED ally → valid");

  // TAUNT（SELF）→ 有效，targetId = caster 自身。
  const taunt = resolveSkillApplication(caster, null, SKILL_IDS.TAUNT, 0);
  assert.ok(taunt && taunt.tauntTicks > 0 && taunt.targetId === caster.id, "TAUNT is SELF-targeted → valid");

  // 未知技能 id → 无效。
  assert.equal(resolveSkillApplication(caster, ally, 999, 0), null, "unknown skill id rejected");

  // 托管中施法者 → 无效。
  const dc: SkillActorView = { ...caster, disconnected: true };
  assert.equal(resolveSkillApplication(dc, ally, SKILL_IDS.SHIELD_ALLY, 0), null, "disconnected caster rejected");
});
