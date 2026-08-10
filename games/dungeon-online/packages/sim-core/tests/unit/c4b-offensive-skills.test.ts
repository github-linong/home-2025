/**
 * c4b-offensive-skills.test.ts — C4b 游侠/术士专属进攻技（第 3 技能：MARK / BARRAGE）
 *
 * 覆盖（C4b / E8 / 纪律 B）：
 *  - 白名单：ranger 仅可 MARK、mage 仅可 BARRAGE；二者对 tank/healer 自动拒绝（CLASS_SKILLS 驱动）。
 *  - MARK：对敌人施加易伤窗口（enemy.markedUntilTick 设置），标记期间对其伤害 ×1.25（combat 消费）。
 *  - BARRAGE：对敌人造成 22 点扁平伤害（经 resolveDamage 落地，SKILL 类，受 D12 前摇门控）。
 *  - 金色安全：无标记实体的快照序列化后「不含」markedUntilTick 子串（确定性哈希不受影响）。
 *
 * 运行：node --experimental-strip-types --test tests/unit/c4b-offensive-skills.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
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

/** 构造多职业世界（默认生成敌人，便于进攻技指向敌人目标）。 */
function mkWorld(classes: PlayerClass[]) {
  const players = classes.map((c, i) => ({ seatId: i, userId: "P" + (i + 1), classId: c }));
  const w = createWorld({ runId: "C4B-OFFENSIVE", seed: "EMBER-S1", biomeId: 0, players });
  return w;
}

/** 只读视图构造（与 skills.ts SkillActorView 对齐）。 */
const caster = (classId: PlayerClass, id = 1): SkillActorView => ({
  id,
  kind: EntityKind.PLAYER,
  status: EntityStatus.ALIVE,
  classId,
});
const enemyView: SkillActorView = { id: 99, kind: EntityKind.ENEMY, status: EntityStatus.ALIVE };
const bossView: SkillActorView = { id: 98, kind: EntityKind.BOSS, status: EntityStatus.ALIVE };
const allyView: SkillActorView = { id: 5, kind: EntityKind.PLAYER, status: EntityStatus.ALIVE };

// ---------------------------------------------------------------------------
// 1) 白名单：ranger↔MARK、mage↔BARRAGE 配对；tank/healer 二者皆拒；进攻技仅可指向敌人
// ---------------------------------------------------------------------------
test("C4b whitelist: ranger can MARK, mage can BARRAGE; tank/healer rejected; enemy-only targeting", () => {
  const ranger = caster("ranger", 1);
  const mage = caster("mage", 2);
  const tank = caster("tank", 3);

  // ranger ↔ MARK：允许；ranger ↔ BARRAGE：拒绝。
  assert.ok(
    resolveSkillApplication(ranger, enemyView, SKILL_IDS.MARK, 0) != null,
    "ranger MARK → allowed",
  );
  assert.equal(
    resolveSkillApplication(ranger, enemyView, SKILL_IDS.BARRAGE, 0),
    null,
    "ranger BARRAGE → rejected (not in whitelist)",
  );

  // mage ↔ BARRAGE：允许；mage ↔ MARK：拒绝。
  assert.ok(
    resolveSkillApplication(mage, enemyView, SKILL_IDS.BARRAGE, 0) != null,
    "mage BARRAGE → allowed",
  );
  assert.equal(
    resolveSkillApplication(mage, enemyView, SKILL_IDS.MARK, 0),
    null,
    "mage MARK → rejected (not in whitelist)",
  );

  // tank：MARK / BARRAGE 二者皆拒（维持 2 技，无进攻技）。
  assert.equal(resolveSkillApplication(tank, enemyView, SKILL_IDS.MARK, 0), null, "tank MARK → rejected");
  assert.equal(resolveSkillApplication(tank, enemyView, SKILL_IDS.BARRAGE, 0), null, "tank BARRAGE → rejected");

  // 进攻技仅可指向敌人（ENEMY/BOSS），指向玩家盟友 → 拒绝（即使白名单允许）。
  assert.equal(
    resolveSkillApplication(ranger, allyView, SKILL_IDS.MARK, 0),
    null,
    "MARK on ally → rejected (enemy-only)",
  );
  assert.equal(
    resolveSkillApplication(mage, allyView, SKILL_IDS.BARRAGE, 0),
    null,
    "BARRAGE on ally → rejected (enemy-only)",
  );
  // BOSS 亦可作为进攻技目标。
  assert.ok(
    resolveSkillApplication(mage, bossView, SKILL_IDS.BARRAGE, 0) != null,
    "mage BARRAGE on BOSS → allowed (enemy-only targeting includes BOSS)",
  );
});

