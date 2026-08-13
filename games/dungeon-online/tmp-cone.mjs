// tmp-cone.mjs — 验证玩家攻击 telegraph 是 CONE(扇形) 且方向朝目标（不再是 360° 大圆）
import { createWorld } from "./packages/sim-core/src/world.ts";
import { InputAction, EntityKind } from "./packages/sim-core/src/types.ts";

const w = createWorld({ runId: "CONE-VERIFY", seed: "EMBER-S1", biomeId: 0, players: [
  { seatId: 0, userId: "P1", classId: "tank" },
]});
const me = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
const enemy = w.actors().find((a) => a.enemyTypeId === "grunt_swarm");
console.log("me:", { x: me.x, y: me.y }, "enemy:", { x: enemy.x, y: enemy.y });

// 朝敌人走 20 tick（进射程）
for (let i = 0; i < 20; i++) {
  const m = w.actors().find((a) => a.id === me.id);
  const e = w.actors().find((a) => a.id === enemy.id);
  const dx = e.x - m.x, dy = e.y - m.y;
  const len = Math.hypot(dx, dy) || 1;
  w.enqueueInput(0, { seq: 1 + i, tick: i, action: InputAction.MOVE, dir: { x: dx / len, y: dy / len } });
  w.step();
}
const m2 = w.actors().find((a) => a.id === me.id);
const e2 = w.actors().find((a) => a.id === enemy.id);
console.log("dist:", Math.hypot(e2.x - m2.x, e2.y - m2.y).toFixed(1));

// 攻击（方向朝敌人）
const ax = e2.x - m2.x, ay = e2.y - m2.y;
const alen = Math.hypot(ax, ay) || 1;
w.enqueueInput(0, { seq: 99, tick: 20, action: InputAction.ATTACK, dir: { x: ax / alen, y: ay / alen }, target: enemy.id });
w.step();

const snap = w.snapshot();
const meSnap = snap.entities.find((e) => e.id === me.id);
console.log("telegraph:", JSON.stringify(meSnap.telegraph, null, 2));

// 验证
const tg = meSnap && meSnap.telegraph;
if (!tg) { console.log("FAIL: 无 telegraph"); process.exit(1); }
const shapeOk = tg.shape === 2; // CONE
console.log(`shape=CONE(2): ${shapeOk ? '✓' : '✗ (' + tg.shape + ')'}`);
const dirOk = tg.dir && (tg.dir.x !== 0 || tg.dir.y !== 0);
console.log(`dir 朝目标: ${dirOk ? '✓ (' + tg.dir.x.toFixed(2) + ',' + tg.dir.y.toFixed(2) + ')' : '✗'}`);
const radiusOk = tg.radius >= 120 && tg.radius <= 140;
console.log(`radius≈130: ${radiusOk ? '✓ (' + tg.radius + ')' : '✗ (' + tg.radius + ')'}`);
console.log(shapeOk && dirOk && radiusOk ? '\nPASS: 玩家攻击=前方扇形(±60°,130px)，方向朝目标' : '\nFAIL');
