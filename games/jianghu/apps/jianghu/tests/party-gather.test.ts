/**
 * party-gather.test.ts — E13 多人同本：入口集合缓冲 + 多成员副本
 * ===========================================================================
 * 覆盖（无真实 socket，fake Conn 注入 connection-registry）：
 *   ① 单人 enter → waiting（集合窗口内）；窗口到期 sweep → 自动锁定开本（单人可玩）；
 *   ② A enter → waiting；B（同入口）enter → join 同实例（members=2、world 有 2 玩家、
 *      B 连接 roomId=instance）；锁定后 C enter → 拒绝（INSTANCE_LOCKED / C-Dgn-2）；
 *   ③ 等待中 B 取消（dungeon.exit）→ members 回 1；A 仍可玩（实例世界可推进）；
 *   ④ 副本广播含 A+B 实体；RESIDENT 广播不含 A/B（C-Net-1 双向零泄漏，多玩家扩展）；
 *   ⑤ A、B 各自 exit → 都回 RESIDENT 安全区；
 *   ⑥ 确定性：同入口 + 同触发者 + 同 serverTick ⇒ 同 seed ⇒ 同实例初始布局（D9）。
 *
 * 语义说明（E13 与 playtest golden 兼容的工程裁定）：
 *   - 实例房间**自创建即 locked=true**（room-service 既有语义 + playtest `instRoom.locked`
 *     断言）；「等待中未锁定可加入」由 run-manager 的 waiting 状态表达 —— 测试用
 *     `isInstanceWaiting(roomId)` 断言 waiting/locked，room.locked 保持 true。
 *   - 集合窗口用 RESIDENT world tick 计时（D9）；测试以 `sweepWaitingInstances(nowTick)`
 *     注入确定 tick 驱动锁定，不依赖真实 5s 流逝。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  bootResidentRun,
  enterInstance,
  exitInstance,
  isInstanceRunning,
  isInstanceWaiting,
  sweepWaitingInstances,
  getWorld,
} from "../src/run-manager.ts";
import {
  registerConnection,
  removeConnection,
  setRoom,
  type Conn,
} from "../src/connection-registry.ts";
import { getInstanceRoom, joinInstance, RESIDENT_ROOM_ID } from "../src/room-service.ts";
import { dispatch } from "../src/protocol.ts";
import { RESPAWN_POS, TILE } from "../sim-core/src/constants.ts";
import { decodeSnapshot } from "../src/protocol-binary.ts";

/** fake Conn：记录控制面 JSON + 数据面二进制（复用 connection-registry.test 模式）。 */
function fakeConn(userId: string): { conn: Conn; sent: { type: string }[]; binarySent: Uint8Array[] } {
  const sent: { type: string }[] = [];
  const binarySent: Uint8Array[] = [];
  const conn: Conn = {
    connId: "",
    userId,
    roomId: null,
    send(payload: string | Uint8Array, opts?: { binary?: boolean }) {
      if (opts?.binary) binarySent.push(payload as Uint8Array);
      else sent.push(JSON.parse(payload as string) as { type: string });
    },
  };
  return { conn, sent, binarySent };
}

/** dispatch 控制面回复（显式 type + 索引签名，C4 形状路由）。 */
type Reply = { type: string; [key: string]: unknown };
function replyOf(r: { reply?: unknown }): Reply | undefined {
  return r.reply as Reply | undefined;
}

// ------------------------------------------------------------------
// ① 单人 enter → waiting；窗口到期自动锁定（单人可玩）
// ------------------------------------------------------------------

test("party-gather ①: single enter → waiting; window sweep auto-locks (solo playable)", () => {
  bootResidentRun();
  // E13：每测试用独立 entranceId（同入口锁定实例拒绝新进入；测试文件内共享进程状态）。
  const res = enterInstance(200, [{ seatId: 1, userId: "u-solo" }], { lifetimeMs: 10 ** 12 });
  assert.equal(res.ok, true);
  assert.equal(res.joined, false, "create (not join)");
  const instId = res.instanceRoomId!;

  // 等待窗口内：实例在跑 + waiting（可加入）。
  assert.equal(isInstanceRunning(instId), true);
  assert.equal(isInstanceWaiting(instId), true, "in gather window (waiting, not yet locked)");
  const world = getWorld(instId)!;
  assert.ok(world.actors().some((a) => a.ownerId === 1), "solo player in instance world (playable)");

  // 窗口到期 → 自动锁定开本（D9 tick 计时；测试注入确定 nowTick）。
  sweepWaitingInstances(1e9);
  assert.equal(isInstanceWaiting(instId), false, "window over → locked/active");
  assert.equal(isInstanceRunning(instId), true, "still running (solo instance opened)");

  // 锁定后成员冻结：room-service joinInstance 拒绝（C-Dgn-2）。
  assert.equal(joinInstance(instId, "u-late").ok, false, "locked instance rejects join (C-Dgn-2)");
});

