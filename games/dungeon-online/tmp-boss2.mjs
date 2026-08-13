// tmp-boss2.mjs — 用 S0 seed（wave2 有 boss）验证火焰新星
import { createWorld } from "./packages/sim-core/src/world.ts";
import { EntityKind, EntityStatus, WAVE_INTERMISSION_TICKS } from "./packages/sim-core/src/types.ts";
import { resolveDamage, CombatKind } from "./packages/sim-core/src/combat.ts";

const world = createWorld({ runId: "BOSS2", seed: "S0", biomeId: 0, players: [
  { seatId: 0, userId: "P1", classId: "tank" },
]});
let boss = null;
let safety = 0;
while (safety < 100) {
  // 清光当前波敌人
  for (let guard2 = 0; guard2 < 40; guard2++) {
    const all = world.actors();
    const enemies = all.filter((a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS);
    if (enemies.length === 0) break;
    const combatMap = new Map(all.map((a) => [a.id, a]));
    for (const e of enemies) {
      let guard = 0;
      while (guard < 4000 && e.hp > 0) {
        resolveDamage(
          { tick: world.tick, entities: combatMap },
          { sourceId: e.id, targetId: e.id, amount: 0, tick: world.tick, kind: CombatKind.ATTACK },
        );
        guard++;
      }
      if (e.kind === EntityKind.BOSS) boss = e;
    }
    world.step();
  }
  // 跨过 intermission 推下一波
  for (let i = 0; i < WAVE_INTERMISSION_TICKS + 5; i++) {
    world.step();
    const b = world.actors().find((a) => a.kind === EntityKind.BOSS);
    if (b) boss = b;
    const e2 = world.actors().filter((a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS);
    if (e2.length > 0) break;
  }
  const s = world.snapshot();
  if (s.roomPhase === 3) break; // 通关
  const hasEnemies = world.actors().some((a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS);
  if (boss || !hasEnemies) { if (!hasEnemies && s.wave >= 2 && !boss) {} else if (boss) break; }
  if (s.wave >= 2 && boss) break;
  safety++;
}
console.log("boss found:", boss ? { id: boss.id, bossNovaAtTick: boss.bossNovaAtTick, hp: boss.hp, maxHp: boss.maxHp } : "none (wave=" + world.snapshot().wave + ")");
if (!boss) process.exit(0);

// 玩家靠近 boss 并推进 150 tick，检查新星
const p0 = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
console.log("player hp before:", p0 ? p0.hp : "?", "boss:", boss.hp, "/", boss.maxHp);
let novaSeen = false;
for (let t = 0; t < 150; t++) {
  const me = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
  const b = world.actors().find((a) => a.id === boss.id);
  if (!me || !b) break;
  if (b.telegraph && b.telegraph.novaRadius != null) { novaSeen = true; console.log("  nova telegraph at tick", world.tick, "novaRadius=", b.telegraph.novaRadius); }
  world.enqueueInput(0, { seq: 1000 + t, tick: 0, action: 0, dir: { x: 0, y: 0 } });
  world.step();
}
const meF = world.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
console.log("nova telegraph seen:", novaSeen);
console.log("player hp after:", meF ? meF.hp : "GONE");
console.log(novaSeen ? "PASS: boss 火焰新星触发" : "FAIL: 未见新星");
