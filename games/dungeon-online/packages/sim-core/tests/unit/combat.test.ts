/**
 * combat.test.ts — E5 战斗结算权威（系统⑦，sim-core 单测）
 *
 * 覆盖（S5.1–S5.7）：
 *  - 伤害结算降低 hp（⑦ 权威）
 *  - hp 降至 0 → 置 DOWNED 位（倒地触发，⑪ E7 接管）
 *  - DODGE 授予 IFRAME 并抵消后续命中（闪避免伤）
 *  - telegraph 前摇 ≥18 tick（D12）：完成前伤害为 no-op
 *  - C11 伪造伤害拒绝：客户端 amount 被完全忽略，服务端裁决
 *  - 纪律 B 契约：⑧ enemy-ai 只 import type，绝不直改实体状态（仅可经 resolveDamage）
 *
 * 运行：node --experimental-strip-types --test tests/unit/combat.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveDamage, CombatKind, MIN_TELEGRAPH_TICKS } from "../../src/combat.ts";
import { EntityStatus } from "../../src/types.ts";
import type { CombatEntity, CombatState, DamageRequest } from "../../src/combat.ts";

function mkState(tick: number, entities: CombatEntity[]): CombatState {
  const m = new Map<number, CombatEntity>();
  for (const e of entities) m.set(e.id, e);
  return { tick, entities: m };
}

function req(p: Partial<DamageRequest> & Pick<DamageRequest, "sourceId" | "targetId" | "kind">): DamageRequest {
  return { amount: 0, tick: 0, ...p };
}

test("damage reduces target hp (⑦ authoritative settlement)", () => {
  const target: CombatEntity = { id: 10, hp: 100, maxHp: 100, status: EntityStatus.ALIVE };
  const source: CombatEntity = { id: 1, hp: 140, maxHp: 140, status: EntityStatus.ALIVE };
  // SLAUGHTER-FIX 2026-08-12：玩家普攻 26→38。
  const ev = resolveDamage(mkState(5, [target, source]), req({ sourceId: 1, targetId: 10, kind: CombatKind.ATTACK }));
  assert.equal(target.hp, 62, "100 - 38 (server damage) = 62");
  assert.equal(ev.deltaHp, -38);
  assert.equal(ev.targetId, 10);
  assert.equal(ev.tick, 5);
  assert.equal(ev.statusChange & EntityStatus.ALIVE, EntityStatus.ALIVE);
  assert.equal(ev.statusChange & EntityStatus.DOWNED, 0, "still alive → no DOWNED");
});

test("hp reaching 0 sets DOWNED status bit (downed trigger)", () => {
  const target: CombatEntity = { id: 10, hp: 10, maxHp: 60, status: EntityStatus.ALIVE };
  const source: CombatEntity = { id: 1, hp: 140, maxHp: 140, status: EntityStatus.ALIVE };
  const ev = resolveDamage(mkState(7, [target, source]), req({ sourceId: 1, targetId: 10, kind: CombatKind.ATTACK }));
  assert.equal(target.hp, 0, "hp clamped to 0");
  assert.equal(ev.deltaHp, -10);
  assert.equal(ev.statusChange & EntityStatus.DOWNED, EntityStatus.DOWNED, "DOWNED bit set at hp<=0");
});

test("DODGE grants IFRAME and negates a subsequent attack", () => {
  const player: CombatEntity = { id: 1, hp: 140, maxHp: 140, status: EntityStatus.ALIVE };
  const enemy: CombatEntity = { id: 99, hp: 60, maxHp: 60, status: EntityStatus.ALIVE };

  // 1) 玩家闪避：授予自身 IFRAME 免伤窗口（无直接伤害）。
  const dodge = resolveDamage(mkState(3, [player, enemy]), req({ sourceId: 1, targetId: 1, kind: CombatKind.DODGE }));
  assert.equal(dodge.deltaHp, 0, "dodge deals no damage");
  assert.ok(player.iframeUntilTick != null && player.iframeUntilTick > 3, "iframe window opened");
  assert.equal(player.status & EntityStatus.IFRAME, EntityStatus.IFRAME, "IFRAME bit set");

  // 2) 敌人在免伤窗口内命中玩家 → 完全抵消（DODGE 生效）。
  const hit = resolveDamage(mkState(10, [player, enemy]), req({ sourceId: 99, targetId: 1, kind: CombatKind.ATTACK }));
  assert.equal(hit.deltaHp, 0, "attack during iframe is negated");
  assert.equal(player.hp, 140, "player hp unchanged after negated hit");
});

test("telegraph windup enforced: damage is no-op before 18 ticks (D12)", () => {
  const target: CombatEntity = { id: 10, hp: 100, maxHp: 100, status: EntityStatus.ALIVE };
  const source: CombatEntity = {
    id: 1,
    hp: 140,
    maxHp: 140,
    status: EntityStatus.ALIVE,
    telegraph: { startTick: 0, applyTick: MIN_TELEGRAPH_TICKS, targetId: 10, kind: CombatKind.ATTACK },
  };

  // tick=10 < applyTick(18) → no-op（前摇未完成）。
  const early = resolveDamage(mkState(10, [target, source]), req({ sourceId: 1, targetId: 10, kind: CombatKind.ATTACK }));
  assert.equal(early.deltaHp, 0, "pre-windup hit is a no-op");
  assert.equal(target.hp, 100, "hp untouched before windup completes");

  // tick=18 == applyTick → 前摇完成，伤害生效（SLAUGHTER-FIX：普攻 38）。
  const ready = resolveDamage(mkState(18, [target, source]), req({ sourceId: 1, targetId: 10, kind: CombatKind.ATTACK }));
  assert.equal(ready.deltaHp, -38, "damage applies once windup completes");
  assert.equal(target.hp, 62);
});

test("C11 forged-amount rejection: client amount is ignored, server adjudicates", () => {
  const target: CombatEntity = { id: 10, hp: 30, maxHp: 30, status: EntityStatus.ALIVE };
  const source: CombatEntity = { id: 1, hp: 140, maxHp: 140, status: EntityStatus.ALIVE };

  // 客户端伪造 amount=9999（秒杀），但 ⑦ 完全忽略，按服务端 38 结算（SLAUGHTER-FIX）。
  const ev = resolveDamage(
    mkState(4, [target, source]),
    req({ sourceId: 1, targetId: 10, kind: CombatKind.ATTACK, amount: 9999 }),
  );
  assert.equal(target.hp, 0, "30 - 38 clamped to 0 (DOWNED), NOT 30 - 9999");
  assert.equal(ev.deltaHp, -30, "deltaHp clamped to actual hp loss (30)");
});

test("discipline B: ⑧ enemy-ai imports only types and never mutates entity state directly", () => {
  const path = fileURLToPath(new URL("../../src/enemy-ai.ts", import.meta.url));
  const src = readFileSync(path, "utf8");

  // 仅允许 `import type` 引用 combat / dungeon-gen（纪律 B：绝不 import 运行时）。
  const runtimeCombat = /import\s+(?!type\b)[^;]*from\s+["']\.\/combat(\.js|\.ts)?["']/.test(src);
  const runtimeDungeonGen = /import\s+(?!type\b)[^;]*from\s+["']\.\/dungeon-gen(\.js|\.ts)?["']/.test(src);
  assert.equal(runtimeCombat, false, "enemy-ai must not runtime-import combat (only import type)");
  assert.equal(runtimeDungeonGen, false, "enemy-ai must not runtime-import dungeon-gen (only import type)");
  assert.ok(/import\s+type/.test(src), "enemy-ai should use import type (discipline B)");

  // 契约：⑧ 绝不直改实体 hp/status；唯一出口是 resolveDamage（由本测试外的 ⑦ 提供）。
  const directHpMutation = /\.\s*hp\s*=[^=]/.test(src) || /\.\s*hp\s*\+=/.test(src);
  const directStatusMutation = /\.\s*status\s*\|=/.test(src) || /\.\s*status\s*=[^=]/.test(src);
  assert.equal(directHpMutation, false, "enemy-ai must not directly mutate entity hp");
  assert.equal(directStatusMutation, false, "enemy-ai must not directly mutate entity status");
});