// ------------------------------------------------------------------
// ② A waiting → B 加入同实例；锁定后 C 被拒（INSTANCE_LOCKED / C-Dgn-2）
// ------------------------------------------------------------------

test("party-gather ②: A waiting → B joins same instance; after lock C rejected (C-Dgn-2)", () => {
  bootResidentRun();
  const a = enterInstance(201, [{ seatId: 1, userId: "u-pa" }], { lifetimeMs: 10 ** 12 });
  assert.equal(a.ok, true);
  assert.equal(isInstanceWaiting(a.instanceRoomId!), true, "A's instance waiting");

  // B 经协议路径进入（dungeon.enter）→ 加入同一 waiting 实例。
  const fcB = fakeConn("u-pb");
  registerConnection(fcB.conn);
  // E16：入口坐标校验 → B 需在主世界入口旁（seat 2 提前放置，距离 ≤ 72px）。
  const rwB = getWorld(RESIDENT_ROOM_ID)!;
  rwB.removePlayer(2);
  rwB.addPlayer(2, "u-pb", { x: 20 * TILE, y: 15 * TILE + 24 });
  const bRes = dispatch(
    { userId: "u-pb", connId: fcB.conn.connId, seatId: 2, roomId: RESIDENT_ROOM_ID },
    { type: "dungeon.enter", requestId: "b1", payload: { entranceId: 201 } },
  );
  assert.equal(replyOf(bRes)?.type, "dungeon.enter.ok", "B enter acknowledged");
  assert.equal(bRes.roomId, a.instanceRoomId, "B switched to same instance room");
  assert.equal(replyOf(bRes)?.joined, true, "B joined existing waiting instance");
  assert.equal(replyOf(bRes)?.memberCount, 2, "memberCount=2");
  setRoom(fcB.conn.connId, bRes.roomId as string);
  assert.equal(fcB.conn.roomId, a.instanceRoomId, "B connection in instance domain (C-Net-2)");

  // 同实例：members=2、world 有 2 玩家实体。
  const room = getInstanceRoom(a.instanceRoomId!)!;
  assert.equal(room.members.size, 2, "members=2");
  const world = getWorld(a.instanceRoomId!)!;
  const owners = world.actors().filter((x) => x.ownerId !== undefined).map((x) => x.ownerId);
  assert.ok(owners.includes(1) && owners.includes(2), "instance world has both player actors");

  // 窗口到期 → 锁定；C 同入口进入 → 拒绝（INSTANCE_LOCKED，C-Dgn-2）。
  sweepWaitingInstances(1e9);
  assert.equal(isInstanceWaiting(a.instanceRoomId!), false, "locked after window");
  const c = enterInstance(201, [{ seatId: 3, userId: "u-pc" }], { lifetimeMs: 10 ** 12 });
  assert.equal(c.ok, false, "locked instance rejects new entry");
  assert.equal(c.reason, "INSTANCE_LOCKED", "C-Dgn-2: locked members frozen");

  removeConnection(fcB.conn.connId);
});

// ------------------------------------------------------------------
// ③ 等待中 B 取消（exit）→ members 回 1；A 仍可玩
// ------------------------------------------------------------------

