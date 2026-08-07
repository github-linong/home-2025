/**
 * gateway.ts — WebSocket 网关 / 鉴权 / 双平面传输（E1.S1.2 / S1.6 / C5）
 * ===========================================================================
 * 复用参照（接线层对齐 dungeon-online gateway + poker/chat 模型）：
 *   - WebSocketServer + verifyWithApi2 鉴权、早期消息缓冲、ping/pong 心跳、dispatch 分发、重连。
 *
 * jianghu 差异：
 *   - 控制面 JSON / 数据面 Buffer（C5 双平面，已由 protocol-binary 实现二进制帧）。
 *   - 心跳覆盖 C2：pongTimeoutMs=5000 / pingIntervalMs=1000（来自 config，已显式覆盖 wander/chat 45s/15s）。
 *   - 业务分派拆到 protocol.ts（纯函数），本文件只做 ws 接线 + 落广播。
 *   - 数据面 InputCmd 不经 dispatch，直接路由到 run-manager（C6 纪律 B 解耦）。
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
  enforceLastWins,
} from "./room-service.ts";
import {
  CharacterService,
  getDefaultCharacterService,
  type CharacterSnapshot,
} from "./persistence.ts";
import {
  registerConnection,
  removeConnection,
  setRoom,
  broadcastControl,
  sendToConn,
  type Conn,
} from "./connection-registry.ts";
import { dispatch, setProtocolCharacterService, setProtocolSnapshotSyncer, resolveInventoryGet, resolveLevelGet, resolveEquip, resolveUnequip } from "./protocol.ts";
import { enqueueInput, addPlayerToRoom, setSeatSnapshotSyncer, onSeatDisconnect } from "./run-manager.ts";
import { TICK_MS, TICK_RATE } from "../sim-core/src/constants.ts"; // C1 单一来源
import type { InputCmd } from "../sim-core/src/types.ts";

let connCounter = 0;

/** 连接级会话（双模式 + seat/player 映射）。key = conn.connId（进程内唯一）。 */
interface LiveSession {
  readonly userId: string;
  readonly guest: boolean;
  readonly seatId: number;
  /** 登录玩家持有最新快照（落库单元）；游客为 null（零持久写）。 */
  snapshot: CharacterSnapshot | null;
}
const liveSessions = new Map<string, LiveSession>();
/** 当前网关活跃角色服务（供模块级 handleRaw 使用；createGateway 每次赋值）。 */
let activeCharacterService: CharacterService | null = null;

export interface GatewayDeps {
  verify?: typeof verifyWithApi2;
  characterService?: CharacterService;
  path?: string;
}

