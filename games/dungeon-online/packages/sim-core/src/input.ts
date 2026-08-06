/**
 * input.ts — 每玩家输入队列（E4 输入路由 / C11 防重放）
 *
 * 归属 sim-core（与 world.ts 同仓）：权威模拟的输入入口，纯逻辑、无运行时依赖，
 *   便于 D9 golden 跨端对齐（TS 权威 ↔ GDScript 端口）。
 *
 * 设计（E4.S4.1–S4.3 / C6 纪律B）：
 *   - 按 playerId（= 座位 seatId = 实体 ownerId）索引，每玩家一个「最新有效」占位。
 *   - enqueue 在「入队即校验」：C11 反作弊基线——服务端强制 seq 严格单调递增，
 *     丢弃重复(seq==last) / 回放(seq<last) / 倒序(seq<last) 的 InputCmd。
 *   - drainForTick：每 tick 取出各玩家「最新有效」输入（同 tick 多条有效输入只留最新），
 *     供 world.step 应用（应用后 pending 清空，防同输入跨 tick 重复生效）。
 *   - lastProcessedSeq：各玩家服务端已消费的最大 seq，随 WorldSnapshot 下发，
 *     供客户端 100ms 插值 / reconciliation 回正（S4.3 / S4.5）。
 */

import type { InputCmd } from "./types.ts";

interface PlayerInputState {
  /** 本玩家已消费的合法最大 seq（C11 单调校验基准；初始 0）。 */
  lastSeq: number;
  /** 待本 tick 消费的候选输入（最新一条；同 tick 多包只留最新有效）。 */
  pending: InputCmd | null;
}

export class PerPlayerInputQueue {
  private readonly players = new Map<number, PlayerInputState>();

  /** 注册一个玩家（world 创建时按座位调用），初始化 lastSeq=0、pending=null。 */
  register(playerId: number): void {
    if (!this.players.has(playerId)) {
      this.players.set(playerId, { lastSeq: 0, pending: null });
    }
  }

  /**
   * 入队一条输入（C11 反作弊：拒绝 seq 非严格递增的包）。
   * - cmd.seq <= lastSeq → 视为重复 / 回放 / 倒序，丢弃并返回 false。
   * - 否则记录 pending（覆盖同 tick 内的更早有效包），更新 lastSeq，返回 true。
   * @returns 是否被接受（false = 被 C11 规则丢弃）。
   */
  enqueue(playerId: number, cmd: InputCmd): boolean {
    const st = this.players.get(playerId);
    if (!st) return false;
    if (cmd.seq <= st.lastSeq) return false; // 重复 / 回放 / 倒序
    st.pending = cmd;
    st.lastSeq = cmd.seq;
    return true;
  }

  /**
   * 取本 tick 应生效的最新有效输入（不清 lastSeq，仅清 pending）。
   * 返回 playerId → 最新 InputCmd 的映射，供 world.step 应用。
   */
  drain(): Map<number, InputCmd> {
    const out = new Map<number, InputCmd>();
    for (const [pid, st] of this.players) {
      if (st.pending) {
        out.set(pid, st.pending);
        st.pending = null;
      }
    }
    return out;
  }

  /** 各玩家已消费的最大 seq（对账/插值用；key=playerId）。 */
  lastProcessedSeq(): Record<number, number> {
    const out: Record<number, number> = {};
    for (const [pid, st] of this.players) out[pid] = st.lastSeq;
    return out;
  }

  /** 是否存在某玩家（world 清理/校验用）。 */
  has(playerId: number): boolean {
    return this.players.has(playerId);
  }
}

/**
 * drainForTick —— world.step 内调用的收集步骤（E4 命名对齐团队规范）。
 * 按 playerId 取出本 tick 应生效的最新有效 InputCmd 映射（委托 PerPlayerInputQueue.drain）。
 * @param queue 世界持有的每玩家输入队列。
 */
export function drainForTick(queue: PerPlayerInputQueue): Map<number, InputCmd> {
  return queue.drain();
}
