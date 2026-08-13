// tmp-boss.mjs — 验证 BOSS-MULTI-SKILL：火焰新星触发 + AOE 结算
import { createWorld } from "./packages/sim-core/src/world.ts";
import { EntityKind, EntityStatus } from "./packages/sim-core/src/types.ts";

// 找一个 wave1 含 boss 的 seed（若没有则扫）
let world = null, boss = null;
for (let i = 0; i < 50; i++) {
  const w = createWorld({ runId: "BOSS", seed: "BOSS" + i, biomeId: 0, players: [{ seatId: 0, userId: "P1", classId: "tank" }] });
  const b = w.actors().find((a) => a.kind === EntityKind.BOSS);
  if (b) { world = w; boss = b; console.log("found boss: seed=BOSS" + i, "bossNovaAtTick=" + b.bossNovaAtTick); break; }
}
if (!world) { console.log("no boss in 50 seeds"); process.exit(1); }

// 玩家贴近 boss（AOE 判定范围内）
const p = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
console.log("boss pos:", boss.x, boss.y, "player pos:", p.x, p.y, "dist:", Math.hypot(boss.x-p.x, boss.y-p.y).toFixed(1));
// 移动玩家靠近 boss（40 tick）
for (let t = 0; t < 40; t++) {
  const me = world.actors().find((a) => a.id === p.id);
  const b2 = world.actors().find((a) => a.id === boss.id);
  if (!me || !b2) break;
  const dx = b2.x - me.x, dy = b2.y - me.y;
  const len = Math.hypot(dx, dy) || 1;
  world.enqueueInput(0, { seq: t + 1, tick: t, action: 0, dir: { x: dx / len, y: dy / len } });
  world.step();
}
// 玩家 hp before
const me2 = world.actors().find((a) => a.id === p.id);
console.log("player hp before nova:", me2.hp);

// 推进到 bossNovaAtTick 到达（多跑 120 tick）
let novaSeen = false;
for (let t = 0; t < 120; t++) {
  const b3 = world.actors().find((a) => a.id === boss.id);
  if (!b3) break;
  if (b3.telegraph && b3.telegraph.novaRadius != null) novaSeen = true;
  world.enqueueInput(0, { seq: 500 + t, tick: 0, action: 0, dir: { x: 0, y: 0 } });
  world.step();
}
const me3 = world.actors().find((a) => a.id === p.id);
console.log("player hp after nova window:", me3 ? me3.hp : "GONE");
console.log("nova telegraph 出现:", novaSeen ? "✓" : "✗");
console.log(novaSeen ? "PASS: boss 火焰新星触发（telegraph 预警出现）" : "FAIL: 未触发");
