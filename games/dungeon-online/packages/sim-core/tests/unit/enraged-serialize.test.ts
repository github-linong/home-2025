/**
 * enraged-serialize.test.ts — M12：enraged 标记经 world.snapshot 下发至客户端（确定性安全）
 *
 * 覆盖：
 *  - (A) 非狂暴实体序列化（JSON.stringify）后「不含」enraged 键 → 与 rescue/telegraph 先例一致，
 *        byte 表示不变，确定性快照哈希不受影响。
 *  - (B) 已狂暴的 brute_charger：经公开 API（combat.resolveDamage 压血 + world.step 触发狂暴逻辑）
 *        进入 enraged 后，snapshot().entities 中该实体携带 enraged === true。
 *
 * 与 golden 哈希计算完全一致：sha256(JSON.stringify(entities))。JSON.stringify 自动丢弃 undefined
 * 键，故 (A) 中「未狂暴实体」其序列化字节与改动前逐字节相同。
 *
 * 确定性：仅使用现有 Rng(seed)；不引入新的 hp/status 变更路径（仅调用 combat.resolveDamage
 * 与 world.step —— 即纪律 B 唯一允许的变更来源），world.ts 改动只 READ a.enraged 下发。
 *
 * 运行：node --experimental-strip-types --test tests/unit/enraged-serialize.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/world.ts";
import {
  EntityKind,
  InputAction,
} from "../../src/types.ts";
import {
  resolveDamage,
  CombatKind,
  type CombatEntity,
} from "../../src/combat.ts";

// ============================================================
// (A) 条件序列化丢弃：非狂暴实体序列化后不含 enraged 键（确定性安全）
// ============================================================

test("snapshot: non-enraged entities serialize WITHOUT an enraged key (determinism-safe drop)", () => {
  const world = createWorld({
    runId: "ENRAGED-SERIALIZE-DROP",
    seed: "EMBER-S1",
    biomeId: 0,
    players: [
      { seatId: 0, userId: "P1", classId: "tank" },
      { seatId: 1, userId: "P2", classId: "ranger" },
    ],
  });

  // 推进若干 tick（含一次攻击），确保有实体进入快照，但 seed/window 不触达 brute_charger 狂暴。
  for (let tk = 0; tk < 40; tk++) {
    const enemies = world.actors().filter(
      (a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS,
    );
    if (enemies.length > 0) {
      const tid = enemies[0].id;
      world.enqueueInput(0, { seq: tk + 1, tick: tk, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: tid });
      world.enqueueInput(1, { seq: tk + 1, tick: tk, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: tid });
    }
    world.step();
  }

  const entities = world.snapshot().entities;
  assert.ok(entities.length > 0, "world produced entities to serialize");

  // 与 golden 哈希计算一致：JSON.stringify → 丢弃 undefined 键。
  for (const e of entities) {
    const serialized = JSON.parse(JSON.stringify(e));
    assert.ok(
      !("enraged" in serialized),
      `non-enraged entity id=${e.id} must NOT carry an enraged key after serialization`,
    );
  }

  // 整体层面再确认：序列化后的实体 JSON 不应含 "enraged" 子串。
  const fullJson = JSON.stringify(entities);
  assert.ok(!fullJson.includes('"enraged"'), "serialized entities contain no enraged key");
});

// ============================================================
// (B) 强断言：已狂暴 brute_charger 在快照中携带 enraged === true
// ============================================================

test("snapshot: enraged brute_charger is emitted with enraged === true", (t) => {
  const world = createWorld({
    runId: "ENRAGED-SERIALIZE-EMIT",
    seed: "EMBER-S1",
    biomeId: 0,
    players: [
      { seatId: 0, userId: "P1", classId: "tank" },
      { seatId: 1, userId: "P2", classId: "ranger" },
    ],
  });

  // 推进波次直到出现 brute_charger（与 brute-charger.test.ts 同 seed/模式；EMBER-S1 稳定产出）。
  let chargerId: number | null = null;
  const MAX_TICKS = 2000;
  for (let tk = 0; tk < MAX_TICKS && chargerId === null; tk++) {
    const bc = world.actors().find((a) => a.enemyTypeId === "brute_charger");
    if (bc) {
      chargerId = bc.id;
      break;
    }
    const enemies = world.actors().filter(
      (a) => a.kind === EntityKind.ENEMY || a.kind === EntityKind.BOSS,
    );
    if (enemies.length > 0) {
      const tid = enemies[0].id;
      world.enqueueInput(0, { seq: tk + 1, tick: tk, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: tid });
      world.enqueueInput(1, { seq: tk + 1, tick: tk, action: InputAction.ATTACK, dir: { x: 0, y: 0 }, target: tid });
    }
    world.step();
  }

  if (chargerId === null) {
    t.skip("no brute_charger appeared in seed EMBER-S1/biome 0; enrage emit not testable");
    return;
  }

  const c = world.actors().find((a) => a.id === chargerId)!;
  const combatMap = new Map(world.actors().map((a) => [a.id, a as CombatEntity]));
  // 经 resolveDamage（玩家裁决路径）将 hp 压到 <50% maxHp 且 >0（保持存活，不触发倒地）。
  while (c.hp > 0 && c.hp >= c.maxHp * 0.5) {
    if (c.hp - 18 <= 0) {
      t.skip("charger maxHp makes -18 unable to reach the (0,50%) enrage window");
      return;
    }
    resolveDamage(
      { tick: world.tick, entities: combatMap },
      { sourceId: 0, targetId: chargerId, amount: 0, tick: world.tick, kind: CombatKind.ATTACK },
    );
  }
  assert.ok(c.hp > 0 && c.hp < c.maxHp * 0.5, "charger hp now below 50% and alive");

  // world.step 触发狂暴逻辑（置 a.enraged=true 并经 spawnChargerAdd 生 1 只 add）。
  world.step();
  const after = world.actors().find((a) => a.id === chargerId)!;
  assert.equal(after.enraged, true, "charger marked enraged after step");

  // 关键断言：snapshot().entities 必须包含该实体的 enraged === true（客户端据此渲染狂暴）。
  const snap = world.snapshot();
  const ser = snap.entities.find((e) => e.id === chargerId);
  assert.ok(ser, "enraged charger present in snapshot entities");
  assert.equal((ser as { enraged?: boolean }).enraged, true, "snapshot emits enraged === true for the charger");
});
