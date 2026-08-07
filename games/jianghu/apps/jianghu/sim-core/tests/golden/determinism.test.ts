/**
 * determinism.test.ts — 确定性 golden 测试（C8 / D9 / E1）
 * ===========================================================================
 * E1 雏形：固定 seed + 固定（空）输入 → 同输出（同世界快照哈希）。
 * 这是 TS 权威 ↔ 未来客户端端口 golden 对齐的锚点之一（D9）。
 *
 * 锁定约束：同 seed + 同步数 ⇒ 跨运行字节级稳定；任何破坏确定性的改动都会让断言失败。
 *
 * GOLDEN_WORLD_HASH 由 `node --experimental-strip-types` 跑下方固定序列实测得到，
 *   首次运行后填入（见文件末尾注释 / 控制台打印）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createWorld } from "../../src/world.ts";
import { EntityKind, RoomPhase } from "../../src/types.ts";

// 由 `node --experimental-strip-types` 跑固定序列（seed=JH-GOLDEN-E1, 12 steps）实测得到。
const GOLDEN_WORLD_HASH = "32ed513580c7739340794b7221e6a27ac541cc0100dd0065b518832fd2cc6a7b";

function hashEntities(entities: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(entities)).digest("hex");
}

/** 固定 seed + 无玩家输入，推进 K tick，返回实体快照哈希。 */
function runFixedWorld(seed = "JH-GOLDEN-E1", steps = 12): { hash: string; entityCount: number } {
  const world = createWorld({
    runId: "golden",
    roomId: "room_resident_public",
    seed,
    phase: RoomPhase.OVERWORLD,
    lootTokens: 4,
  });
  for (let i = 0; i < steps; i++) world.step();
  const snap = world.snapshot();
  return { hash: hashEntities(snap.entities), entityCount: snap.entities.length };
}

test("E1 golden: same seed + no input → identical world hash across runs (D9)", () => {
  const r1 = runFixedWorld();
  const r2 = runFixedWorld();
  assert.equal(r1.hash, r2.hash, "deterministic across runs");
  assert.equal(r1.hash, GOLDEN_WORLD_HASH, "matches locked golden world hash");
});

test("E1 golden: cross-run byte-equal (repeat N times)", () => {
  const first = runFixedWorld().hash;
  for (let r = 0; r < 5; r++) {
    assert.equal(runFixedWorld().hash, first, `run ${r} must be byte-equal`);
  }
});

test("E1 golden: different seed → different world hash", () => {
  const a = runFixedWorld("JH-GOLDEN-E1").hash;
  const b = runFixedWorld("JH-GOLDEN-OTHER").hash;
  assert.notEqual(a, b, "different seed must produce different hash");
});

test("E1 golden: stub world emits placeholder entities (ENTRANCE + LOOT_GROUND)", () => {
  const { entityCount } = runFixedWorld();
  assert.ok(entityCount >= 5, "1 entrance + 4 loot tokens minimum");
  const world = createWorld({
    runId: "g",
    roomId: "room_resident_public",
    seed: "JH-GOLDEN-E1",
    phase: RoomPhase.OVERWORLD,
    lootTokens: 4,
  });
  const kinds = world.snapshot().entities.map((e) => e.kind);
  assert.ok(kinds.includes(EntityKind.ENTRANCE), "must contain an ENTRANCE entity");
  assert.ok(kinds.includes(EntityKind.LOOT_GROUND), "must contain LOOT_GROUND tokens");
});