// ---------------------------------------------------------------------------
// 2) MARK：经 world.step 落地 → 目标敌人获得 markedUntilTick 易伤窗口
// ---------------------------------------------------------------------------
test("C4b MARK: applying to an enemy sets enemy.markedUntilTick (vulnerability window)", () => {
  const w = mkWorld(["ranger", "tank"]);
  const ranger = w.actors().find((a) => a.ownerId === 0)!;
  const enemy = w.actors().find((a) => a.enemyTypeId === "grunt_swarm")!;

  assert.equal(enemy.markedUntilTick ?? 0, 0, "enemy starts unmarked");

  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: enemy.id,
    param: SKILL_IDS.MARK,
  });
  w.step();

  const marked = w.actors().find((a) => a.id === enemy.id)!;
  assert.ok(marked.markedUntilTick != null, "enemy.markedUntilTick set after MARK");
  assert.ok(marked.markedUntilTick! > w.tick, "markedUntilTick is a future tick (active window)");
  assert.equal(
    marked.markedUntilTick,
    (w.tick - 1) + SKILL_PROTOTYPES.MARK.effect.markTicks,
    "markedUntilTick = (application tick) + MARK.markTicks (180)",
  );
  // 纪律 B：MARK 纯状态 set，不改目标 hp。
  assert.equal(marked.hp, enemy.hp, "MARK does not change enemy hp");
  // 施法者进入 MARK 冷却。
  assert.equal(ranger.cooldownUntilTick, SKILL_PROTOTYPES.MARK.cooldownTicks, "ranger enters MARK cooldown");
});

// ---------------------------------------------------------------------------
// 3) MARK 易伤放大：标记期间对该敌伤害 ~25% 更多（resolveDamage 消费 markedUntilTick）
// ---------------------------------------------------------------------------
test("C4b MARK: damage to a marked enemy is ~25% higher than to an unmarked one", () => {
  // 标记组：ranger 对敌人施 MARK，随后玩家普攻命中该敌。
  const wMark = mkWorld(["ranger", "tank"]);
  const rangerM = wMark.actors().find((a) => a.ownerId === 0)!;
  const enemyM = wMark.actors().find((a) => a.enemyTypeId === "grunt_swarm")!;
  wMark.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: enemyM.id,
    param: SKILL_IDS.MARK,
  });
  wMark.step();
  const marked = wMark.actors().find((a) => a.id === enemyM.id)!;
  const combatMapM = new Map(wMark.actors().map((a) => [a.id, a]));
  const evMarked = resolveDamage(
    { tick: wMark.tick, entities: combatMapM },
    { sourceId: rangerM.id, targetId: marked.id, amount: 0, tick: wMark.tick, kind: CombatKind.ATTACK },
  );
  const markedDrop = Math.abs(evMarked.deltaHp);

  // 对照组：同 seed/布局、未施 MARK 的敌人，玩家普攻命中。
  const wPlain = mkWorld(["ranger", "tank"]);
  const rangerP = wPlain.actors().find((a) => a.ownerId === 0)!;
  const enemyP = wPlain.actors().find((a) => a.enemyTypeId === "grunt_swarm")!;
  const combatMapP = new Map(wPlain.actors().map((a) => [a.id, a]));
  const evPlain = resolveDamage(
    { tick: wPlain.tick, entities: combatMapP },
    { sourceId: rangerP.id, targetId: enemyP.id, amount: 0, tick: wPlain.tick, kind: CombatKind.ATTACK },
  );
  const plainDrop = Math.abs(evPlain.deltaHp);

  assert.equal(plainDrop, PLAYER_ATTACK_DAMAGE, "unmarked enemy takes base PLAYER_ATTACK_DAMAGE");
  // 18 * 1.25 = 22.5 → Math.round → 23（> 18），即放大 ~25%。
  assert.ok(markedDrop > plainDrop, `marked damage (${markedDrop}) > unmarked (${plainDrop})`);
  assert.equal(markedDrop, Math.round(PLAYER_ATTACK_DAMAGE * 1.25), "marked damage = round(18 * 1.25) = 23");
});

