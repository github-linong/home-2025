import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ANIMAL_CHARACTER_PROFILES,
  HUMAN_CHARACTER_PROFILES,
  assertCharacterProfiles,
} from "../src/lib/novelCharacters.js";

assertCharacterProfiles(HUMAN_CHARACTER_PROFILES, ANIMAL_CHARACTER_PROFILES);

assert.ok(HUMAN_CHARACTER_PROFILES.length >= 15);
assert.ok(ANIMAL_CHARACTER_PROFILES.length >= 15);

for (const name of [
  "夏青",
  "张三",
  "杨晋",
  "唐怀",
  "匡庆威",
  "辛瑜",
  "张十",
  "张十一",
  "谭七",
  "张何",
  "张宋",
]) {
  assert.ok(HUMAN_CHARACTER_PROFILES.some((row) => row.name === name), `missing human: ${name}`);
}

for (const name of [
  "羊老大",
  "头狼",
  "断腰狼",
  "帅巨狼",
  "狼犬老二",
  "老四",
  "瞎眼虎",
  "西部前虎王",
  "茉莉",
  "进化玉带海雕",
  "灰皮鹦鹉",
]) {
  assert.ok(ANIMAL_CHARACTER_PROFILES.some((row) => row.name === name), `missing animal: ${name}`);
}

assert.ok(
  ANIMAL_CHARACTER_PROFILES.some(
    (row) => row.name === "头狼" && /神狼/.test(`${row.aliases} ${row.intro}`),
  ),
);
assert.ok(
  HUMAN_CHARACTER_PROFILES.some(
    (row) =>
      row.name === "辛瑜" &&
      /女性/.test(`${row.role} ${row.intro}`) &&
      /陨铁/.test(`${row.role} ${row.intro}`),
  ),
);
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");
for (const row of [...HUMAN_CHARACTER_PROFILES, ...ANIMAL_CHARACTER_PROFILES]) {
  assert.ok(row.image?.startsWith("/images/novel-codex/"), `bad image path: ${row.name}`);
  assert.ok(existsSync(path.join(publicDir, row.image)), `portrait file missing: ${row.image}`);
}

assert.throws(() => assertCharacterProfiles([], ANIMAL_CHARACTER_PROFILES));

console.log("novelCharacters.test.mjs OK");
