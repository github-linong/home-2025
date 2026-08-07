/**
 * run-runtime.ts — 12Hz tick 主循环（E1.S1.3 / C1 / C5）
 * ===========================================================================
 * 复用 dungeon-online run-runtime 形状（固定步长 accumulator 模型），但关键差异：
 *   - **TICK_RATE / TICK_MS 一律从 sim-core/constants.ts 单一来源 import**（C1），
 *     本文件绝不裸写 12 / 83.33（吸收 dungeon-online C1「手镜像」教训）。
 *   - tick 率 30Hz→12Hz（83.33ms/tick）。
 *
 * 每 tick 编排（单点，呼应 C6 纪律 A/B 单点编排）：
 *   1) dequeue 本 tick 输入 → 2) onTick(tick, inputs) 推进权威世界
 *   3) onSnapshot() 取权威快照 → 4) onBroadcast(snapshot) 下发（连接登记广播，仅本 room/副本域）
 */

import type { WorldSnapshot, InputCmd } from "../sim-core/src/types.ts";
import { TICK_RATE, TICK_MS } from "../sim-core/src/constants.ts"; // C1 单一来源

/** 锁定 tick 率（来自 sim-core 常量，全工程唯一引用点，C1）。 */
export const TICK_RATE_REF = TICK_RATE;
/** 单 tick 时长（ms），由 TICK_RATE 推导。 */
export const TICK_MS_REF = TICK_MS;

/** 固定步长轮询间隔（ms）。远小于 TICK_MS 以平滑累积，又不空转。 */
const POLL_MS = 4;
/** 单轮最大推进 tick 数，防死亡螺旋（掉帧时不无限追帧）。 */
const MAX_TICKS_PER_POLL = 8;

export interface RunLoopHandlers {
  /** 推进一个权威 tick；inputs 为本 tick 排空出的输入指令（已按到达序）。 */
  onTick(tick: number, inputs: readonly InputCmd[]): void | Promise<void>;
  /** 取当前权威快照（onTick 之后调用）。 */
  onSnapshot(): WorldSnapshot;
  /** 下发快照（数据面二进制，由 connection-registry 决定广播域）。 */
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
