/**
 * movement.ts — 移动（E3 真实移动 + 占用格碰撞，纯函数）
 * ===========================================================================
 * 服务端权威移动：pos + dirToVector(dir) * speedPerTick * TILE，px 连续积分。
 *
 * 设计纪律：
 *   - 纯函数：不修改入参，返回新 Vec2（确定性、可单测、无副作用）。
 *   - 碰撞：可选 isBlocked(x,y) → 目标格被挡时沿自由轴滑动（撞墙转向但沿可走轴滑）。
 *   - isBlocked 由 world 注入（含越界 + 占用格），本文件不持有任何世界状态（C6）。
 *   - 唯一常量来源：TILE / CELLS_PER_TICK 一律从 constants.ts import（C7）。
 */
import type { Vec2 } from "./types.ts";
import { CELLS_PER_TICK, TILE } from "./constants.ts"; // C7 单一来源

/** 8 向 → 单位向量（x右/y下，顺时针）。0=E(→+x) 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE。 */
export const DIR_UNIT_VECTORS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

export function dirToVector(dir: number): Vec2 {
  const k = ((Math.trunc(dir) % 8) + 8) % 8;
  return DIR_UNIT_VECTORS[k];
}

/** 单 tick 位移（格）= BASE_SPEED / TICK_RATE（C7 单一来源推导）。 */
export function speedPerTick(): number {
  return CELLS_PER_TICK;
}

export interface StepMovementOpts {
  /** 单 tick 位移（格）；缺省用 CELLS_PER_TICK（C7）。 */
  readonly speedPerTick?: number;
  /** 占用格判定（px→格）；返回 true 表示不可进入（越界或墙）。由 world 注入。 */
  readonly isBlocked?: (x: number, y: number) => boolean;
}

/**
 * 推进一个 tick 的连续位移（px），纯函数。
 *
 *   displacement = dirToVector(dir) * speedPerTick * TILE
 *
 * - 若 isBlocked 提供且目标格被挡：按 wander "沿自由轴滑动"——
 *     x 轴可走则只走 x，否则 y 轴可走则只走 y，否则原地（不瞬移、不卡死）。
 * - 朝向更新由调用方（world.step）负责，本函数只算位移。
 * - 不修改入参 pos，返回新 Vec2。
 */
export function stepMovement(pos: Vec2, dir: number, opts?: StepMovementOpts): Vec2 {
  const speed = opts?.speedPerTick ?? CELLS_PER_TICK;
  const v = dirToVector(dir);
  const nx = pos.x + v.x * speed * TILE;
  const ny = pos.y + v.y * speed * TILE;

  if (!opts?.isBlocked) {
    return { x: nx, y: ny };
  }

  // 目标格可走 → 直接接受（边界由 world.isBlocked 编码为 blocked，滑动即保证不越界）。
  if (!opts.isBlocked(nx, ny)) {
    return { x: nx, y: ny };
  }

  // 目标格被挡：尝试沿单一自由轴滑动（wander 模型）。
  const xFree = !opts.isBlocked(nx, pos.y); // 仅走 x 轴
  const yFree = !opts.isBlocked(pos.x, ny); // 仅走 y 轴
  if (xFree) {
    return { x: nx, y: pos.y };
  }
  if (yFree) {
    return { x: pos.x, y: ny };
  }
  // 两轴皆挡 → 原地（朝向仍由调用方在 step 里更新）。
  return { x: pos.x, y: pos.y };
}
