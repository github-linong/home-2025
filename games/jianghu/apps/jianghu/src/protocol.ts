/**
 * protocol.ts — 控制面纯消息分派（E1.S1.2 / S1.6，脱离 ws 可单测）
 * ===========================================================================
 * 复用参照（语义对齐 dungeon-online protocol.ts + poker gateway 的 dispatch 分层）：
 *   把「业务分派」从「ws 接线」剥离为纯函数，便于用 fake Conn 单测，无需起真实 ws 服务。
 *
 * 控制面（C4）：所有消息显式带 `"type"` 字段，分派按 type switch —— **禁止形状猜测路由**。
 * 数据面 InputCmd 不经本分派，由 gateway 直接路由到 run-manager（C6 纪律 B 解耦）。
 *
 * 分派结果只描述「要发的回复 + 要广播的消息」，由 gateway 落到 connection-registry。
 */

import {
  ensureResidentRoom,
  joinResident,
  createInstanceRoom,
  validateReconnect,
  getRoom,
  getInstanceRoom,
  roomSnapshot,
  RESIDENT_ROOM_ID,
} from "./room-service.ts";
import {
  startRun,
  getSnapshot,
  enterInstance,
  exitInstance,
  isInstanceRunning,
} from "./run-manager.ts";
import { RoomPhase } from "../sim-core/src/types.ts";
import { encodeSnapshot } from "./protocol-binary.ts";
import { generateId } from "./ids.ts";
import { config } from "./config.ts";

export interface ProtocolContext {
  readonly userId: string;
  readonly connId: string;
  /** 会话座位号（网关从 liveSessions 注入；进本/出本用）。 */
  readonly seatId?: number;
  /** 连接当前归属房间（网关注入；dungeon.enter 校验须在主世界，C-Net-1 域边界）。 */
  readonly roomId?: string | null;
}

export type BroadcastInstr =
  | { kind: "room"; roomId: string; message: unknown; binary?: boolean }
  | { kind: "conn"; connId: string; message: unknown; binary?: boolean };

export interface DispatchResult {
  reply?: unknown;
  broadcasts?: BroadcastInstr[];
  /** 本连接应归属的 roomId（gateway 调 setRoom）。 */
  roomId?: string | null;
}

function err(requestId: string | undefined, code: string, message: string) {
  return { type: "game.error", requestId, error: { code, message } };
}

