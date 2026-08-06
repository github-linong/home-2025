/**
 * run-manager.ts — 运行实例管理（S1.3 run-runtime × world 编排）
 *
 * 按 roomId 维护「世界 + 30Hz 循环」生命周期：
 *   - startRun：消费 E3 布局创建 World（world.ts），启动 startRunLoop，逐 tick 广播快照。
 *   - stopRun：停止循环。
 *   - getSnapshot：重连/sync 拉取全量 WorldSnapshot（S1.6 / C10）。
 *   - enqueueInput：网关把客户端 InputCmd 入队到对应 room 的循环输入队列。
 *
 * 广播走 connection-registry 的数据面（binary:true，R1 前为 JSON→Buffer 占位）。
 */

import {
  startRunLoop,
  type RunLoopHandle,
} from "./run-runtime.ts";
import { broadcastToRoom } from "./connection-registry.ts";
import { createWorld, type World, type CreateWorldOpts } from "../../../packages/sim-core/src/world.ts";
import type { WorldSnapshot, InputCmd } from "../../../packages/sim-core/src/types.ts";

interface RunEntry {
  world: World;
  loop: RunLoopHandle;
}

export interface RunManager {
  startRun(roomId: string, opts: CreateWorldOpts): WorldSnapshot;
  stopRun(roomId: string): void;
  getSnapshot(roomId: string): WorldSnapshot | null;
  /** D8：暴露权威 World（只读引用）供 room-service 驱动托管钩子；仅调用 setDisconnected（纪律 B）。 */
  getWorld(roomId: string): World | null;
  enqueueInput(roomId: string, playerId: number, cmd: InputCmd): void;
  isRunning(roomId: string): boolean;
}

export function createRunManager(): RunManager {
  const runs = new Map<string, RunEntry>();

  return {
    startRun(roomId: string, opts: CreateWorldOpts): WorldSnapshot {
      const existing = runs.get(roomId);
      if (existing) existing.loop.stop();

      const world: World = createWorld(opts);
      const loop = startRunLoop({
        // E4：玩家输入经网关路由直接入 world 的 PerPlayerInputQueue（按 playerId）。
        // run-runtime 的扁平 inputQueue 保留为循环契约（run-runtime.test.ts），
        // 本 Sprint 游戏输入不走它，world.step() 自行 drain 每玩家队列。
        onTick() {
          world.step();
        },
        onSnapshot() {
          return world.snapshot();
        },
        onBroadcast(snapshot: WorldSnapshot) {
          broadcastToRoom(roomId, snapshot, { binary: true });
        },
      });

      runs.set(roomId, { world, loop });
      return world.snapshot();
    },

    stopRun(roomId: string): void {
      const entry = runs.get(roomId);
      if (entry) {
        entry.loop.stop();
        runs.delete(roomId);
      }
    },

    getSnapshot(roomId: string): WorldSnapshot | null {
      return runs.get(roomId)?.world.snapshot() ?? null;
    },

    getWorld(roomId: string): World | null {
      return runs.get(roomId)?.world ?? null;
    },

    enqueueInput(roomId: string, playerId: number, cmd: InputCmd): void {
      runs.get(roomId)?.world.enqueueInput(playerId, cmd);
    },

    isRunning(roomId: string): boolean {
      return runs.has(roomId);
    },
  };
}