export function createGateway(server: Server, deps: GatewayDeps = {}): WebSocketServer {
  const verify = deps.verify ?? verifyWithApi2;
  const characterService = deps.characterService ?? getDefaultCharacterService();
  activeCharacterService = characterService;
  // E6：注入 protocol 层的背包数据通道（character.inventory.get 异步解析用）。
  setProtocolCharacterService(characterService);
  // P0 修复（装备/拾取/升级丢失根因）：equip/unequip（protocol）与拾取/升级（run-manager）
  // 落库后同步 liveSessions 里对应 session.snapshot，防止 autosave/下线 save 用旧快照覆盖文件。
  setProtocolSnapshotSyncer((connId, snap) => {
    const s = liveSessions.get(connId);
    if (s && !s.guest) s.snapshot = snap;
  });
  setSeatSnapshotSyncer((seatId, snap) => {
    for (const s of liveSessions.values()) {
      if (!s.guest && s.seatId === seatId) s.snapshot = snap;
    }
  });
  const wss = new WebSocketServer({
    server,
    path: deps.path ?? "/ws/jianghu",
    maxPayload: config.maxMessageBytes,
  });

  // 房间 presence 变化 → 控制面广播 room.snapshot。
  setRoomChangeListener((room) => {
    broadcastControl(room.roomId, roomSnapshot(room));
  });

  // 空副本 instance GC（RESIDENT 在 room-service.sweepIdleEmptyRooms 内排除，见 C5）。
  const idleSweeper = setInterval(() => {
    sweepIdleEmptyRooms();
  }, Math.min(60_000, Math.max(5_000, Math.floor(config.instanceIdleTtlMs / 6))));
  idleSweeper.unref?.();

  // 角色 autosave（架构 §7：定时 30s；仅落库登录玩家快照，游客零持久写）。
  const autosave = setInterval(() => {
    for (const s of liveSessions.values()) {
      if (!s.guest && s.snapshot) {
        void characterService.save(s.userId, s.snapshot).catch(() => {});
      }
    }
  }, config.characterAutosaveMs);
  autosave.unref?.();

  wss.on("error", () => {
    /* 防止单连接错误拖垮进程 */
  });

  wss.on("connection", async (ws: WebSocket, req) => {
    ws.on("error", () => {});

    const cookie = req.headers.cookie ?? "";
    let devUserId: string | null = null;
    let sessionToken: string | null = null;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      devUserId = url.searchParams.get("devUserId");
      // E14：登录会话 token（客户端经服务端 :3011 HTTP 登录代理取得后，以 ?sessionToken= 重连）。
      sessionToken = url.searchParams.get("sessionToken");
    } catch {
      /* ignore */
    }

    // 早期消息缓冲：浏览器 onopen 即发 room.join，等鉴权完成前先缓存。
    const pendingRaw: Buffer[] = [];
    let authed = false;
    const earlyHandler = (raw: Buffer) => {
      if (!authed) pendingRaw.push(raw);
    };
    ws.on("message", earlyHandler);

    const verified = await verify(cookie, { devUserId, token: sessionToken });
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

    // 双模式：登录 → 从存储加载/创建 Character+Inventory 并分配 seatId；
    // 游客 → 零持久写，snapshot=null（C-Per-1）。
    const { seatId, snapshot } = await characterService.begin(verified);
    liveSessions.set(conn.connId, {
      userId: verified.userId,
      guest: verified.guest,
      seatId,
      snapshot,
    });

    // ping/pong 心跳（C2 覆盖：pongTimeout 5s / pingInterval 1s）。
    let lastPong = Date.now();
    const pingTimer = setInterval(() => {
      if (Date.now() - lastPong > config.pongTimeoutMs) {
        const room = conn.roomId ? getRoom(conn.roomId) : null;
        if (room) markDisconnected(room.roomId, verified.userId);
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
      void handleRaw(conn, raw);
    });

    ws.on("close", () => {
      clearInterval(pingTimer);
      const room = conn.roomId ? getRoom(conn.roomId) : null;
      if (room) markDisconnected(room.roomId, verified.userId);
      // E16：断线立即清该 seat 的输入续行状态（pending + lastMove）→ 角色停步，不再沿最后方向漂移。
      // 主世界 + 副本实例都清（conn.roomId 为当前域；C6：gateway → run-manager.onSeatDisconnect → world.clearPlayerInput）。
      const s = liveSessions.get(conn.connId);
      if (room && s) onSeatDisconnect(room.roomId, s.seatId);
      // 关键事件落库（下线）；游客忽略（零持久写，C-Per-1）。
      if (s && !s.guest && s.snapshot) {
        void characterService.save(s.userId, s.snapshot).catch(() => {});
      }
      liveSessions.delete(conn.connId);
      removeConnection(conn.connId);
    });

    authed = true;
    // 注意：registerConnection 会原地改写 conn.connId 为登记簿内的权威 id，
    // 后续所有发送/移除都必须用 conn.connId，不能用注册前的本地 connId（否则 session.ready 丢、关闭漏删）。
    sendToConn(conn.connId, {
      type: "session.ready",
      userId: verified.userId,
      guest: verified.guest,
      seatId,
      serverTime: Date.now(),
      tickMs: TICK_MS, // C1 单一来源：83.33ms @12Hz
      tickRate: TICK_RATE,
    });

    for (const raw of pendingRaw) {
      void handleRaw(conn, raw);
    }
  });

  return wss;
}

/**
 * 处理一条原始消息：
 *   - "session.ping" → 立即回 "session.pong"（低延迟，不进房间逻辑）。
 *   - "input.cmd"    → 路由到 run-manager（数据面，C6 纪律 B 解耦）。
 *   - 其他           → 控制面 dispatch（显式 type 分派，C4 禁止形状猜测）。
 */