export function dispatch(
  ctx: ProtocolContext,
  msg: { type: string; requestId?: string; payload?: Record<string, unknown> },
): DispatchResult {
  const { type, requestId, payload = {} } = msg;
  const broadcasts: BroadcastInstr[] = [];

  switch (type) {
    // 加入主世界 RESIDENT（任意加入，无房间码）。
    case "room.join": {
      const room = joinResident(ctx.userId);
      const member = room.members.get(ctx.userId)!;
      broadcasts.push({ kind: "room", roomId: room.roomId, message: roomSnapshot(room) });
      return {
        reply: {
          type: "room.join.ok",
          requestId,
          roomId: room.roomId,
          resident: room.resident,
          reconnectToken: member.reconnectToken,
        },
        broadcasts,
        roomId: room.roomId,
      };
    }

    // 创建副本 instance（E1 占位：创建即锁定成员 + 起 stub run；E5 起真实入口走 dungeon.enter）。
    case "room.create_instance": {
      const room = createInstanceRoom([ctx.userId]);
      const member = room.members.get(ctx.userId)!;
      startRun({
        runId: generateId("run"),
        roomId: room.roomId,
        seed: room.roomId, // E1 占位 seed（E5 改 instanceSeed 服务端权威）
        phase: RoomPhase.DUNGEON,
        lootTokens: 4,
      });
      broadcasts.push({ kind: "room", roomId: room.roomId, message: roomSnapshot(room) });
      return {
        reply: {
          type: "room.create_instance.ok",
          requestId,
          roomId: room.roomId,
          reconnectToken: member.reconnectToken,
        },
        broadcasts,
        roomId: room.roomId,
      };
    }

    // 进入副本实例（E5 · ADR-JH-ENG-03 §3）：仅允许在主世界 RESIDENT 触发（C-Net-1 域边界）。
    case "dungeon.enter": {
      if (ctx.roomId !== RESIDENT_ROOM_ID) {
        return { reply: err(requestId, "NOT_IN_RESIDENT", "dungeon.enter requires resident world") };
      }
      if (ctx.seatId === undefined) {
        return { reply: err(requestId, "NO_SEAT", "session not attached") };
      }
      const entranceId = Number(payload.entranceId ?? 0);
      // MVP 单人进本（成员锁定 = 触发者）；多人「集合缓冲取先到者」归 Phase-2（dungeon §⑧）。
      const res = enterInstance(entranceId, [{ seatId: ctx.seatId, userId: ctx.userId }]);
      if (!res.ok) {
        return { reply: err(requestId, res.reason ?? "ENTER_FAILED", "enter instance rejected") };
      }
      const instRoom = getInstanceRoom(res.instanceRoomId!);
      const member = instRoom?.members.get(ctx.userId);
      if (instRoom) broadcasts.push({ kind: "room", roomId: instRoom.roomId, message: roomSnapshot(instRoom) });
      return {
        reply: {
          type: "dungeon.enter.ok",
          requestId,
          roomId: res.instanceRoomId,
          // 副本内重连 token（C-Net-3/C10：寿命内回本）。
          reconnectToken: member?.reconnectToken,
        },
        broadcasts,
        roomId: res.instanceRoomId, // 网关 setRoom 原子切到 instance（C-Net-2）
      };
    }

    // 出本（E5）：停 instance run、成员回 RESIDENT 安全区、订阅切回主世界（C-Net-2）。
    case "dungeon.exit": {
      const roomId = ctx.roomId;
      if (!roomId || !isInstanceRunning(roomId)) {
        return { reply: err(requestId, "NOT_IN_INSTANCE", "dungeon.exit requires instance room") };
      }
      const res = exitInstance(roomId);
      if (!res.ok) {
        return { reply: err(requestId, res.reason ?? "EXIT_FAILED", "exit instance rejected") };
      }
      const resident = getRoom(RESIDENT_ROOM_ID);
      if (resident) broadcasts.push({ kind: "room", roomId: RESIDENT_ROOM_ID, message: roomSnapshot(resident) });
      return {
        reply: { type: "dungeon.exit.ok", requestId, roomId: RESIDENT_ROOM_ID },
        broadcasts,
        roomId: RESIDENT_ROOM_ID, // 网关 setRoom 原子切回主世界（C-Net-2）
      };
    }

    // 重连（chat 模型复用，C-Net-3）：寿命内回原副本；原房间已销毁（副本超时/解散）→ 回主世界（C10）。
    case "session.reconnect": {
      const roomId = String(payload.roomId ?? "");
      const reconnectToken = String(payload.reconnectToken ?? "");
      const room = getRoom(roomId);
      if (!room) {
        // 原副本已销毁 → 回主世界安全区（C-Net-3 / C10 重连无跳变）。
        const resident = joinResident(ctx.userId);
        const member = resident.members.get(ctx.userId)!;
        broadcasts.push({ kind: "room", roomId: resident.roomId, message: roomSnapshot(resident) });
        const snap = getSnapshot(resident.roomId);
        if (snap) {
          broadcasts.push({ kind: "conn", connId: ctx.connId, message: encodeSnapshot(snap), binary: true });
        }
        return {
          reply: {
            type: "session.reconnect.ok",
            requestId,
            roomId: resident.roomId,
            reconnectToken: member.reconnectToken,
            snapshotTick: snap?.tick ?? 0,
            fellBackToResident: true,
          },
          broadcasts,
          roomId: resident.roomId,
        };
      }
      try {
        const { reconnectToken: newToken } = validateReconnect(roomId, ctx.userId, reconnectToken);
        broadcasts.push({ kind: "room", roomId, message: roomSnapshot(room) });
        const snap = getSnapshot(roomId);
        if (snap) {
          // 数据面：全量快照经二进制通道下发到本连接（C5 双平面）。
          broadcasts.push({
            kind: "conn",
            connId: ctx.connId,
            message: encodeSnapshot(snap),
            binary: true,
          });
        }
        return {
          reply: {
            type: "session.reconnect.ok",
            requestId,
            roomId,
            reconnectToken: newToken,
            snapshotTick: snap?.tick ?? 0,
          },
          broadcasts,
          roomId,
        };
      } catch (e) {
        return { reply: err(requestId, "RECONNECT_EXPIRED", (e as Error).message) };
      }
    }

    // 拉取全量快照（数据面二进制，下发到本连接）。
    case "sync.request": {
      const roomId = String(payload.roomId ?? "");
      const snap = getSnapshot(roomId);
      if (!snap) return { reply: err(requestId, "RUN_NOT_FOUND", "no active run") };
      broadcasts.push({
        kind: "conn",
        connId: ctx.connId,
        message: encodeSnapshot(snap),
        binary: true,
      });
      return {
        reply: { type: "sync.request.ok", requestId, tick: snap.tick },
        broadcasts,
      };
    }

    default:
      return { reply: err(requestId, "INVALID_ACTION", `Unknown type: ${type}`) };
  }
}

// 确保 RESIDENT 房在协议层可用（server 启动已 ensure，此处防御）。
export function ensureBaseRooms(): void {
  ensureResidentRoom();
  void config;
}
