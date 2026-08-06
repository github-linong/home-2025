/**
 * gateway.ts — WebSocket 网关 / 鉴权 / 双平面传输（E1.S1.2 / S1.6 / C5）
 *
 * 复用参照（接线层对齐 poker gateway.js）：
 *   apps/poker-realtime/src/ws/gateway.js
 *   - WebSocketServer + verifyWithApi2 鉴权、早期消息缓冲、ping/pong 心跳、
 *     dispatch 分发、重连握手（validateReconnect + roomSnapshot + 全量快照）。
 *
 * dungeon 差异：
 *   - 控制面 JSON / 数据面 Buffer（C5 双平面）。R1：真正的 state-diff 二进制 delta
 *     实现推迟——数据面当前为 JSON→Buffer 的「占位二进制」（见 connection-registry）。
 *     TODO(R1): 在 E1.S1.2 后续用紧凑二进制 diff 替换 broadcastToRoom 的 Buffer 负载。
 *   - 心跳覆盖 C2：pongTimeoutMs=5000 / pingIntervalMs=1000（来自 config，已显式覆盖）。
 *   - 业务分派拆到 protocol.ts（纯函数），本文件只做 ws 接线 + 落广播。
 */

import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import { config } from "./config.ts";
import { verifyWithApi2 } from "./auth.ts";
import {
  setRoomChangeListener,
  sweepIdleEmptyRooms,
  getRoom,
  markDisconnected,
  roomSnapshot,
} from "./room-service.ts";
import {
  registerConnection,
  removeConnection,
  setRoom,
  broadcastToRoom,
  sendToConn,
  type Conn,
} from "./connection-registry.ts";
import { dispatch } from "./protocol.ts";
import type { RunManager } from "./run-manager.ts";
import type { InputCmd } from "../../../packages/sim-core/src/types.ts";

let connCounter = 0;

export interface GatewayDeps {
  runManager: RunManager;
  verify?: typeof verifyWithApi2;
  path?: string;
}

export function createGateway(server: Server, deps: GatewayDeps): WebSocketServer {
  const verify = deps.verify ?? verifyWithApi2;
  const wss = new WebSocketServer({
    server,
    path: deps.path ?? "/ws/dungeon",
    maxPayload: config.maxMessageBytes,
  });

  // 房间 presence 变化 → 控制面广播 room.snapshot。
  setRoomChangeListener((room) => {
    broadcastToRoom(room.roomId, roomSnapshot(room), { binary: false });
  });

  // 空好友房 GC（RESIDENT 在 room-service.sweepIdleEmptyRooms 内排除，见 S1.5）。
  const idleSweeper = setInterval(() => {
    sweepIdleEmptyRooms();
  }, Math.min(60_000, Math.max(5_000, Math.floor(config.roomIdleTtlMs / 6))));
  idleSweeper.unref?.();

  wss.on("error", () => {
    /* 防止单连接错误拖垮进程 */
  });

  wss.on("connection", async (ws: WebSocket, req) => {
    // 单连接错误兜底（避免未监听的 'error' 抛成 uncaught）。
    ws.on("error", () => {});

    const cookie = req.headers.cookie ?? "";
    let devUserId: string | null = null;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      devUserId = url.searchParams.get("devUserId");
    } catch {
      /* ignore */
    }

    // 早期消息缓冲：浏览器 onopen 即发 room.create，等鉴权完成前先缓存。
    const pendingRaw: Buffer[] = [];
    let authed = false;

    const earlyHandler = (raw: Buffer) => {
      if (!authed) pendingRaw.push(raw);
    };
    ws.on("message", earlyHandler);

    const verified = await verify(cookie, { devUserId });
    if (!verified) {
      try {
        ws.send(
          JSON.stringify({
            type: "game.error",
            error: { code: "AUTH_REQUIRED", message: "Please log in", retryable: false },
          }),
        );
        ws.close(4401, "AUTH_REQUIRED");
      } catch {
        /* ignore */
      }
      return;
    }

    // ---- 鉴权通过：注册连接 ----
    const connId = `conn_${connCounter++}`;
    const conn: Conn = {
      connId,
      userId: verified.userId,
      roomId: null,
      send(payload: string | Uint8Array, _opts?: { binary?: boolean }) {
        if (ws.readyState !== 1) return;
        try {
          // payload 已由 connection-registry 序列化（控制面 string / 数据面 Buffer）。
          ws.send(payload);
        } catch {
          /* ignore */
        }
      },
      close(code?: number, reason?: string) {
        try {
          ws.close(code, reason);
        } catch {
          /* ignore */
        }
      },
    };
    registerConnection(conn);

    // ping/pong 心跳（C2 覆盖：pongTimeout 5s / pingInterval 1s）。
    let lastPong = Date.now();
    const pingTimer = setInterval(() => {
      if (Date.now() - lastPong > config.pongTimeoutMs) {
        const room = conn.roomId ? getRoom(conn.roomId) : null;
        if (room) markDisconnected(room, verified.userId);
        try {
          ws.close(4000, "ping_timeout");
        } catch {
          /* ignore */
        }
        clearInterval(pingTimer);
      } else {
        try {
          ws.ping();
        } catch {
          /* ignore */
        }
      }
    }, config.pingIntervalMs);
    pingTimer.unref?.();
    ws.on("pong", () => {
      lastPong = Date.now();
    });

    ws.removeListener("message", earlyHandler);
    ws.on("message", (raw: Buffer) => {
      void handleRaw(conn, raw, deps.runManager);
    });

    ws.on("close", () => {
      clearInterval(pingTimer);
      const room = conn.roomId ? getRoom(conn.roomId) : null;
      if (room) markDisconnected(room, verified.userId);
      removeConnection(connId);
    });

    authed = true;
    sendToConn(connId, {
      type: "session.ready",
      userId: verified.userId,
      serverTime: Date.now(),
    });

    // 回放早期缓冲消息。
    for (const raw of pendingRaw) {
      void handleRaw(conn, raw, deps.runManager);
    }
  });

  return wss;
}

