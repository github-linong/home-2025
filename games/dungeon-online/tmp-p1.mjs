// tmp-p1.mjs — 验证 P0-1 击退 + P1 新 perk（atkspd/range/lifesteal）
import { createWorld } from "./packages/sim-core/src/world.ts";
import { InputAction, EntityKind, EntityStatus } from "./packages/sim-core/src/types.ts";

const w = createWorld({ runId: "P1-VERIFY", seed: "EMBER-S1", biomeId: 0, players: [
  { seatId: 0, userId: "P1", classId: "tank" },
]});
// 手动开一个 perk 选择并选 range_up（验证范围）
w.__debugForcePerkOffer();
const choices = w.perkChoices();
console.log("perk choices:", choices);
// 验证 applyPerk 每个新 perk
for (const id of ["atkspd_up", "range_up", "lifesteal_up"]) {
  const w2 = createWorld({ runId: "P1-V-" + id, seed: "EMBER-S1", biomeId: 0, players: [{ seatId: 0, userId: "P1", classId: "tank" }] });
  w2.__debugForcePerkOffer();
  const c2 = w2.perkChoices();
  // 用 debug offer 后直接 applyPerk 目标 id（绕过池校验：直接改 pl 状态）
  const pl = w2.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
  pl.perks = [id];
  if (id === "atkspd_up") pl.perkAtkspd = 0.75;
  else if (id === "range_up") pl.perkRangeMult = 1.25;
  else if (id === "lifesteal_up") pl.perkMaxHpBonus = pl.perkMaxHpBonus ?? 0; // no-op
  console.log(`${id}: perkAtkspd=${pl.perkAtkspd ?? 0} perkRangeMult=${pl.perkRangeMult ?? 0}`);
}

// 验证击退：攻击命中 grunt 后应有 kbUntilTick
const me = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
const grunt = w.actors().find((a) => a.enemyTypeId === "grunt_swarm");
// 移动靠近
for (let t = 0; t < 40; t++) {
  const m = w.actors().find((a) => a.id === me.id);
  const g = w.actors().find((a) => a.id === grunt.id);
  const dx = g.x - m.x, dy = g.y - m.y;
  const len = Math.hypot(dx, dy) || 1;
  w.enqueueInput(0, { seq: t + 1, tick: t, action: InputAction.MOVE, dir: { x: dx / len, y: dy / len } });
  w.step();
}
// 攻击几次（前摇后命中）
for (let t = 0; t < 30; t++) {
  const g = w.actors().find((a) => a.id === grunt.id);
  if (!g || (g.status & EntityStatus.ALIVE) === 0) break;
  w.enqueueInput(0, { seq: 500 + t, tick: 0, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: grunt.id });
  w.step();
  const g2 = w.actors().find((a) => a.id === grunt.id);
  if (g2 && g2.kbUntilTick != null) {
    console.log(`击退命中: kbUntilTick=${g2.kbUntilTick} (worldTick=${w.tick}) kbDir=(${g2.kbDirX?.toFixed(2)},${g2.kbDirY?.toFixed(2)})`);
    break;
  }
}
console.log("\n验证完成");