function handleRaw(conn: Conn, raw: Buffer): void {
  let msg: { type: string; requestId?: string; payload?: Record<string, unknown> };
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (msg.type === "session.ping") {
    sendToConn(conn.connId, {
      type: "session.pong",
      requestId: msg.requestId,
      serverTime: Date.now(),
    });
    return;
  }

  // 数据面输入摄取（C6 纪律 B 解耦于控制分派）。
  if (msg.type === "input.cmd") {
    routeInput(conn, msg);
    return;
  }

  // E6 背包数据通道（控制面）：character.inventory.get → 背包面板拉取。
  // dispatch 为同步纯函数（D9 纪律），背包拉取依赖 CharacterService（async IO），
  // 故在此显式 type 路由到 protocol.resolveInventoryGet（C4 显式 type，C6 gateway→protocol）。
  if (msg.type === "character.inventory.get") {
    const s = liveSessions.get(conn.connId);
    void resolveInventoryGet(
      { userId: conn.userId, connId: conn.connId, seatId: s?.seatId, roomId: conn.roomId },
      msg,
    ).then((reply) => sendToConn(conn.connId, reply));
    return;
  }

  // E9 等级数据通道（控制面）：character.level.get → HUD 等级/经验拉取（登录返回；游客忽略）。
  if (msg.type === "character.level.get") {
    const s = liveSessions.get(conn.connId);
    void resolveLevelGet(
      { userId: conn.userId, connId: conn.connId, seatId: s?.seatId, roomId: conn.roomId },
      msg,
    ).then((reply) => {
      if (reply) sendToConn(conn.connId, reply); // null（游客/未知座位）→ 忽略不回复
    });
    return;
  }

  // E7 装备数据通道（控制面）：character.equip / character.unequip → 换装/卸下（async，同背包模式）。
  if (msg.type === "character.equip" || msg.type === "character.unequip") {
    const s = liveSessions.get(conn.connId);
    const handler = msg.type === "character.equip" ? resolveEquip : resolveUnequip;
    void handler(
      { userId: conn.userId, connId: conn.connId, seatId: s?.seatId, roomId: conn.roomId },
      msg,
    ).then((reply) => sendToConn(conn.connId, reply));
    return;
  }

  const s = liveSessions.get(conn.connId);
  const result = dispatch(
    { userId: conn.userId, connId: conn.connId, seatId: s?.seatId, roomId: conn.roomId },
    msg,
  );
  // 先归属房间，再落广播：确保 dispatch 内产生的 room 广播（如 room.snapshot）能送达本连接。
  const joinedRoomId = result.roomId;
  if (joinedRoomId != null) {
    setRoom(conn.connId, joinedRoomId);
    // E3：玩家成功加入房间 → 在权威世界 spawn 玩家实体（seatId 路由，保持 C6 仅调 run-manager）。
    const s2 = liveSessions.get(conn.connId);
    if (s2) {
      // E7：登录玩家携带持久化装备（equipped）→ 世界镜像 maxHp/attrs；游客 snapshot=null → undefined → 基础属性。
      // E9：登录玩家携带持久化等级（level）→ 世界镜像 attrs（str/dex/vit/atk/maxHp 反映真实等级）。
      addPlayerToRoom(joinedRoomId, s2.seatId, s2.userId, s2.snapshot?.character.equipped, s2.snapshot?.character.level);
      // 双模式关键事件：登录玩家加入房间 → last-wins 顶替（C-Per-4）+ 落库（架构 §7）。
      if (!s2.guest) {
        enforceLastWins(joinedRoomId, s2.userId);
        const svc = activeCharacterService ?? getDefaultCharacterService();
        if (s2.snapshot) void svc.save(s2.userId, s2.snapshot).catch(() => {});
      }
    }
  }
  if (result.reply !== undefined) sendToConn(conn.connId, result.reply);
  if (result.broadcasts) {
    for (const b of result.broadcasts) {
      if (b.kind === "room") broadcastControl(b.roomId, b.message);
      else sendToConn(b.connId, b.message, { binary: b.binary });
    }
  }
}

/**
 * 数据面 InputCmd 路由：connId→playerId 路由到 world 队列。
 * E1：roomId 来自连接归属房间；seatId 暂用 0（E2 接入真实座位/角色映射）。
 * C11 seq 单调由后续 E2 输入队列强制。
 */
function routeInput(conn: Conn, msg: { payload?: Record<string, unknown> }): void {
  const roomId = conn.roomId;
  if (!roomId) return;
  const cmd = msg.payload?.cmd as InputCmd | undefined;
  if (!cmd || typeof cmd.seq !== "number") return;
  // E2：seat/player 映射。playerId = 会话 seatId（userId → seatId，E3 movement 消费）。
  const s = liveSessions.get(conn.connId);
  const playerId = s ? s.seatId : 0;
  enqueueInput(roomId, playerId, cmd);
}
