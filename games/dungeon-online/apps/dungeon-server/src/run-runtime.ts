/**
 * run-runtime.ts — 30Hz tick 主循环（E1.S1.3 / C6）
 *
 * 升级自 P5-S1-ENG-1 占位：从「仅常量占位」升级为「真实 30Hz 固定步长权威循环」。
 * 复用 ADR-NET-01 D2 的 TICK_RATE=30（C1 全局唯一常量，不裸写 33.3）。
 *
 * 固定步长（accumulator）模型：高频轮询（pollMs）累积真实流逝时间，
 *   每当累计 ≥ TICK_MS 即推进一个权威 tick，避免 setInterval 漂移；
 *   并设单轮最大 tick 数防「死亡螺旋」。
 *
 * 每 tick 编排（单点，呼应 C6 纪律 A/B 单点编排）：
 *   1) 排空输入队列 → 2) onTick(tick, inputs) 推进权威世界
 *   3) onSnapshot() 取权威快照 → 4) onBroadcast(snapshot) 下发（连接登记广播）
 */

import type { WorldSnapshot, InputCmd } from "../../../packages/sim-core/src/types.ts";

/** 锁定 tick 率（ADR-NET-01 D2）。C1 门禁：全工程引用此常量，禁止裸写 33.3。 */
export const TICK_RATE = 30;
/** 单 tick 时长（ms）。1000 / 30 = 33.333… */
export const TICK_MS = 1000 / TICK_RATE;

/** 固定步长轮询间隔（ms）。远小于 TICK_MS 以平滑累积，又不空转。 */
const POLL_MS = 4;
/** 单轮最大推进 tick 数，防死亡螺旋（掉帧时不无限追帧）。 */
const MAX_TICKS_PER_POLL = 8;

export interface RunLoopHandlers {
  /** 推进一个权威 tick；inputs 为本 tick 排空出的输入指令（已按到达序）。 */
  onTick(tick: number, inputs: readonly InputCmd[]): void | Promise<void>;
  /** 取当前权威快照（onTick 之后调用）。 */
  onSnapshot(): WorldSnapshot;
  /** 下发快照（控制/数据面由 connection-registry 决定）。 */
  onBroadcast(snapshot: WorldSnapshot): void;
  onStart?(): void;
  onStop?(): void;
}

export interface RunLoopHandle {
  stop(): void;
  /** 入队输入指令（由网关/连接层调用）。 */
  enqueueInput(cmd: InputCmd): void;
  /** 当前权威 tick 序号（只读）。 */
  getTick(): number;
  readonly tickRate: number;
}

export function startRunLoop(handlers: RunLoopHandlers): RunLoopHandle {
  handlers.onStart?.();

  const inputQueue: InputCmd[] = [];
  let tick = 0;
  let acc = 0;
  let last = Date.now();

  const poll = () => {
    const now = Date.now();
    acc += now - last;
    last = now;

    // 防死亡螺旋：超量时间直接丢弃（不追帧）。
    if (acc > MAX_TICKS_PER_POLL * TICK_MS) acc = MAX_TICKS_PER_POLL * TICK_MS;

    let steps = 0;
    while (acc >= TICK_MS && steps < MAX_TICKS_PER_POLL) {
      const inputs = inputQueue.splice(0, inputQueue.length);
      void handlers.onTick(tick, inputs);
      const snapshot = handlers.onSnapshot();
      handlers.onBroadcast(snapshot);
      tick += 1;
      acc -= TICK_MS;
      steps += 1;
    }
  };

  const timer = setInterval(poll, POLL_MS);
  // 不阻止进程退出（无连接/测试时允许自然退出）。
  timer.unref?.();

  return {
    stop() {
      clearInterval(timer);
      handlers.onStop?.();
    },
    enqueueInput(cmd: InputCmd) {
      inputQueue.push(cmd);
    },
    getTick() {
      return tick;
    },
    tickRate: TICK_RATE,
  };
}
