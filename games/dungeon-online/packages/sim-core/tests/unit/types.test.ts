/**
 * types.test.ts — E2 数据基座 schema 不变量（C-B 关闭项）
 * 纯数据不变量校验：types.ts 仅含类型/接口/const，无运行时逻辑。
 * 运行：node --experimental-strip-types --test tests/unit/types.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PLAYER_CLASSES,
  CLASS_BASE,
  FACTION_COLORS,
  EntityStatus,
  ENEMY_PROTOTYPES,
  RESOURCE_PROTOTYPES,
} from "../../src/types.ts";
import type { InputCmd, InputActionValue, WorldSnapshot } from "../../src/types.ts";

/** S2.1 — EntityStatus 恰为 8 个标志位，值 = 1<<0..1<<7（8-bit bitmask 契约）。 */
test("EntityStatus is an 8-bit bitmask (flags 1<<0..1<<7)", () => {
  const flags = Object.values(EntityStatus);
  assert.equal(flags.length, 8, "应恰有 8 个状态位");
  for (let i = 0; i < 8; i++) {
    assert.equal(
      EntityStatus[Object.keys(EntityStatus)[i] as keyof typeof EntityStatus],
      1 << i,
      `第 ${i} 位应为 1<<${i}`,
    );
  }
  // 全部落在单字节内
  const combined = flags.reduce((a, b) => a | b, 0);
  assert.ok(combined <= 0xff, "所有状态位应落在 8-bit 内");
});

/** S2.1 — 4 职业齐全且基础属性为正。 */
test("PLAYER_CLASSES has 4 entries; CLASS_BASE covers all with positive stats", () => {
  assert.equal(PLAYER_CLASSES.length, 4);
  for (const cls of PLAYER_CLASSES) {
    const base = CLASS_BASE[cls];
    assert.ok(base.hp > 0, `${cls}.hp 应为正`);
    assert.ok(base.moveSpeed > 0, `${cls}.moveSpeed 应为正`);
    assert.ok(base.attackCooldownMs > 0, `${cls}.attackCooldownMs 应为正`);
    assert.ok(typeof base.label === "string" && base.label.length > 0);
  }
});

/** S2.1 — FACTION_COLORS 4 键齐备且为合法十六进制（色盲安全由 art-bible §3 保证）。 */
test("FACTION_COLORS has 4 valid hex entries", () => {
  const ids = Object.keys(FACTION_COLORS) as (keyof typeof FACTION_COLORS)[];
  assert.equal(ids.length, 4);
  for (const id of ids) {
    assert.match(
      FACTION_COLORS[id],
      /^#[0-9A-Fa-f]{6}$/,
      `${id} 应为 #RRGGBB 十六进制`,
    );
  }
});

/**
 * S2.2 — ENEMY_PROTOTYPES 每个 telegraphTicks >= 18（D12 MIN_TELEGRAPH_TICKS=18 下限）。
 * 含 bomber_imp（自爆兵，M13）：原 12 tick 短前摇例外已消除，统一对齐 18 下限（与 brute 一致）。
 */
test("ENEMY_PROTOTYPES telegraphTicks all >= 18 (D12 floor)", () => {
  const entries = Object.entries(ENEMY_PROTOTYPES);
  assert.ok(entries.length > 0, "至少应有 1 个敌人原型");
  for (const [id, p] of entries) {
    assert.ok(
      p.telegraphTicks >= 18,
      `${id}.telegraphTicks=${p.telegraphTicks} 应 >= 18 (D12 下限)`,
    );
  }
});

/** S2.3 — RESOURCE_PROTOTYPES 字段完整（category/magnitude）。 */
test("RESOURCE_PROTOTYPES have complete fields", () => {
  const entries = Object.entries(RESOURCE_PROTOTYPES);
  assert.ok(entries.length > 0, "至少应有 1 个资源原型");
  for (const [id, r] of entries) {
    assert.ok(
      ["medkit", "ammo", "buff"].includes(r.category),
      `${id}.category 应为 medkit/ammo/buff 之一`,
    );
    assert.ok(r.magnitude > 0, `${id}.magnitude 应为正`);
  }
});

/** S2.4 / C11 — InputCmd 含 seq 字段（防重放）。 */
test("InputCmd carries seq field for replay protection (C11)", () => {
  const sample: InputCmd = {
    seq: 1,
    tick: 10,
    action: "move" as InputActionValue,
    dir: { x: 1, y: 0 },
  };
  assert.equal(sample.seq, 1);
  assert.equal(typeof sample.tick, "number");
  assert.equal(sample.action, "move");
});

/** S4.3 / S4.5 — WorldSnapshot 携带可选 lastProcessedSeq（按 playerId 对账/插值）。 */
test("WorldSnapshot carries lastProcessedSeq keyed by playerId for reconciliation (S4.3)", () => {
  const snap: WorldSnapshot = {
    tick: 1,
    runId: "r",
    roomPhase: 1,
    entities: [],
    lastProcessedSeq: { 0: 1, 1: 2 },
  };
  assert.ok(snap.lastProcessedSeq, "lastProcessedSeq 应存在");
  assert.equal(snap.lastProcessedSeq![0], 1);
  assert.equal(snap.lastProcessedSeq![1], 2);
  // 不携带时仍合法（向前兼容无输入场景）。
  const bare: WorldSnapshot = { tick: 0, runId: "r", roomPhase: 1, entities: [] };
  assert.equal(bare.lastProcessedSeq, undefined);
});
