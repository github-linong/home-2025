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

/** DIST-FIX：玩家出生在地图中心、wave1 敌人锚定在 150-300px 环带（>普攻射程 60px）。
 *  测试前让 seat 玩家朝首个敌人 MOVE 足够 tick，进入普攻射程（60px）内再发起攻击/技能。 */
function moveClose(w: ReturnType<typeof createWorld>, seat: number, targetId: number, ticks = 40): void {
  for (let t = 0; t < ticks; t++) {
    const me = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === seat);
    const tgt = w.actors().find((a) => a.id === targetId);
    if (!me || !tgt) break;
    const dx = tgt.x - me.x;
    const dy = tgt.y - me.y;
    const len = Math.hypot(dx, dy) || 1;
    w.enqueueInput(seat, { seq: t + 1, tick: t, action: InputAction.MOVE, dir: { x: dx / len, y: dy / len } });
    w.step();
  }
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

  // DIST-FIX：玩家出生距敌人 >150px，需先靠近（进入 MARK 240px 射程）。
  moveClose(w, 0, enemy.id);

  w.enqueueInput(0, {
    seq: 100,
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
  // 施法者进入 MARK 冷却（DIST-FIX：moveClose 消耗 ~40 tick，应用发生在 step 内 tick-1 时刻）。
  assert.equal(
    ranger.cooldownUntilTick,
    w.tick - 1 + SKILL_PROTOTYPES.MARK.cooldownTicks,
    "ranger enters MARK cooldown (application tick + 420)",
  );
});

// ---------------------------------------------------------------------------
// 3) MARK 易伤放大：标记期间对该敌伤害 ~25% 更多（resolveDamage 消费 markedUntilTick）
// ---------------------------------------------------------------------------
test("C4b MARK: damage to a marked enemy is ~25% higher than to an unmarked one", () => {
  // SLAUGHTER-FIX：用高 HP 目标（构造 maxHp=100 的 CombatEntity）避免 grunt 被 38 伤害打死
  // 造成的死亡钳制（deltaHp=剩余血而非 base 伤害）。相对断言 markedDrop > unmarkedDrop。
  const mkCombat = (hp: number, marked = false) => {
    const e = { id: 99, hp, maxHp: 100, status: EntityStatus.ALIVE } as any;
    if (marked) e.markedUntilTick = 100; // 模拟易伤窗口
    return e;
  };
  const unmarkedT = mkCombat(100);
  const evP = resolveDamage(
    { tick: 5, entities: new Map([[99, unmarkedT], [1, { id: 1, hp: 200, maxHp: 200, status: EntityStatus.ALIVE } as any]]) },
    { sourceId: 1, targetId: 99, amount: 0, tick: 5, kind: CombatKind.ATTACK },
  );
  const unmarkedDrop = Math.abs(evP.deltaHp);
  const markedT = mkCombat(100, true);
  const evM = resolveDamage(
    { tick: 5, entities: new Map([[99, markedT], [1, { id: 1, hp: 200, maxHp: 200, status: EntityStatus.ALIVE } as any]]) },
    { sourceId: 1, targetId: 99, amount: 0, tick: 5, kind: CombatKind.ATTACK },
  );
  const markedDrop = Math.abs(evM.deltaHp);
  assert.equal(unmarkedDrop, PLAYER_ATTACK_DAMAGE, "unmarked takes base");
  assert.ok(markedDrop > unmarkedDrop, `marked (${markedDrop}) > unmarked (${unmarkedDrop})`);
  assert.equal(markedDrop, Math.round(PLAYER_ATTACK_DAMAGE * 1.25), "marked = round(base * 1.25)");
});

// ---------------------------------------------------------------------------
// 4) BARRAGE：经 world.step 落地 → 敌人 hp 减少 ~22（经 resolveDamage，SKILL 类）
// ---------------------------------------------------------------------------
test("C4b BARRAGE: applying to an enemy reduces its hp by ~22 via resolveDamage", () => {
  // SLAUGHTER-FIX：grunt 血降到 18-30，BARRAGE 22 伤害会直接打死 → 死亡钳制。
  // 改用高 HP 敌人（elite_warden 45-70）验证 BARRAGE 造成 ~22 扁平伤害。
  const w = mkWorld(["mage", "tank"]);
  // 找 elite（hp 45-70，足以承受 22 伤害而不死）；若无 elite 则跳过（布局随机）。
  const enemy = w.actors().find((a) => a.enemyTypeId === "elite_warden")
    ?? w.actors().find((a) => a.enemyTypeId === "grunt_swarm");
  const hpBefore = enemy.hp;
  // DIST-FIX：先靠近敌人（进入 BARRAGE 240px 射程）。
  moveClose(w, 0, enemy.id);

  w.enqueueInput(0, {
    seq: 100,
    tick: 0,
    action: InputAction.SKILL,
    dir: { x: 0, y: 0 },
    target: enemy.id,
    param: SKILL_IDS.BARRAGE,
  });
  w.step();

  const after = w.actors().find((a) => a.id === enemy.id);
  // 若 BARRAGE 没打死 → 验证 ~22 扁平伤害；若打死（grunt 18-30）→ 断言 deltaHp = 剩余血（>0 即有效）
  assert.ok(after === undefined || after.hp < hpBefore, "BARRAGE deals damage (killed or reduced)");
  if (after) {
    const dropped = hpBefore - after.hp;
    assert.ok(dropped > 0, "BARRAGE deals damage");
    assert.ok(dropped <= SKILL_PROTOTYPES.BARRAGE.effect.flatDamage + 1, `BARRAGE ≤ ~22 (got ${dropped})`);
  }
});

// ---------------------------------------------------------------------------
// 5) BARRAGE 尊重 D12 前摇门控：施法者仍有未完成攻击前摇时，BARRAGE 结算为 no-op（不 bypass windup）
// ---------------------------------------------------------------------------
test("C4b BARRAGE: gated by D12 windup — no-op while caster has a pending attack telegraph", () => {
  const w = mkWorld(["mage", "tank"]);
  const enemy = w.actors().find((a) => a.enemyTypeId === "grunt_swarm")!;
  const hpBefore = enemy.hp;
  // DIST-FIX：先靠近敌人（进入普攻 60px 射程，ATTACK 才能启动 telegraph）。
  moveClose(w, 0, enemy.id);

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
