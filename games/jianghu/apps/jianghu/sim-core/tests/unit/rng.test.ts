/**
 * rng.test.ts — 确定性 RNG 单元测试（D9 / C8）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Rng, hashString64, xoshiro256Seed, xoshiro256Next } from "../../src/rng.ts";

test("Rng: same seed → identical stream across runs", () => {
  const a = new Rng("JH-SEED-A");
  const b = new Rng("JH-SEED-A");
  for (let i = 0; i < 16; i++) {
    assert.equal(a.nextU64(), b.nextU64());
  }
});

test("Rng: different seed → different stream", () => {
  const a = new Rng("JH-SEED-A");
  const b = new Rng("JH-SEED-B");
  let differs = false;
  for (let i = 0; i < 16; i++) {
    if (a.nextU64() !== b.nextU64()) differs = true;
  }
  assert.ok(differs, "different seeds must diverge");
});

test("Rng: nextInt within [min,max] and deterministic", () => {
  const a = new Rng("range");
  const b = new Rng("range");
  for (let i = 0; i < 200; i++) {
    const v = a.nextInt(2, 38);
    assert.ok(v >= 2 && v <= 38, `out of range: ${v}`);
    assert.equal(v, b.nextInt(2, 38));
  }
});

test("Rng: nextFloat in [0,1) and deterministic", () => {
  const a = new Rng("float");
  const b = new Rng("float");
  for (let i = 0; i < 200; i++) {
    const f = a.nextFloat();
    assert.ok(f >= 0 && f < 1, `out of range: ${f}`);
    assert.equal(f, b.nextFloat());
  }
});

test("hashString64: deterministic and different inputs differ", () => {
  assert.equal(hashString64("EMBER-S1"), hashString64("EMBER-S1"));
  assert.notEqual(hashString64("EMBER-S1"), hashString64("OTHER"));
});

test("xoshiro256*: pure advance returns new state (no global mutation)", () => {
  const s0 = xoshiro256Seed("pure");
  const r1 = xoshiro256Next(s0);
  const r2 = xoshiro256Next(s0);
  assert.equal(r1.value, r2.value, "same input state → same output");
  assert.deepEqual(r1.state, r2.state);
});
