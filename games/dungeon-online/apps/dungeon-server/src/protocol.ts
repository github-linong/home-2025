/**
 * protocol.ts — 纯消息分派（E1.S1.2 / S1.6，脱离 ws 可单测）
 *
 * 复用参照（语义对齐 poker gateway.js handleMessage 的 dispatch 分层）：
 *   apps/poker-realtime/src/ws/gateway.js
 * 但本实现把「业务分派」从「ws 接线」剥离为纯函数，便于用 fake Conn 单测，
 *   无需起真实 ws 服务（R2：本 Sprint Godot 客户端未启动，用合成输入/假连接验证）。
 *
 * 分派结果只描述「要发的回复 + 要广播的消息」，由 gateway 落到 connection-registry。
 * 房间状态变更直接调用 room-service（模块级 store）。
 */

import {
  createRoom,
  getRoomByCode,
  getRoom,
  confirmSeat,
  lockSeat,
  transferOwner,
  validateReconnect,
  leaveRoom,
  roomSnapshot,
} from "./room-service.ts";
import { PLAYER_CLASSES, type PlayerClass } from "../../../packages/sim-core/src/types.ts";
import { generateId } from "./core/ids.ts";
import type { RunManager } from "./run-manager.ts";
import type { InputCmd } from "../../../packages/sim-core/src/types.ts";

export interface ProtocolContext {
  readonly userId: string;
  readonly connId: string;
  readonly runManager: RunManager;
}

export type BroadcastInstr =
  | { kind: "room"; roomId: string; message: unknown; binary?: boolean }
  | { kind: "conn"; connId: string; message: unknown };

export interface DispatchResult {
  reply?: unknown;
  broadcasts?: BroadcastInstr[];
  /** 本连接应归属的 roomId（gateway 调 setRoom）。 */
  roomId?: string | null;
}

function err(requestId: string | undefined, code: string, message: string) {
  return { type: "game.error", requestId, error: { code, message } };
}

function findEmptySeat(roomId: string): number {
  const room = getRoom(roomId);
  if (!room) return -1;
  return room.seats.findIndex((s) => s.status === "empty");
}

