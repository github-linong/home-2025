/**
 * wave-progression.test.ts — 波次/房间推进确定性单测（progression；E?）
 *
 * 验证：createWorld 初始只生 wave 1；清场后进入 intermission；intermission 结束推入 wave 2；
 *   若仅 1 波则置 SETTLE（通关）。全部确定性（无 Date/Math.random；随机仅经现有 Rng(seed)）。
 *
 * 覆盖：
 *   - 初始 snapshot.wave === 1（不再一次性生全部 wave）
 *   - 清光当前所有敌人（含 boss phase-3 adds）后，跨过 WAVE_INTERMISSION_TICKS 推入下一波
 *   - 单波布局 → 清场后 roomPhase === SETTLE
 *   - 推进后 intermissionTicks === 0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import {
  EntityKind,
  RoomPhase,
  WAVE_INTERMISSION_TICKS,
} from "../../src/types.ts";
import { resolveDamage, CombatKind } from "../../src/combat.ts";

test("wave progression: clearing wave 1 advances to wave 2 (or SETTLE if single-wave)", () => {
  const world = createWorld({
    runId: "EMBER-WAVE-UNIT",
    seed: "EMBER-S1",
    biomeId: 0,
    players: [
      { seatId: 0, userId: "P1", classId: "tank" },
      { seatId: 1, userId: "P2", classId: "ranger" },
    ],
  });

  const s0 = world.snapshot();
  assert.equal(s0.wave, 1, "initial wave must be 1");
  assert.ok(s0.totalWaves >= 1, "totalWaves must be >= 1");

  // 反复清场直到无敌人（intermission 中/通关）；处理可能的 boss phase-3 adds。
  // 每次迭代重建 combatMap（含本 wave 新生成实体），确定性经 resolveDamage 玩家裁决路径击杀（伤害值由服务端常量裁决）。
  let safety = 0;
  while (safety < 64) {
    const all = world.actors();
    const enemies = all.filter(
      (a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS,
    );
    if (enemies.length === 0) break; // 已无敌人（intermission 中或通关）
    const combatMap = new Map(all.map((a) => [a.id, a]));
    for (const e of enemies) {
      let guard = 0;
      while (e.hp > 0 && guard < 4000) {
        resolveDamage(
          { tick: world.tick, entities: combatMap },
          {
            sourceId: e.id,
            targetId: e.id,
            amount: 0,
            tick: world.tick,
            kind: CombatKind.ATTACK,
          },
        );
        guard++;
      }
    }
    world.step(); // 移除倒地敌人 → 触发 intermission（多波）/ SETTLE（单波）
    safety++;
  }

  // 跨过 intermission（清场后 world.tick + WAVE_INTERMISSION_TICKS 触发下一波）。
  for (let i = 0; i < WAVE_INTERMISSION_TICKS + 5; i++) world.step();

  const s1 = world.snapshot();
  if (s1.totalWaves > 1) {
    assert.ok(s1.wave >= 2, "wave should have advanced past 1 after intermission");
    assert.equal(s1.intermissionTicks, 0, "intermission cleared after advancing");
  } else {
    assert.equal(
      s1.roomPhase,
      RoomPhase.SETTLE,
      "single-wave clear → SETTLE (victory)",
    );
  }
});
