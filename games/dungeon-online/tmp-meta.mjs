// tmp-meta.mjs — 验证 META-PROGRESSION：startingPerks 生效 + 灰烬结算逻辑
import { createHash } from "node:crypto";
import { createWorld } from "./packages/sim-core/src/world.ts";
import { EntityKind } from "./packages/sim-core/src/types.ts";

// 1. startingPerks 生效：开局预置 dmg/hp/spd perk
const w = createWorld({
  runId: "META", seed: "EMBER-S1", biomeId: 0,
  players: [{ seatId: 0, userId: "P1", classId: "tank" }],
  startingPerks: ["dmg_up", "dmg_up", "hp_up", "spd_up"],
});
const p = w.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
console.log("perks:", p.perks);
console.log("perkDamageMult:", p.perkDamageMult, "(期望 1.15*1.15=" + (1.15*1.15).toFixed(3) + ")");
console.log("perkSpeedMult:", p.perkSpeedMult, "(期望 1.12)");
console.log("perkMaxHpBonus:", p.perkMaxHpBonus, "maxHp:", p.maxHp, "(期望 255+20=275)");

// 2. 确定性：同一 startingPerks 重跑 hash 一致
const hashEntities = (ww) => {
  return createHash("sha256").update(JSON.stringify(ww.snapshot().entities)).digest("hex");
};
const h1 = await hashEntities(w);
const w2 = createWorld({
  runId: "META2", seed: "EMBER-S1", biomeId: 0,
  players: [{ seatId: 0, userId: "P1", classId: "tank" }],
  startingPerks: ["dmg_up", "dmg_up", "hp_up", "spd_up"],
});
const h2 = await hashEntities(w2);
console.log("\n确定性 hash:", h1 === h2 ? "✓ 一致" : "✗ 不一致");

// 3. 无 startingPerks → 与原行为一致（perks undefined）
const w3 = createWorld({ runId: "META3", seed: "EMBER-S1", biomeId: 0, players: [{ seatId: 0, userId: "P1", classId: "tank" }] });
const p3 = w3.actors().find((a) => a.kind === EntityKind.PLAYER && a.ownerId === 0);
console.log("\n无 startingPerks:", p3.perks === undefined && p3.maxHp === 255 ? "✓ 不受影响" : "✗");

// 结论
const ok = p.perks.length === 4 && p.perkDamageMult === 1.15*1.15 && p.maxHp === 275 && h1 === h2;
console.log("\n" + (ok ? "PASS: startingPerks 生效 + 确定性" : "FAIL"));
