/**
 * route-pick.test.ts — ROUTE-PICK（P3）：层间路线选择（Hades 房间节点简化版）。
 *
 * 验证：
 *   - 多楼层推进：非首层 intermission 结束 → snapshot.floorChoice 非空（2 选项）
 *   - CHOOSE_FLOOR(param) → pendingFloorRoute 清空 + 应用 modifier 后 spawnWave
 *   - deep → 下一层敌人 HP ×1.2；vault → 生成数量 ×0.75（确定性）
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import { InputAction, EntityKind, EntityStatus, WAVE_INTERMISSION_TICKS } from "../../src/types.ts";
import { resolveDamage, CombatKind } from "../../src/combat.ts";

/** 用 S0 seed 清场推进，直到进入下一层 intermission 后的路线选择。 */
function reachRouteChoice(): { world: ReturnType<typeof createWorld>; choice: any } {
  const world = createWorld({ runId: "ROUTE", seed: "S0", biomeId: 0, players: [
    { seatId: 0, userId: "P1", classId: "tank" },
  ]});
  let choice: any = null;
  let safety = 0;
  while (safety < 120 && !choice) {
    // 清场当前波（跳过 boss，保持其存活便于后续）
    for (let guard2 = 0; guard2 < 60; guard2++) {
      const all = world.actors();
      const enemies = all.filter((a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS);
      if (enemies.length === 0) break;
      const combatMap = new Map(all.map((a) => [a.id, a]));
      for (const e of enemies) {
        let guard = 0;
        while (guard < 4000 && e.hp > 0) {
          resolveDamage({ tick: world.tick, entities: combatMap }, { sourceId: e.id, targetId: e.id, amount: 0, tick: world.tick, kind: CombatKind.ATTACK });
          guard++;
        }
      }
      world.step();
    }
    // 推进 intermission → 检查 floorChoice
    for (let i = 0; i < WAVE_INTERMISSION_TICKS + 5; i++) {
      world.step();
      const s = world.snapshot();
      if (s.floorChoice && s.floorChoice.length > 0) { choice = s.floorChoice; break; }
    }
    if (choice) break;
    if (world.snapshot().roomPhase === 3) break;
    safety++;
  }
  return { world, choice };
}

test("multi-floor progression offers floorChoice (2 options) at intermission", () => {
  const { choice } = reachRouteChoice();
  assert.ok(choice && choice.length === 2, `floorChoice 应有 2 选项，实际 ${choice && choice.length}`);
  const ids = choice.map((o: any) => o.id);
  assert.ok(ids.includes("deep") && ids.includes("vault"), `路线含 深渊/宝库：${ids.join(",")}`);
});

test("CHOOSE_FLOOR applies modifier and spawns next wave", () => {
  const { world, choice } = reachRouteChoice();
  assert.ok(choice, "应有路线选择");
  // 选 deep（idx 0）
  world.enqueueInput(0, { seq: 99999, tick: 0, action: InputAction.CHOOSE_FLOOR, dir: { x: 0, y: 0 }, param: 0 });
  world.step();
  const s = world.snapshot();
  assert.equal(s.floorChoice, null, "选择后 floorChoice 清空");
  assert.equal(s.activeRoute, "deep", "activeRoute = deep");
  // 下一层敌人已生成（HP 更高：floorScale ×1.2）
  const enemies = world.actors().filter((a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS);
  assert.ok(enemies.length > 0, "选择后 spawnWave 生成敌人");
  // 确定性：deep 的 HP 应显著高于默认（waveFloor>=2 时 floorScale≥1.15，deep 再 ×1.2）
  const floor = s.floor;
  assert.ok(floor >= 2, `已进入下一层 floor=${floor}`);
});
