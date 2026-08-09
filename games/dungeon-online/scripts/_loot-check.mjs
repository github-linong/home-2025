// _loot-check.mjs — 确定性验证「敌人死亡 → 掉落 LOOT(kind=6)」整链路。
import { createWorld } from '../packages/sim-core/src/world.ts';

const world = createWorld({
  runId: 'loot-test', seed: 'lootseed', biomeId: 0,
  players: [{ seatId: 0, userId: 'u0', classId: 'tank' }],
  spawnEnemies: true,
});

const actors0 = world.actors();
const grunt = actors0.find((a) => a.kind === 1);
if (!grunt) { console.error('NO GRUNT SPAWNED'); process.exit(2); }
grunt.hp = 5; // 一刀必死

let lootAppeared = false;
let lootKind = null;
for (let i = 0; i < 200 && !lootAppeared; i++) {
  world.enqueueInput(0, { seq: i, tick: world.tick, action: 1, dir: { x: 1, y: 0 }, target: grunt.id });
  world.step();
  const loot = world.actors().find((a) => a.kind === 6);
  if (loot) { lootAppeared = true; lootKind = loot.lootType; }
}

console.log('lootAppeared =', lootAppeared, '| lootType =', lootKind);
process.exit(lootAppeared ? 0 : 1);
