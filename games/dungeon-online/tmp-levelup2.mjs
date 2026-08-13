// tmp-levelup2.mjs — 调试升级：检查攻击链路
import { createWorld } from "./packages/sim-core/src/world.ts";
import { InputAction, EntityKind, EntityStatus } from "./packages/sim-core/src/types.ts";

const w = createWorld({ runId: "LVL-UP", seed: "EMBER-S1", biomeId: 0, players: [
  { seatId: 0, userId: "P1", classId: "tank" },
]});
const enemy = w.actors().find((a) => a.enemyTypeId === "grunt_swarm");
console.log("初始:", { meX: w.actors().find(a=>a.kind===0).x, meY: w.actors().find(a=>a.kind===0).y, enX: enemy.x, enY: enemy.y, dist: Math.hypot(enemy.x - w.actors().find(a=>a.kind===0).x, enemy.y - w.actors().find(a=>a.kind===0).y).toFixed(1) });

// 移动靠近（打印中途状态）
for (let t = 0; t < 40; t++) {
  const me = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
  const tgt = w.actors().find((a) => a.id === enemy.id);
  if (!me || !tgt) break;
  const dx = tgt.x - me.x, dy = tgt.y - me.y;
  const len = Math.hypot(dx, dy) || 1;
  w.enqueueInput(0, { seq: t + 1, tick: t, action: InputAction.MOVE, dir: { x: dx / len, y: dy / len } });
  w.step();
}
const me40 = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
const en40 = w.actors().find((a) => a.id === enemy.id);
console.log("40tick后:", { meX: me40.x, meY: me40.y, enX: en40 ? en40.x : 'GONE', enY: en40 ? en40.y : '', dist: en40 ? Math.hypot(en40.x-me40.x, en40.y-me40.y).toFixed(1) : 'GONE', enHp: en40 ? en40.hp : 'GONE' });

// 攻击循环
for (let t = 0; t < 80; t++) {
  const tgt = w.actors().find((a) => a.id === enemy.id);
  if (!tgt || (tgt.status & EntityStatus.ALIVE) === 0) break;
  w.enqueueInput(0, { seq: 1000 + t, tick: 0, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: enemy.id });
  w.step();
  const me = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
  const en = w.actors().find((a) => a.id === enemy.id);
  if (t % 5 === 0 && en) {
    console.log(`loop=${t} worldTick=${w.tick} telegraph=${me.telegraph ? 'Y(apply=' + me.telegraph.applyTick + ')' : 'N'} enHp=${en.hp} dist=${Math.hypot(en.x-me.x,en.y-me.y).toFixed(0)}`);
  }
}
const p0 = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
console.log("最终:", { level: p0.level, xp: p0.xp, perks: w.perkChoices() });
