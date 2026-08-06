/**
 * rng.test.ts — 确定性 RNG 单测（E2.S2.4）
 *
 * 核心断言：同 seed → 同序列（splitmix64 / xoshiro256+ / Rng 封装各验）。
 * 另含 golden 锚点：锁定 seed=0 的首值，供 GDScript 端口跨语言对齐（C7）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  splitmix64Seed,
  splitmix64Next,
  xoshiro256Seed,
  xoshiro256Next,
  Rng,
} from "../../src/rng.ts";

// ---- 锁定 golden 向量（C7 跨语言对齐：GDScript 端口须产出同值）----
const GOLDEN_SPLITMIX_SEED0_FIRST = 0xe220a8397b1dcdafn;
const GOLDEN_XOSHIRO_SEED0_FIRST = 0xdaac60e1ed6a4f9bn;

test("splitmix64: same seed → identical sequence (1000 ticks)", () => {
  let a = splitmix64Next(splitmix64Seed(0x1234_5678n));
  let b = splitmix64Next(splitmix64Seed(0x1234_5678n));
  for (let i = 0; i < 1000; i++) {
    assert.equal(a.value, b.value, `tick ${i} value mismatch`);
    assert.equal(a.state, b.state, `tick ${i} state mismatch`);
    a = splitmix64Next(a.state);
    b = splitmix64Next(b.state);
  }
});

test("xoshiro256+: same seed → identical sequence (1000 ticks)", () => {
  let a = xoshiro256Next(xoshiro256Seed(0xc0ffee));
  let b = xoshiro256Next(xoshiro256Seed(0xc0ffee));
  for (let i = 0; i < 1000; i++) {
    assert.equal(a.value, b.value, `tick ${i} value mismatch`);
    assert.deepEqual(a.state, b.state, `tick ${i} state mismatch`);
    a = xoshiro256Next(a.state);
    b = xoshiro256Next(b.state);
  }
});

test("Rng class: deterministic across independent instances (same seed)", () => {
  const ra = new Rng(42);
  const rb = new Rng(42);
  const seqA: bigint[] = [];
  const seqB: bigint[] = [];
  for (let i = 0; i < 500; i++) {
    seqA.push(ra.nextU64());
    seqB.push(rb.nextU64());
  }
  assert.deepEqual(seqA, seqB);
});

test("different seeds diverge (sanity)", () => {
  const a = splitmix64Next(splitmix64Seed(1n)).value;
  const b = splitmix64Next(splitmix64Seed(2n)).value;
  assert.notEqual(a, b);
});

test("Rng.nextInt stays within inclusive bounds", () => {
  const r = new Rng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r.nextInt(3, 9);
    assert.ok(v >= 3 && v <= 9, `out of bounds: ${v}`);
  }
});

test("golden anchor: splitmix64(seed=0) first value matches locked vector", () => {
  const first = splitmix64Next(splitmix64Seed(0n)).value;
  assert.equal(first, GOLDEN_SPLITMIX_SEED0_FIRST);
});

test("golden anchor: xoshiro256+(seed=0) first value matches locked vector", () => {
  const first = xoshiro256Next(xoshiro256Seed(0n)).value;
  assert.equal(first, GOLDEN_XOSHIRO_SEED0_FIRST);
});
