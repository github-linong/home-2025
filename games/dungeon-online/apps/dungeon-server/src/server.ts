/**
 * server.ts — 进程引导（E1 整体装配；供 `npm start`）
 *
 * 装配：HTTP 服务（/healthz + /internal/kick） + WS 网关 + RESIDENT 单例 + RunManager。
 * 复用 poker server.js 的 HTTP/WS 同进程挂载模式（apps/poker-realtime/src/server.js）。
 *
 * S1.5 RESIDENT：启动时 ensureResidentRoom() 建进程级公共房单例（sweep 排除）。
 * R2（Godot headless 推迟）：本 Sprint 不内嵌客户端；可用合成输入 / 假连接验证闭环。
 * DEMO_RUN=1 时自动在 RESIDENT 房起一局（1 个 dummy 玩家），让 30Hz 循环 + 广播真实跑起来，
 *   便于人工观察 / smoke 验证（S1.3 核心交付：服务器真在 tick 世界）。
 */

import { createServer, type Server } from "node:http";
import { config } from "./config.ts";
import { createGateway } from "./gateway.ts";
import { createRunManager } from "./run-manager.ts";
import {
  ensureResidentRoom,
  getRoom,
  roomSnapshot,
  setWorldResolver,
} from "./room-service.ts";
import { kickUser } from "./connection-registry.ts";
import { PLAYER_CLASSES } from "../../../packages/sim-core/src/types.ts";

export interface BuiltServer {
  server: Server;
  runManager: ReturnType<typeof createRunManager>;
  wss: ReturnType<typeof createGateway>;
}

export function buildServer(): BuiltServer {
  const runManager = createRunManager();
  // D8（C3/C10）：将 room-service 的断线/重连托管钩子桥接到权威 World（按 roomId 解析）。
  setWorldResolver((roomId) => runManager.getWorld(roomId));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (url.pathname === "/healthz") {
      const resident = getRoom("room_resident_public");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          uptime: Date.now(),
          residentRoom: resident ? roomSnapshot(resident) : null,
        }),
      );
      return;
    }

    if (url.pathname === "/internal/kick" && req.method === "POST") {
      if (req.headers["x-admin-token"] !== config.internalAdminToken) {
        res.writeHead(403);
        res.end("FORBIDDEN");
        return;
      }
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString().trim() || "{}");
      if (body?.userId) kickUser(body.userId, body.reason ?? "admin_kick");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  const wss = createGateway(server, { runManager });
  ensureResidentRoom();

  if (process.env.DEMO_RUN === "1") {
    // 自动起一局（RESIDENT 房 + 1 dummy 玩家），让 30Hz 循环真实 tick + 广播。
    const resident = ensureResidentRoom();
    if (!runManager.isRunning(resident.roomId)) {
      runManager.startRun(resident.roomId, {
        runId: "run_demo",
        seed: "DEMO-SEED",
        biomeId: resident.biomeId,
        players: [
          { seatId: 0, userId: "demo_player", classId: PLAYER_CLASSES[0] },
        ],
      });
    }
  }

  return { server, runManager, wss };
}

// 仅当作为入口运行（非被 import）才 listen，便于测试复用 buildServer。
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const built = buildServer();
  built.server.listen(config.port, () => {
    const resident = getRoom("room_resident_public");
    // eslint-disable-next-line no-console
    console.log(
      `余烬小队 dungeon-server listening on http://127.0.0.1:${config.port} ` +
        `(ws /ws/dungeon) RESIDENT=${resident?.roomId}`,
    );
  });
}
