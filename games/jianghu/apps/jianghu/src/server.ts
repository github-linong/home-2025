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

import { createServer } from "node:http";
import { config } from "./config.ts";
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
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("江湖 jianghu authoritative server (E2 dual-mode) — ws path: /ws/jianghu\n");
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

// 直接运行时启动（npm start）。被测试 import 时不自动监听。
if (import.meta.url === `file://${process.argv[1]}`) {
  void startServer();
}
