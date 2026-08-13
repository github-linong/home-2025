import { createWorld } from "./packages/sim-core/src/world.ts";
import { EntityKind, EntityStatus, WAVE_INTERMISSION_TICKS } from "./packages/sim-core/src/types.ts";
import { resolveDamage, CombatKind } from "./packages/sim-core/src/combat.ts";

const world = createWorld({ runId: "ROUTE", seed: "S0", biomeId: 0, players: [{ seatId: 0, userId: "P1", classId: "tank" }] });
console.log("初始: wave=1 floor=", world.snapshot().floor, "totalFloors=", world.snapshot().totalFloors);
let safety = 0;
while (safety < 200) {
  // 清场
  for (let g = 0; g < 60; g++) {
    const all = world.actors();
    const enemies = all.filter(a => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS);
    if (enemies.length === 0) break;
    const cm = new Map(all.map(a => [a.id, a]));
    for (const e of enemies) {
      let gu = 0;
      while (gu < 4000 && e.hp > 0) { resolveDamage({ tick: world.tick, entities: cm }, { sourceId: e.id, targetId: e.id, amount: 0, tick: world.tick, kind: CombatKind.ATTACK }); gu++; }
    }
    world.step();
  }
  // 推进 intermission
  for (let i = 0; i < WAVE_INTERMISSION_TICKS + 5; i++) {
    world.step();
    const s = world.snapshot();
    if (s.floorChoice && s.floorChoice.length > 0) { console.log("floorChoice @ tick", world.tick, "floor", s.floor, "options", JSON.stringify(s.floorChoice)); safety = 999; break; }
  }
  const s2 = world.snapshot();
  if (safety !== 999) {
    console.log(`wave=${s2.wave} floor=${s2.floor} enemies=${world.actors().filter(a=>a.kind===EntityKind.ENEMY||a.kind===EntityKind.BOSS).length} roomPhase=${s2.roomPhase} intermission=${s2.intermissionTicks}`);
  }
  if (s2.roomPhase === 3) { console.log("SETTLE（通关）"); break; }
  safety++;
}