test("party-gather ③: waiting member B cancels (exit) → members back to 1; A still playable", () => {
  bootResidentRun();
  const a = enterInstance(202, [{ seatId: 1, userId: "u-pa3" }], { lifetimeMs: 10 ** 12 });
  const b = enterInstance(202, [{ seatId: 2, userId: "u-pb3" }], { lifetimeMs: 10 ** 12 });
  assert.equal(a.ok && b.ok, true);
  assert.equal(b.joined, true, "B joined A's waiting instance");
  const instId = a.instanceRoomId!;
  assert.equal(getInstanceRoom(instId)!.members.size, 2, "2 members before cancel");

  // B 经协议出本（dungeon.exit）→ 等待中取消：members 回 1，B 回 RESIDENT 域。
  const fcB = fakeConn("u-pb3");
  registerConnection(fcB.conn);
  setRoom(fcB.conn.connId, instId);
  const xRes = dispatch(
    { userId: "u-pb3", connId: fcB.conn.connId, seatId: 2, roomId: instId },
    { type: "dungeon.exit", requestId: "x1" },
  );
  assert.equal(replyOf(xRes)?.type, "dungeon.exit.ok", "B exit acknowledged");
  assert.equal(xRes.roomId, RESIDENT_ROOM_ID, "B switched back to resident");
  setRoom(fcB.conn.connId, RESIDENT_ROOM_ID);
  assert.equal(fcB.conn.roomId, RESIDENT_ROOM_ID, "B in resident domain (C-Net-2)");

  assert.equal(getInstanceRoom(instId)!.members.size, 1, "members back to 1");
  const world = getWorld(instId)!;
  const owners = world.actors().filter((x) => x.ownerId !== undefined).map((x) => x.ownerId);
  assert.ok(owners.includes(1) && !owners.includes(2), "B removed from instance world");
  assert.equal(isInstanceRunning(instId), true, "instance still running for A");

  // A 仍可玩：实例世界可继续推进（run 存活）。
  const tick0 = world.tick;
  world.step();
  assert.equal(world.tick, tick0 + 1, "instance world still steps (A playable)");

  removeConnection(fcB.conn.connId);
});

// ------------------------------------------------------------------
// ④ 副本广播含 A+B 实体（C-Net-1 多玩家扩展）
// ------------------------------------------------------------------

test("party-gather ④: instance broadcast carries A+B entities; resident carries neither (C-Net-1)", async () => {
  bootResidentRun();
  const a = enterInstance(203, [{ seatId: 1, userId: "u-pa4" }], { lifetimeMs: 10 ** 12 });
  const b = enterInstance(203, [{ seatId: 2, userId: "u-pb4" }], { lifetimeMs: 10 ** 12 });
  assert.equal(a.ok && b.ok && b.joined, true);
  const instId = a.instanceRoomId!;

  const fcRes = fakeConn("u-res4");
  const fcA = fakeConn("u-pa4");
  const fcB = fakeConn("u-pb4");
  registerConnection(fcRes.conn);
  registerConnection(fcA.conn);
  registerConnection(fcB.conn);
  setRoom(fcRes.conn.connId, RESIDENT_ROOM_ID);
  setRoom(fcA.conn.connId, instId);
  setRoom(fcB.conn.connId, instId);

  await new Promise((r) => setTimeout(r, 300)); // 等若干 12Hz tick 广播

  assert.ok(fcRes.binarySent.length > 0, "resident member receives resident frames");
  assert.ok(fcA.binarySent.length > 0 && fcB.binarySent.length > 0, "instance members receive instance frames");

  // 副本帧：A + B 玩家实体都在；RESIDENT 帧：A/B 都不在（C-Net-1 双向零泄漏，多玩家扩展）。
  const ownersIn = new Set<number>();
  const ownersRes = new Set<number>();
  for (const buf of fcA.binarySent) for (const e of decodeSnapshot(Buffer.from(buf)).entities) if (e.ownerId !== undefined) ownersIn.add(e.ownerId);
  for (const buf of fcB.binarySent) for (const e of decodeSnapshot(Buffer.from(buf)).entities) if (e.ownerId !== undefined) ownersIn.add(e.ownerId);
  for (const buf of fcRes.binarySent) for (const e of decodeSnapshot(Buffer.from(buf)).entities) if (e.ownerId !== undefined) ownersRes.add(e.ownerId);
  assert.ok(ownersIn.has(1) && ownersIn.has(2), "instance frames carry A+B entities");
  assert.ok(!ownersRes.has(1) && !ownersRes.has(2), "resident frames carry neither A nor B");

  removeConnection(fcRes.conn.connId);
  removeConnection(fcA.conn.connId);
  removeConnection(fcB.conn.connId);
});