// ---------------------------------------------------------------------------
// 4) BARRAGE：经 world.step 落地 → 敌人 hp 减少 ~22（经 resolveDamage，SKILL 类）
// ---------------------------------------------------------------------------
test("C4b BARRAGE: applying to an enemy reduces its hp by ~22 via resolveDamage", () => {
  const w = mkWorld(["mage", "tank"]);
  const enemy = w.actors().find((a) => a.enemyTypeId === "grunt_swarm")!;
  const hpBefore = enemy.hp;

  w.enqueueInput(0, {
    seq: 1,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: enemy.id,
    param: SKILL_IDS.BARRAGE,
  });
  w.step();

  const after = w.actors().find((a) => a.id === enemy.id)!;
  const dropped = hpBefore - after.hp;
  assert.ok(dropped > 0, "BARRAGE deals damage");
  assert.ok(dropped >= 20 && dropped <= 24, `BARRAGE deals ~22 flat damage (got ${dropped})`);
  assert.equal(dropped, SKILL_PROTOTYPES.BARRAGE.effect.flatDamage, "BARRAGE damage == prototype.flatDamage (22)");
});

// ---------------------------------------------------------------------------
// 5) BARRAGE 尊重 D12 前摇门控：施法者仍有未完成攻击前摇时，BARRAGE 结算为 no-op（不 bypass windup）
// ---------------------------------------------------------------------------
test("C4b BARRAGE: gated by D12 windup — no-op while caster has a pending attack telegraph", () => {
  const w = mkWorld(["mage", "tank"]);
  const enemy = w.actors().find((a) => a.enemyTypeId === "grunt_swarm")!;
  const hpBefore = enemy.hp;

  // tick0：mage 发起 ATTACK（前摇 18 tick，D12）→ 获得进行中 telegraph。
  w.enqueueInput(0, { seq: 1, tick: 0, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: enemy.id });
  w.step();
  // tick1：前摇未到 applyTick，mage 施放 BARRAGE（SKILL 类，应受 windup 门控 → 伤害 no-op）。
  w.enqueueInput(0, {
    seq: 2,
    tick: 1,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: enemy.id,
    param: SKILL_IDS.BARRAGE,
  });
  w.step();

  const after = w.actors().find((a) => a.id === enemy.id)!;
  assert.equal(
    after.hp,
    hpBefore,
    "BARRAGE is gated by D12 windup while caster has a pending attack telegraph (does NOT bypass)",
  );
});

// ---------------------------------------------------------------------------
// 6) 金色安全：无标记实体的快照序列化后「不含」markedUntilTick 子串（确定性哈希不受影响）
// ---------------------------------------------------------------------------
test("C4b golden-safety: snapshot with no marked enemies contains NO 'markedUntilTick' substring", () => {
  const w = mkWorld(["tank", "ranger"]);
  // 推进若干 tick（含玩家普攻），但绝不施放 MARK（进攻技也未启用白名单外调用）→ 无实体被标记。
  for (let t = 0; t < 30; t++) {
    const enemies = w.actors().filter((a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS);
    if (enemies.length > 0) {
      const tid = enemies[0].id;
      w.enqueueInput(0, { seq: t + 1, tick: t, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: tid });
      w.enqueueInput(1, { seq: t + 1, tick: t, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: tid });
    }
    w.step();
  }

  const snapshot = w.snapshot();
  assert.ok(snapshot.entities.length > 0, "world produced entities to serialize");
  const json = JSON.stringify(snapshot);
  assert.equal(
    json.includes("markedUntilTick"),
    false,
    "snapshot with no marks must NOT contain the 'markedUntilTick' key (golden determinism-safe)",
  );
});
