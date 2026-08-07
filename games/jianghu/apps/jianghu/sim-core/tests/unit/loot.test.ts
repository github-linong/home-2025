/**
 * loot.test.ts — E4 掉落单测（确定性，复用 Rng 实例 seed 流）
 * ===========================================================================
 * 覆盖：rollLoot 命中率（elite/boss=1.0，normal≈0.3 确定性统计）、同 seed 同序列（D9）、
 * 词缀数落在 AFFIX_COUNTS[rarity] 区间（暗金恒 5）、rarity 为索引 0..3、
 * dropToGround 恒产出 LootState 且 ttlTicks = LOOT_GROUND_TTL_TICKS。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { rollLoot, dropToGround } from "../../src/loot.ts";
import { Rng } from "../../src/rng.ts";
import {
  AFFIX_COUNTS,
  RARITY_NAMES,
  LOOT_GROUND_TTL_TICKS,
  AFFIX_ID_MAX,
} from "../../src/constants.ts";

test("rollLoot: elite / boss 必然掉（DROP_RATE=1.0）", () => {
  const re = new Rng("elite");
  const rb = new Rng("boss");
  for (let i = 0; i < 50; i++) {
    assert.ok(rollLoot(re, "elite") !== null, "elite 必须掉落");
    assert.ok(rollLoot(rb, "boss") !== null, "boss 必须掉落");
  }
});

test("rollLoot: normal 命中率 ≈0.3（固定 seed 确定性）", () => {
  const r = new Rng("normal-rate");
  const N = 2000;
  let hits = 0;
  for (let i = 0; i < N; i++) if (rollLoot(r, "normal") !== null) hits++;
  const rate = hits / N;
  // 固定 seed ⇒ 固定值；容差仅防表述性 RNG 方差。
  assert.ok(rate > 0.2 && rate < 0.4, `normal 掉率应 ~0.3，实测 ${rate}`);
});

test("rollLoot: 同 seed ⇒ 同掉落序列（D9 确定性）", () => {
  const a = new Rng("det");
  const b = new Rng("det");
  for (let i = 0; i < 30; i++) {
    assert.deepEqual(rollLoot(a, "normal"), rollLoot(b, "normal"));
  }
});

test("rollLoot: 词缀数落在 AFFIX_COUNTS[rarity] 区间，且 id ∈ [1, AFFIX_ID_MAX]", () => {
  for (let ri = 0; ri < 4; ri++) {
    const tier: "normal" | "elite" | "boss" = ri === 3 ? "boss" : ri === 2 ? "boss" : ri === 1 ? "elite" : "normal";
    const r = new Rng(`affix-${ri}`);
    let checked = 0;
    for (let i = 0; i < 8000 && checked < 25; i++) {
      const res = rollLoot(r, tier);
      if (res && res.rarity === ri) {
        const range = AFFIX_COUNTS[RARITY_NAMES[ri]];
        assert.ok(
          res.affixes.length >= range[0] && res.affixes.length <= range[1],
          `rarity ${ri} 词缀数 ${res.affixes.length} 越界 ${range}`,
        );
        for (const af of res.affixes) {
          assert.ok(af >= 1 && af <= AFFIX_ID_MAX, `词缀 id ${af} 越界`);
        }
        checked++;
      }
    }
    assert.ok(checked > 0, `应至少观测到一次 rarity=${ri}`);
  }
});

test("rollLoot: 暗金（rarity=3）恒为 5 词缀", () => {
  const r = new Rng("darkgold");
  let seen = 0;
  for (let i = 0; i < 200 && seen < 10; i++) {
    const res = rollLoot(r, "boss"); // boss 权重 [0,0,55,45]
    if (res && res.rarity === 3) {
      assert.equal(res.affixes.length, 5, "暗金词缀数必须恒为 5");
      seen++;
    }
  }
  assert.ok(seen > 0, "应观测到暗金掉落");
});

test("dropToGround: 恒产出 LootState 且 ttlTicks = LOOT_GROUND_TTL_TICKS", () => {
  const r = new Rng("dtg");
  for (let i = 0; i < 50; i++) {
    const ls = dropToGround(r, "normal");
    assert.equal(ls.ttlTicks, LOOT_GROUND_TTL_TICKS);
    assert.ok(ls.rarity >= 0 && ls.rarity <= 3);
    assert.ok(Array.isArray(ls.affixes));
  }
});
