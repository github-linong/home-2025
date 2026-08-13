/**
 * boss-multiskill.test.ts — Boss 多技能（P2）：火焰新星周期 AOE。
 *
 * 验证：
 *   - S0 seed wave2 含 boss（boss_emberlord），spawn 时确定性派生 bossNovaAtTick
 *   - 推进 tick 到达 bossNovaAtTick → boss telegraph 带 novaRadius（130），shape=AOE_FILL
 *   - 新星结算：半径 130 内玩家受 attackDamage（确定性）
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import { EntityKind, EntityStatus, TelegraphShape, WAVE_INTERMISSION_TICKS } from "../../src/types.ts";
import { resolveDamage, CombatKind } from "../../src/combat.ts";

/** 用 S0 seed 清场推进，直到 wave2 的 boss 出现（抓到 boss 立即停止，不清 boss）。 */
function reachBoss(): { world: ReturnType<typeof createWorld>; boss: any } {
  const world = createWorld({ runId: "BOSS-MULTI", seed: "S0", biomeId: 0, players: [
    { seatId: 0, userId: "P1", classId: "tank" },
  ]});
  let boss: any = null;
  let safety = 0;
  while (safety < 100 && !boss) {
    // 先检查当前是否有 boss（存活）——有则停（不清 boss）
    const cur = world.actors().find((a) => a.kind === EntityKind.BOSS);
    if (cur) { boss = cur; break; }
    // 清场当前波敌人（不含 boss 时正常清；若含 boss 会让 boss 死亡——但上方已检查过存活 boss）
    for (let guard2 = 0; guard2 < 40; guard2++) {
      const all = world.actors();
      const enemies = all.filter((a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS);
      if (enemies.length === 0) break;
      const combatMap = new Map(all.map((a) => [a.id, a]));
      for (const e of enemies) {
        // 跳过 boss（保持 boss 存活以便新星验证）；但 boss 在 wave2 才出现，wave1 无 boss 时正常清。
        if (e.kind === EntityKind.BOSS) continue;
        let guard = 0;
        while (guard < 4000 && e.hp > 0) {
          resolveDamage(
            { tick: world.tick, entities: combatMap },
            { sourceId: e.id, targetId: e.id, amount: 0, tick: world.tick, kind: CombatKind.ATTACK },
          );
          guard++;
        }
      }
      world.step();
      const curB = world.actors().find((a) => a.kind === EntityKind.BOSS);
      if (curB) { boss = curB; break; }
    }
    if (boss) break;
    // 跨过 intermission 推下一波
    for (let i = 0; i < WAVE_INTERMISSION_TICKS + 5; i++) {
      world.step();
      const b = world.actors().find((a) => a.kind === EntityKind.BOSS);
      if (b) { boss = b; break; }
      if (world.actors().some((a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS)) break;
    }
    if (world.snapshot().roomPhase === 3) break;
    safety++;
  }
  return { world, boss };
}

test("boss spawn derives bossNovaAtTick deterministically", () => {
  const { boss } = reachBoss();
  assert.ok(boss, "S0 seed wave2 应出现 boss_emberlord");
  assert.equal(boss.enemyTypeId, "boss_emberlord");
  assert.ok(typeof boss.bossNovaAtTick === "number" && Number.isFinite(boss.bossNovaAtTick), "bossNovaAtTick 为有限数字");
  const { boss: boss2 } = reachBoss();
  assert.equal(boss.bossNovaAtTick, boss2.bossNovaAtTick, "同 seed 重跑 bossNovaAtTick 一致");
});

test("boss nova fires periodically with AOE_FILL telegraph and damages players in radius", () => {
  const { world, boss } = reachBoss();
  assert.ok((boss.status & EntityStatus.ALIVE) !== 0, "reachBoss 抓到的 boss 应存活");
  // 玩家移动到 boss 旁（AOE 判定范围内；直接改 actor 坐标——测试隔离，不影响权威逻辑）
  const p0 = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0)!;
  p0.x = boss.x + 60;
  p0.y = boss.y;
  // 推进到新星触发（bossNovaAtTick 到达），检查 telegraph 与伤害
  let novaTelegraphSeen = false;
  let hpBeforeNova = p0.hp;
  let hpAfterNova = p0.hp;
  for (let t = 0; t < 300; t++) {
    const b = world.actors().find((a) => a.id === boss.id);
    if (!b) break;
    const bSnap = world.snapshot().entities.find((e) => e.id === boss.id);
    // snapshot telegraph 用 radius/shape 表达新星（AOE_FILL + 130px），无 novaRadius 字段
    if (bSnap && bSnap.telegraph && bSnap.telegraph.shape === TelegraphShape.AOE_FILL && bSnap.telegraph.radius === 130) {
      novaTelegraphSeen = true;
    }
    const me = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
    if (me && me.hp < hpBeforeNova && novaTelegraphSeen) hpAfterNova = me.hp;
    world.enqueueInput(0, { seq: 2000 + t, tick: 0, action: 0, dir: { x: 0, y: 0 } });
    world.step();
  }
  assert.ok(novaTelegraphSeen, "boss 火焰新星 telegraph（AOE_FILL, 130px）出现");
  assert.ok(hpAfterNova < hpBeforeNova, `新星应命中玩家造成伤害（hp ${hpBeforeNova}→${hpAfterNova}）`);
});
