/**
 * biome-entrance.test.ts — E28 副本入口 → biome 映射（石牢入口 vs 默认入口）
 * ===========================================================================
 * 覆盖（MVP 最简入口方案：entranceId 区分副本主题，复用同一物理 ENTRANCE 实体）：
 *   ① entranceId=2 → 石牢（biome 1）：实例 world.biomeId=1 + BOSS=铁骨魁（HP=360）；
 *   ② 默认入口（非 2，如 401）→ 普通副本（biome 0）：world.biomeId=0 + BOSS=dungeon_boss（HP=300）；
 *   ③ 默认入口路径不变 = playtest golden（entranceId=1 → biome 0）不触达铁骨魁/石牢。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bootResidentRun, enterInstance, exitInstance, getWorld } from "../src/run-manager.ts";
import { RESIDENT_ROOM_ID } from "../src/room-service.ts";
import { EntityKind } from "../sim-core/src/types.ts";
import {
  BIOME_DEFAULT,
  BIOME_STONE_PRISON,
  BIOME_BARROW,
  ENEMY_BASE_HP,
  HP_MULT,
  ENTRANCE_COOLDOWN_TICKS,
} from "../sim-core/src/constants.ts";

const SEAT = 1;

test("入口→biome：entranceId=2 石牢 / 3 荒冢 / 默认入口普通副本（golden 路径不变）", () => {
  bootResidentRun();

  // ① 石牢入口（entranceId=2，生产常量）→ biome 1。
  const stone = enterInstance(2, [{ seatId: SEAT, userId: "u-stone" }], { lifetimeMs: 10 ** 12 });
  assert.equal(stone.ok, true, "石牢入口创建成功");
  const stoneWorld = getWorld(stone.instanceRoomId!)!;
  assert.equal(stoneWorld.biomeId, BIOME_STONE_PRISON, "石牢入口 → biome 1");
  const stoneBoss = stoneWorld.actors().find((a) => a.kind === EntityKind.BOSS)!;
  assert.equal(stoneBoss.maxHp, Math.round(ENEMY_BASE_HP * HP_MULT.boss * 1.2), "铁骨魁 HP=360");
  exitInstance(stone.instanceRoomId!, { seatId: SEAT });

  // 入口冷却（C-Dgn-4）：推进 RESIDENT tick 越过窗口，避免二次进本被 ENTRANCE_COOLDOWN 拒。
  const resident = getWorld(RESIDENT_ROOM_ID)!;
  for (let i = 0; i < ENTRANCE_COOLDOWN_TICKS + 1; i++) resident.step();

  // ② 默认入口（entranceId=401，非石牢/荒冢）→ biome 0（playtest 同源入口 1 → biome 0，golden 不变）。
  const normal = enterInstance(401, [{ seatId: SEAT, userId: "u-normal" }], { lifetimeMs: 10 ** 12 });
  assert.equal(normal.ok, true, "默认入口创建成功");
  const normalWorld = getWorld(normal.instanceRoomId!)!;
  assert.equal(normalWorld.biomeId, BIOME_DEFAULT, "默认入口 → biome 0（golden 路径）");
  const normalBoss = normalWorld.actors().find((a) => a.kind === EntityKind.BOSS)!;
  assert.equal(normalBoss.maxHp, ENEMY_BASE_HP * HP_MULT.boss, "dungeon_boss HP=300");
  exitInstance(normal.instanceRoomId!, { seatId: SEAT });

  // ③ 荒冢入口（entranceId=3，生产常量）→ biome 2（幽灵精英 + 幽冢鬼母 BOSS）。
  for (let i = 0; i < ENTRANCE_COOLDOWN_TICKS + 1; i++) resident.step();
  const barrow = enterInstance(3, [{ seatId: SEAT, userId: "u-barrow" }], { lifetimeMs: 10 ** 12 });
  assert.equal(barrow.ok, true, "荒冢入口创建成功");
  const barrowWorld = getWorld(barrow.instanceRoomId!)!;
  assert.equal(barrowWorld.biomeId, BIOME_BARROW, "荒冢入口 → biome 2");
  const barrowBoss = barrowWorld.actors().find((a) => a.kind === EntityKind.BOSS)!;
  assert.equal(barrowBoss.maxHp, Math.round(ENEMY_BASE_HP * HP_MULT.boss * 0.9), "幽冢鬼母 HP=270");
  exitInstance(barrow.instanceRoomId!, { seatId: SEAT });
});
