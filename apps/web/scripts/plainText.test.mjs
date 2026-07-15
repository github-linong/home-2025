import assert from "node:assert/strict";
import { toPlainText } from "../src/lib/plainText.ts";

const sample =
  '### 解答思路 给 `<a>` 添加 `download` 属性。 ### 示例代码 ```html\n<a href="a.mp4">x</a>\n``` 结尾';
const plain = toPlainText(sample, 120);
assert.ok(!plain.includes("###"), plain);
assert.ok(!plain.includes("```"), plain);
assert.ok(!plain.includes("`"), plain);
assert.ok(plain.includes("download"), plain);
assert.ok(plain.includes("a"), plain);
assert.ok(plain.endsWith("…") || plain.length <= 120, plain);

assert.equal(toPlainText(""), "");
assert.equal(toPlainText("[link](https://x.com) and **bold**"), "link and bold");

const truncated = toPlainText(
  "找到通过 `r 以及方案 [AntV](https://antv.antgr 还有 ```js function last",
  200,
);
assert.ok(!truncated.includes("`"), truncated);
assert.ok(!truncated.includes("]("), truncated);
assert.ok(!truncated.includes("```"), truncated);
assert.ok(truncated.includes("AntV"), truncated);

console.log("plainText.test.mjs OK");