async function handleRaw(conn: Conn, raw: Buffer, runManager: RunManager): Promise<void> {
  let msg: { type: string; requestId?: string; payload?: Record<string, unknown> };
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }

  // 低延迟心跳：在分派前直接回 pong（不进 room 逻辑）。
  if (msg.type === "session.ping") {
    sendToConn(conn.connId, {
      type: "session.pong",
      requestId: msg.requestId,
      serverTime: Date.now(),
    });
    return;
  }

  // E4 数据面输入摄取（C6 纪律B：与房间控制分派解耦）。
  // InputCmd 经 connId→playerId 路由到 world 的 PerPlayerInputQueue；C11 seq 单调在队列内强制。
  // 注：入站数据面当前为 JSON（R1 二进制 delta 推迟）；R1 后续将迁移为真正二进制通道。
  if (msg.type === "input.cmd") {
    routeInput(conn, msg, runManager);
    return;
  }

  const result = dispatch({ userId: conn.userId, connId: conn.connId, runManager }, msg);
  if (result.reply !== undefined) sendToConn(conn.connId, result.reply);
  if (result.broadcasts) {
    for (const b of result.broadcasts) {
      if (b.kind === "room") broadcastToRoom(b.roomId, b.message, { binary: b.binary });
      else sendToConn(b.connId, b.message);
    }
  }
  if (result.roomId !== undefined) setRoom(conn.connId, result.roomId);
}

/**
 * E4 数据面输入摄取：connId→playerId 路由。
 * 从 conn 归属房间解析该用户座位（seatIndex=playerId=实体 ownerId），再推入 world 队列。
 * 若连接尚未归属房间 / 不在座，则静默丢弃（输入无效）。C11 seq 单调由 PerPlayerInputQueue 强制。
 */
function routeInput(
  conn: Conn,
  msg: { payload?: Record<string, unknown> },
  runManager: RunManager,
): void {
  const roomId = conn.roomId;
  if (!roomId) return;
  const cmd = msg.payload?.cmd as InputCmd | undefined;
  if (!cmd || typeof cmd.seq !== "number") return;
  const room = getRoom(roomId);
  const seat = room?.seats.find((s) => s.userId === conn.userId);
  if (!seat) return;

  // E5 战斗意图路由（C11 / D13）：数据面 InputCmd 统一经 enqueueInput 入 world 队列
  // （C6 纪律B），**不引入新的网络 schema**。ATTACK/DODGE/SKILL 由 InputCmd.action 携带，
  // target/param 连同 cmd 一并下发；world.step 据此路由到 ⑦ combat.resolveDamage 做服务端
  // 权威结算（C11：仅 targetId/skillId 来自客户端，伤害由 ⑦ 计算）。其余动作（MOVE/SIGNAL）
  // 同样走此路径，由 world 按 action 分发。
  runManager.enqueueInput(roomId, seat.seatIndex, cmd);
}
