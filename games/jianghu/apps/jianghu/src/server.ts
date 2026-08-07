/**
 * server.ts — HTTP + WS 网关启动（E1 入口）
 * ===========================================================================
 * 启动流程：
 *   1) ensureResidentRoom（C5 常驻主世界单默认房间）
 *   2) bootResidentRun（起 RESIDENT 的 12Hz 权威 run 循环 + 本域二进制广播）
 *   3) createGateway（ws 接线 + C2 心跳 + 双平面路由）
 *
 * 不实现：E2 auth/persistence、E3 真实副本生成、E4 掉落、E5 战斗（仅占位）。
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "./config.ts";
import { proxyLogin, type LoginError } from "./login-proxy.ts";
import { TICK_RATE } from "../sim-core/src/constants.ts"; // C1 单一来源
import { ensureResidentRoom } from "./room-service.ts";
import { bootResidentRun, setActiveCharacterService } from "./run-manager.ts";
import { createGateway, type GatewayDeps } from "./gateway.ts";
import { CharacterService, MemoryCharacterStore, JsonFileCharacterStore } from "./persistence.ts";

export async function startServer(
  port: number = config.port,
  gatewayDeps: GatewayDeps = {},
): Promise<{
  close(): void;
  port: number;
  httpServer: ReturnType<typeof createServer>;
}> {
  // 1) RESIDENT 主世界房间（进程级单例）。
  ensureResidentRoom();

  // 2) 起 RESIDENT 权威 run（12Hz 循环 + 二进制广播）。
  bootResidentRun();

  // 2.5) 角色持久化服务（E2 · ADR-JH-ENG-02）：按 config 选存储（内存 / JSON 文件）。
  const store = config.jsonStoreDir
    ? new JsonFileCharacterStore(config.jsonStoreDir)
    : new MemoryCharacterStore();
  const characterService = new CharacterService({ store });

  // 2.5b) F1（P1）：注入 run-manager 拾取→背包接线。handlePickup 在 tick 时才读该模块级引用，
  //       此处晚于 bootResidentRun 亦可（run 循环为异步，首个拾取必然发生在注入之后）。
  setActiveCharacterService(characterService);

  // 3) HTTP + WS 网关（注入角色服务；允许测试覆盖）。
  const httpServer = createServer((req, res) => {
    void handleHttp(req, res);
  });
  const wss = createGateway(httpServer, { ...gatewayDeps, characterService });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => resolve());
  });
  const realPort = (httpServer.address() as { port: number }).port;

  // eslint-disable-next-line no-console
  console.log(`[jianghu] server listening on :${realPort} (ws /ws/jianghu)`);
  // eslint-disable-next-line no-console
  console.log(`[jianghu] RESIDENT run ticking @ ${TICK_RATE}Hz (TICK_RATE from sim-core)`);

  return {
    close() {
      wss.close();
      httpServer.close();
    },
    port: realPort,
    httpServer,
  };
}

// ============================================================================
// HTTP 路由（E14）：POST /api/auth/login | /api/auth/register → api2 登录/注册代理；
// 其余路径保持原健康检查文本。
// ============================================================================

const MAX_BODY_BYTES = 16_384;

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** E14：登录/注册代理的 HTTP 接线（读 body → proxyLogin → 结构化错误码 JSON）。 */
async function handleAuthProxy(
  req: IncomingMessage,
  res: ServerResponse,
  mode: "login" | "register",
): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: "BAD_REQUEST" });
    return;
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const result = await proxyLogin(email, password, { mode });
  if (result.ok) {
    sendJson(res, 200, { ok: true, sessionToken: result.sessionToken });
    return;
  }
  const statusByError: Record<LoginError, number> = {
    API2_UNREACHABLE: 502,
    INVALID_CREDENTIALS: 401,
    BAD_REQUEST: 400,
    SERVER_ERROR: 500,
  };
  sendJson(res, statusByError[result.error], { ok: false, error: result.error });
}

function handleHttp(req: IncomingMessage, res: ServerResponse): void {
  const path = (req.url ?? "/").split("?")[0];
  if (req.method === "POST" && path === "/api/auth/login") {
    void handleAuthProxy(req, res, "login");
    return;
  }
  if (req.method === "POST" && path === "/api/auth/register") {
    void handleAuthProxy(req, res, "register");
    return;
  }
  // 非登录/注册请求 → 原健康检查文本（ws 握手由 ws 库处理，不经过此 handler）。
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("江湖 jianghu authoritative server (E2 dual-mode) — ws path: /ws/jianghu\n");
}

// 直接运行时启动（npm start）。被测试 import 时不自动监听。
if (import.meta.url === `file://${process.argv[1]}`) {
  void startServer();
}
