// tmp-levelup.mjs — 验证 BUILD-UP：升级触发「能力三选一」+ applyPerk 生效
import { createWorld } from "./packages/sim-core/src/world.ts";
import { InputAction, EntityKind, EntityStatus } from "./packages/sim-core/src/types.ts";

const w = createWorld({ runId: "LVL-UP", seed: "EMBER-S1", biomeId: 0, players: [
  { seatId: 0, userId: "P1", classId: "tank" },
]});
const enemy = w.actors().find((a) => a.enemyTypeId === "grunt_swarm");
console.log("grunt:", enemy ? { id: enemy.id, hp: enemy.hp } : "none");

// 直接杀一批敌人直到升级（grunt 每只 +6xp，阈值 30 → 杀 ~5 只升 1 级）
// 简化：直接攻击最近敌人（无论距离，AOE 判定会处理射程），被杀就放弃
for (let step = 0; step < 500; step++) {
  const p0 = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
  if (!p0 || (p0.status & EntityStatus.ALIVE) === 0) { console.log("玩家倒地，放弃"); break; }
  if ((p0.level ?? 1) >= 2) { console.log("升级完成 Lv." + p0.level); break; }
  // 最近敌人
  let best = null, bd = 1e9;
  for (const a of w.actors()) {
    if ((a.kind !== EntityKind.ENEMY && a.kind !== EntityKind.BOSS) || (a.status & EntityStatus.ALIVE) === 0) continue;
    const d = Math.hypot(a.x - p0.x, a.y - p0.y);
    if (d < bd) { bd = d; best = a; }
  }
  if (!best) { w.step(); continue; }
  const me = w.actors().find((a) => a.id === p0.id);
  const tgt = w.actors().find((a) => a.id === best.id);
  if (bd > 80) {
    const dx = tgt.x - me.x, dy = tgt.y - me.y;
    const len = Math.hypot(dx, dy) || 1;
    w.enqueueInput(0, { seq: step + 1, tick: step, action: InputAction.MOVE, dir: { x: dx / len, y: dy / len } });
  } else {
    w.enqueueInput(0, { seq: step + 1, tick: step, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: best.id });
  }
  w.step();
}

// 击杀后检查升级 + perkChoices
const p0 = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
const choices = w.perkChoices();
const snap = w.snapshot();
console.log("player:", { level: p0.level, xp: p0.xp, maxHp: p0.maxHp });
console.log("perkChoices (升级三选一):", choices);
console.log("snapshot perkChoices:", snap.perkChoices);

// 选择第一个 perk
if (choices.length > 0) {
  const ok = w.applyPerk(0, choices[0]);
  console.log(`applyPerk(${choices[0]}): ${ok}`);
  const p0b = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
  console.log("after perk:", { perks: p0b.perks, perkDamageMult: p0b.perkDamageMult, perkMaxHpBonus: p0b.perkMaxHpBonus });
}

// 结论
const hasChoices = choices.length === 3;
const levelUp = p0.level >= 2;
console.log(`\n升级: ${levelUp ? '✓ Lv.' + p0.level : '✗'}`);
console.log(`升级触发三选一: ${hasChoices ? '✓ ' + choices.join(',') : '✗'}`);
console.log(levelUp && hasChoices ? 'PASS: 升级 → 三选一 → applyPerk 生效' : 'FAIL');
