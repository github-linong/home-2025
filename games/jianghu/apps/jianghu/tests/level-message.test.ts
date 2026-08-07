/**
 * level-message.test.ts — E9 升级数据通道（控制面 character.level）
 * ===========================================================================
 * 覆盖（镜像 inventory-message.test.ts 模式）：
 *   - 升级后（applyLevelUpToCharacter，run-manager.onTick 升级路径调用）→ 落库
 *     （Character.level/exp）+ 向该 seat 连接推送 `character.level`（fake conn spy）；
 *   - `character.level.get`（登录）→ 返回持久化等级/经验（同一消息格式 + xpNext）；
 *   - `character.level.get`（游客）→ null（忽略不回复，C-Per-1 零持久写不涉及）；
 *   - 游客升级推送 → 不推送 + 零落库（C-Per-1）。
 *
 * 无真实 ws / DB；MemoryCharacterStore in-memory fake + connection-registry fake Conn。
 * world 侧升级事件（LevelUpEvent 形状/连升/归属）由 sim-core/tests/unit/level.test.ts 覆盖，
 * 本文件聚焦「事件 → 落库 + 推送 + get 拉取」的编排层接线。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  setActiveCharacterService,
  applyLevelUpToCharacter,
  pushLevelToSeat,
} from "../src/run-manager.ts";
import {
  CharacterService,
  MemoryCharacterStore,
  createNewCharacter,
} from "../src/persistence.ts";
import {
  registerConnection,
  removeConnection,
  type Conn,
} from "../src/connection-registry.ts";
import { setProtocolCharacterService, resolveLevelGet, type ProtocolContext } from "../src/protocol.ts";
import { xpForLevel } from "../sim-core/src/constants.ts"; // C7 单一来源

/** fake Conn：记录控制面 JSON（复用既有测试模式）。 */
function fakeConn(userId: string): { conn: Conn; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const conn: Conn = {
    connId: "",
    userId,
    roomId: null,
    send(payload: string | Uint8Array, opts?: { binary?: boolean }) {
      if (opts?.binary) return; // 数据面二进制不参与本测试
      sent.push(JSON.parse(payload as string) as Record<string, unknown>);
    },
  };
  return { conn, sent };
}

// ------------------------------------------------------------------
// ① 升级后 → 落库 + 推送 character.level（applyLevelUpToCharacter = onTick 升级路径）
// ------------------------------------------------------------------

test("E9: login level-up persists (level/exp) and pushes character.level to seat connection", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "u-lvl-push", guest: false });
    // 连接 spy：升级落库成功后，控制面应收到 character.level。
    const fc = fakeConn("u-lvl-push");
    registerConnection(fc.conn);

    // 模拟 world 升级事件（L1 +80xp → L2 xp30；LevelUpEvent 由 world 产出，本文件聚焦接线）。
    await applyLevelUpToCharacter(svc, "u-lvl-push", 2, 30, xpForLevel(2));

    const push = fc.sent.find((m) => (m as { type?: string }).type === "character.level") as {
      type: string;
      level: number;
      xp: number;
      xpNext: number;
    };
    assert.ok(push, "升级后应推送 character.level");
    assert.deepEqual(
      { level: push.level, xp: push.xp, xpNext: push.xpNext },
      { level: 2, xp: 30, xpNext: xpForLevel(2) },
      "推送携带 level/xp/xpNext（xpNext = xpForLevel(2)=141，C7 单一来源）",
    );

    // 落库确实更新（升级落库，C-Per 闭环）。
    const snap = await svc.loadOrCreate("u-lvl-push");
    assert.equal(snap.snapshot.character.level, 2, "Character.level 已落库");
    assert.equal(snap.snapshot.character.exp, 30, "Character.exp 已落库（剩余经验）");
  } finally {
    removeConnection("conn_" + 0); // 防御清理（fake conn 无真实注册 id 则忽略）
  }
});

// ------------------------------------------------------------------
// ② character.level.get（登录）→ 返回持久化等级/经验
// ------------------------------------------------------------------

test("E9: character.level.get (login) returns persisted level/xp/xpNext", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "u-lvl-get", guest: false });
    // 预置角色：L3 / exp49（上次升级剩余经验）。
    const base = createNewCharacter("u-lvl-get");
    await svc.save("u-lvl-get", {
      character: { ...base.character, level: 3, exp: 49 },
      inventory: base.inventory,
    });

    const ctx: ProtocolContext = { userId: "u-lvl-get", connId: "c-get", seatId, roomId: null };
    const reply = await resolveLevelGet(ctx, { type: "character.level.get", requestId: "g1" });

    assert.ok(reply, "登录玩家应返回 character.level");
    assert.equal(reply.type, "character.level");
    assert.equal(reply.requestId, "g1", "回复携带 requestId 供客户端关联");
    assert.deepEqual(
      { level: reply.level, xp: reply.xp, xpNext: reply.xpNext },
      { level: 3, xp: 49, xpNext: xpForLevel(3) },
      "返回持久化 level/xp + xpNext（= xpForLevel(3)=259）",
    );
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ③ character.level.get（游客）→ null（忽略，C-Per-1 零持久写）
// ------------------------------------------------------------------

test("E9: character.level.get (guest) is ignored (null reply, C-Per-1)", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setProtocolCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "guest_lvl", guest: true });
    const ctx: ProtocolContext = { userId: "guest_lvl", connId: "c-guest", seatId, roomId: null };
    const reply = await resolveLevelGet(ctx, { type: "character.level.get", requestId: "g2" });

    assert.equal(reply, null, "游客 character.level.get → null（网关不回复）");
    // 游客零持久写：store 无任何记录。
    assert.equal(store.saveCount, 0, "guest get 不触发 save");
    assert.equal(store.loadCount, 0, "guest get 不触发 load（不 loadOrCreate 游客）");
    assert.equal(await store.exists("guest_lvl"), false, "无游客持久化记录");
  } finally {
    // 无 run 循环。
  }
});

// ------------------------------------------------------------------
// ④ 游客升级推送 → 不推送 + 零落库（C-Per-1）
// ------------------------------------------------------------------

test("E9: guest level-up push is dropped (C-Per-1: no message, no persistence)", async () => {
  const store = new MemoryCharacterStore();
  const svc = new CharacterService({ store });
  setActiveCharacterService(svc);
  try {
    const { seatId } = await svc.begin({ userId: "guest_lvl2", guest: true });
    const fc = fakeConn("guest_lvl2");
    registerConnection(fc.conn);

    pushLevelToSeat(seatId, 2, 30, xpForLevel(2));
    assert.equal(
      fc.sent.filter((m) => (m as { type?: string }).type === "character.level").length,
      0,
      "游客升级不推送 character.level（C-Per-1）",
    );
    assert.equal(store.saveCount, 0, "游客零落库");
    assert.equal(await store.exists("guest_lvl2"), false, "无游客持久化记录");
  } finally {
    // 无 run 循环。
  }
});
