/**
 * rng.ts — 确定性 RNG（E2.S2.4 / ADR-NET-01 D9）
 *
 * 提供 splitmix64 与 Xoshiro256+ 两种 64-bit 确定性算法。
 * 全部以 BigInt 运算 + 显式 & 0xFFFFFFFFFFFFFFFFn 掩码，保证跨语言
 * （TS 权威实现 ↔ GDScript 端口，C7 golden）逐位一致。
 *
 * 设计要点：
 * - 纯函数式 advance：splitmix64Next / xoshiro256Next 返回「新值 + 新状态」，不依赖全局可变状态。
 * - 右移一律走 ushr（无符号右移），规避 BigInt 符号扩展，保证 64-bit 无符号语义。
 * - Rng 类为便捷封装（内部持有状态，非全局），供 E3 地牢生成 / E6 AI 抖动取流。
 *
 * 纪律：本文件无任何 I/O、无全局可变状态、无第三方依赖；仅纯函数 + 类型。
 */

const MASK64 = 0xFFFFFFFFFFFFFFFFn;
const TWO64 = 1n << 64n;

/** 无符号 64-bit 右移：先将值规整为非负表示再移位，规避 BigInt 符号扩展。 */
export function ushr(x: bigint, n: bigint): bigint {
  const u = x & MASK64;
  const pos = u < 0n ? u + TWO64 : u;
  return (pos >> n) & MASK64;
}

/** 无符号 64-bit 左旋转（rotl）。 */
export function urotl(x: bigint, r: bigint): bigint {
  const u = x & MASK64;
  const pos = u < 0n ? u + TWO64 : u;
  return ((pos << r) | (pos >> (64n - r))) & MASK64;
}

// ---------------- splitmix64 ----------------

export type Splitmix64State = bigint;

/** 规整 seed 为 uint64 状态。接受 bigint / number / 数字字符串。 */
export function splitmix64Seed(seed: bigint | number | string): bigint {
  return BigInt(seed) & MASK64;
}

export interface Splitmix64Step {
  readonly value: bigint;
  readonly state: bigint;
}

/** 推进 splitmix64 一步，返回「新随机值 + 新状态」。 */
export function splitmix64Next(state: bigint): Splitmix64Step {
  const s = (state + 0x9e3779b97f4a7c15n) & MASK64;
  let z = s;
  z = ((z ^ ushr(z, 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ ushr(z, 27n)) * 0x94d049bb133111ebn) & MASK64;
  z = z ^ ushr(z, 31n);
  return { value: z & MASK64, state: s };
}

// ---------------- Xoshiro256+ ----------------

export interface Xoshiro256State {
  s0: bigint;
  s1: bigint;
  s2: bigint;
  s3: bigint;
}

export interface Xoshiro256Step {
  readonly value: bigint;
  readonly state: Xoshiro256State;
}

/** 由任意 seed 经 splitmix64 展开得到 4 个 uint64 初始状态字。 */
export function xoshiro256Seed(seed: bigint | number | string): Xoshiro256State {
  let st = splitmix64Seed(seed);
  const words: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    const r = splitmix64Next(st);
    words.push(r.value);
    st = r.state;
  }
  return { s0: words[0], s1: words[1], s2: words[2], s3: words[3] };
}

/** 推进 Xoshiro256+ 一步，返回「新随机值 + 新状态」。 */
export function xoshiro256Next(st: Xoshiro256State): Xoshiro256Step {
  const { s0, s1, s2, s3 } = st;
  const result = (s0 + s3) & MASK64;
  const t = (s1 << 17n) & MASK64;
  const ns2 = s2 ^ s0;
  const ns3 = s3 ^ s1;
  const ns1 = s1 ^ ns2;
  const ns0 = s0 ^ ns3;
  const s0f = (ns0 ^ t) & MASK64;
  const s3f = urotl(ns3, 45n);
  return {
    value: result & MASK64,
    state: { s0: s0f, s1: ns1 & MASK64, s2: ns2 & MASK64, s3: s3f },
  };
}

// ---------------- 字符串 → uint64 哈希（供 E3 seed 字符串接入） ----------------

/**
 * FNV-1a 64-bit 字符串哈希（确定性，跨语言可复刻）。
 * 用于把人类可读的 run_seed 字符串（如 "EMBER-S1"）规整为 uint64，
 *   喂给 splitmix64Seed → Rng。避免 splitmix64Seed 对纯字符串 BigInt() 抛错。
 */
export function hashString64(s: string): bigint {
  let h = 0xcbf29ce484222325n;
  const PRIME = 0x100000001b3n;
  for (let i = 0; i < s.length; i += 1) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * PRIME) & MASK64;
  }
  return h;
}

// ---------------- 便捷封装：Rng ----------------

/**
 * 便捷封装：默认 Xoshiro256+，内部可变状态（非全局）。
 * 供 E3 地牢生成 / E6 AI 抖动等按 seed 取流；同 seed 实例产生完全一致的序列。
 */
export class Rng {
  private st: Xoshiro256State;

  constructor(seed: bigint | number | string) {
    this.st = xoshiro256Seed(seed);
  }

  /** 返回 [0, 2^64) 的 uint64。 */
  nextU64(): bigint {
    const r = xoshiro256Next(this.st);
    this.st = r.state;
    return r.value;
  }

  /** [0, 1) 浮点（取高 53 位）。 */
  nextFloat(): number {
    return Number(this.nextU64() >> 11n) / Number(1n << 53n);
  }

  /** [min, max] 整数闭区间（range 较小，安全降为 number）。 */
  nextInt(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    const range = max - min + 1;
    return min + Number(this.nextU64() % BigInt(range));
  }

  /** 以概率 p ∈ [0,1) 命中。 */
  nextBool(p = 0.5): boolean {
    return this.nextFloat() < p;
  }
}