// ------------------------------------------------------------------
// ⑤ A、B 各自 exit → 都回 RESIDENT 安全区
// ------------------------------------------------------------------

test("party-gather ⑤: A and B each exit → both return to resident safe zone", () => {
  bootResidentRun();
  const a = enterInstance(204, [{ seatId: 1, userId: "u-pa5" }], { lifetimeMs: 10 ** 12 });
  const b = enterInstance(204, [{ seatId: 2, userId: "u-pb5" }], { lifetimeMs: 10 ** 12 });
  assert.equal(a.ok && b.ok && b.joined, true);
  const instId = a.instanceRoomId!;

  // A 出本（等待中取消）→ 回 RESIDENT 安全区；B 仍留本。
  const r1 = exitInstance(instId, { seatId: 1 });
  assert.equal(r1.ok, true);
  assert.equal(isInstanceRunning(instId), true, "instance still running with B");
  let pA = getWorld(RESIDENT_ROOM_ID)!.actors().find((x) => x.ownerId === 1);
  assert.ok(pA, "A back in resident world");
  assert.equal(Math.round(pA!.x), RESPAWN_POS.x, "A at safe respawn x");
  assert.equal(Math.round(pA!.y), RESPAWN_POS.y, "A at safe respawn y");

  // B 出本（等待中最后成员）→ waiting 销毁；B 回 RESIDENT 安全区。
  const r2 = exitInstance(instId, { seatId: 2 });
  assert.equal(r2.ok, true);
  assert.equal(isInstanceRunning(instId), false, "instance dissolved after last member leaves");
  assert.equal(getInstanceRoom(instId), null, "instance room destroyed");
  const pB = getWorld(RESIDENT_ROOM_ID)!.actors().find((x) => x.ownerId === 2);
  assert.ok(pB, "B back in resident world");
  assert.equal(Math.round(pB!.x), RESPAWN_POS.x, "B at safe respawn x");
  assert.equal(Math.round(pB!.y), RESPAWN_POS.y, "B at safe respawn y");
});

// ------------------------------------------------------------------
// ⑥ 确定性：同入口 + 同触发者 + 同 serverTick ⇒ 同 seed ⇒ 同实例布局（D9）
// ------------------------------------------------------------------

test("party-gather ⑥: same entrance + same trigger + same serverTick ⇒ same seed ⇒ same layout (D9)", () => {
  bootResidentRun();
  const rw = getWorld(RESIDENT_ROOM_ID)!;

  // ① 创建实例 1（触发者 u-det；loopTick=0 同步切片）。
  const a = enterInstance(205, [{ seatId: 1, userId: "u-det" }], { lifetimeMs: 10 ** 12 });
  assert.equal(a.ok, true);
  const w1 = getWorld(a.instanceRoomId!)!;
  const seed1 = w1.seed;
  const layout1 = w1.snapshot().entities.map((e) => ({ k: e.kind, p: e.pos, hp: e.hp, maxHp: e.maxHp }));

  // ② 解散（触发者退出 → waiting 解散，入口释放）。
  exitInstance(a.instanceRoomId!, { seatId: 1 });

  // ③ 推进冷却（121 tick；D9 确定性：窗口/冷却均用 RESIDENT world tick，loopTick 仍为 0）。
  for (let i = 0; i < 121; i++) rw.step();

  // ④ 同入口 + 同触发者 + 同 loopTick=0 → 同 seed。
  const b = enterInstance(205, [{ seatId: 1, userId: "u-det" }], { lifetimeMs: 10 ** 12 });
  assert.equal(b.ok, true, "re-create allowed after cooldown");
  const w2 = getWorld(b.instanceRoomId!)!;
  assert.equal(w2.seed, seed1, "same seed (same trigger + serverTick)");

  // 同 seed ⇒ 同初始布局（敌人/BOSS/入口位置与 hp 字节级一致，D9）。
  const layout2 = w2.snapshot().entities.map((e) => ({ k: e.kind, p: e.pos, hp: e.hp, maxHp: e.maxHp }));
  assert.equal(JSON.stringify(layout2), JSON.stringify(layout1), "same seed ⇒ identical initial layout (D9)");
});