export function dispatch(
  ctx: ProtocolContext,
  msg: { type: string; requestId?: string; payload?: Record<string, unknown> },
): DispatchResult {
  const { type, requestId, payload = {} } = msg;
  const broadcasts: BroadcastInstr[] = [];

  switch (type) {
    case "room.create": {
      const displayName = String(payload.displayName ?? ctx.userId);
      const resident = Boolean(payload.resident);
      const room = createRoom(ctx.userId, displayName, { resident });
      lockSeat(room, ctx.userId, 0);
      const { reconnectToken } = confirmSeat(room, ctx.userId, displayName, 0);
      broadcasts.push({ kind: "room", roomId: room.roomId, message: roomSnapshot(room) });
      return {
        reply: {
          type: "room.create.ok",
          requestId,
          roomId: room.roomId,
          roomCode: room.roomCode,
          seatIndex: 0,
          reconnectToken,
        },
        broadcasts,
        roomId: room.roomId,
      };
    }

    case "room.join": {
      const roomCode = String(payload.roomCode ?? "");
      const displayName = String(payload.displayName ?? ctx.userId);
      const room = getRoomByCode(roomCode);
      if (!room) return { reply: err(requestId, "ROOM_NOT_FOUND", "invalid code") };
      let seatIndex = payload.seatIndex as number | undefined;
      if (seatIndex == null || seatIndex < 0) seatIndex = findEmptySeat(room.roomId);
      if (seatIndex < 0) return { reply: err(requestId, "ROOM_FULL", "no seat") };
      try {
        lockSeat(room, ctx.userId, seatIndex);
        const { reconnectToken } = confirmSeat(room, ctx.userId, displayName, seatIndex);
        broadcasts.push({ kind: "room", roomId: room.roomId, message: roomSnapshot(room) });
        return {
          reply: {
            type: "room.join.ok",
            requestId,
            roomId: room.roomId,
            seatIndex,
            reconnectToken,
          },
          broadcasts,
          roomId: room.roomId,
        };
      } catch (e) {
        return { reply: err(requestId, "SEAT_TAKEN", (e as Error).message) };
      }
    }

    case "room.leave": {
      const roomId = String(payload.roomId ?? "");
      const room = getRoom(roomId);
      if (!room) return { reply: err(requestId, "NOT_IN_ROOM", "no room") };
      try {
        leaveRoom(room, ctx.userId);
        broadcasts.push({ kind: "room", roomId, message: roomSnapshot(room) });
        return { reply: { type: "room.leave.ok", requestId }, broadcasts, roomId: null };
      } catch (e) {
        return { reply: err(requestId, "NOT_IN_ROOM", (e as Error).message) };
      }
    }

    case "room.transferOwner": {
      const roomId = String(payload.roomId ?? "");
      const toUserId = String(payload.toUserId ?? "");
      const room = getRoom(roomId);
      if (!room) return { reply: err(requestId, "NOT_IN_ROOM", "no room") };
      try {
        const { ownerId } = transferOwner(room, ctx.userId, toUserId);
        broadcasts.push({ kind: "room", roomId, message: roomSnapshot(room) });
        return { reply: { type: "room.transferOwner.ok", requestId, ownerId }, broadcasts };
      } catch (e) {
        return { reply: err(requestId, "NOT_OWNER", (e as Error).message) };
      }
    }

    case "game.start": {
      const roomId = String(payload.roomId ?? "");
      const room = getRoom(roomId);
      if (!room) return { reply: err(requestId, "ROOM_NOT_FOUND", "no room") };
      if (room.ownerId !== ctx.userId) {
        return { reply: err(requestId, "NOT_OWNER", "only owner can start") };
      }
      if (ctx.runManager.isRunning(roomId)) {
        const snap = ctx.runManager.getSnapshot(roomId);
        return {
          reply: {
            type: "game.start.ok",
            requestId,
            runId: room.runId,
            seed: room.runSeed,
            alreadyStarted: true,
            tick: snap?.tick ?? 0,
          },
        };
      }
      const runId = generateId("run");
      const seed = generateId("seed");
      room.runId = runId;
      room.runSeed = seed;
      room.roomState = "active";
      const players = room.seats
        .filter((s) => s.status === "occupied" || s.status === "disconnected")
        .map((s) => ({
          seatId: s.seatIndex,
          userId: s.userId as string,
          classId: PLAYER_CLASSES[s.seatIndex % PLAYER_CLASSES.length] as PlayerClass,
        }));
      const snap = ctx.runManager.startRun(roomId, {
        runId,
        seed,
        biomeId: room.biomeId,
        players,
      });
      broadcasts.push({ kind: "room", roomId, message: roomSnapshot(room) });
      return {
        reply: {
          type: "game.start.ok",
          requestId,
          runId,
          seed,
          tick: snap.tick,
        },
        broadcasts,
      };
    }

    case "session.reconnect": {
      const roomId = String(payload.roomId ?? "");
      const seatIndex = Number(payload.seatIndex);
      const reconnectToken = String(payload.reconnectToken ?? "");
      const runId = payload.runId != null ? String(payload.runId) : null;
      const room = getRoom(roomId);
      if (!room) return { reply: err(requestId, "RUN_NOT_FOUND", "no room") };
      try {
        const { reconnectToken: newToken } = validateReconnect(
          room,
          ctx.userId,
          seatIndex,
          reconnectToken,
          runId,
        );
        broadcasts.push({ kind: "room", roomId, message: roomSnapshot(room) });
        const worldSnap = ctx.runManager.getSnapshot(roomId);
        if (worldSnap) {
          // S1.6：重连拉取全量 WorldSnapshot（数据面）；计时还原归位 E7（C10 部分）。
          broadcasts.push({ kind: "room", roomId, message: worldSnap, binary: true });
        }
        return {
          reply: {
            type: "session.reconnect.ok",
            requestId,
            roomId,
            runId: room.runId,
            reconnectToken: newToken,
            snapshotTick: worldSnap?.tick ?? 0,
          },
          broadcasts,
          roomId,
        };
      } catch (e) {
        return { reply: err(requestId, "RECONNECT_EXPIRED", (e as Error).message) };
      }
    }

    case "sync.request": {
      const roomId = String(payload.roomId ?? "");
      const worldSnap = ctx.runManager.getSnapshot(roomId);
      if (!worldSnap) {
        return { reply: err(requestId, "RUN_NOT_FOUND", "no active run") };
      }
      // 全量快照经数据面下发到本连接（C5 双平面：控制 reply + 数据 snapshot）。
      broadcasts.push({ kind: "conn", connId: ctx.connId, message: worldSnap });
      return {
        reply: { type: "sync.request.ok", requestId, tick: worldSnap.tick },
        broadcasts,
      };
    }

    default:
      return { reply: err(requestId, "INVALID_ACTION", `Unknown type: ${type}`) };
  }
}

// 仅类型引用（InputCmd 由 gateway 入队，本协议层不直接构造）。
export type { InputCmd };
