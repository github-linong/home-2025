import assert from "node:assert/strict";
import {
  QIANG_YI_CONTENT_GRADES,
  QIANG_YI_CORE,
  QIANG_YI_PROP_ROWS,
  QIANG_YI_SYNTH_ROWS,
  assertQiangYiCatalog,
} from "../src/lib/qiangYiCatalog.js";

assertQiangYiCatalog(QIANG_YI_SYNTH_ROWS, QIANG_YI_CONTENT_GRADES);
assert.ok(QIANG_YI_CORE.length >= 3);
assert.ok(QIANG_YI_SYNTH_ROWS.some((r) => r.effect.includes("胃肠")));
assert.ok(QIANG_YI_SYNTH_ROWS.some((r) => r.name.includes("恢复因子") || r.effect.includes("抗过敏")));
assert.ok(QIANG_YI_PROP_ROWS.some((r) => r.name.includes("颐石")));
assert.throws(() => assertQiangYiCatalog([], []));

console.log("qiangYiCatalog.test.mjs OK");
