/**
 * biome-entrance.test.ts — E28 副本入口 → biome 映射（石牢入口 vs 默认入口）
 * ===========================================================================
 * 覆盖（MVP 最简入口方案：entranceId 区分副本主题，复用同一物理 ENTRANCE 实体）：
 *   ① entranceId=2 → 石牢（biome 1）：实例 world.biomeId=1 + BOSS=铁骨魁（HP=360）；
 *   ② 默认入口（非 2/3/4，如 401）→ 普通副本（biome 0）：world.biomeId=0 + BOSS=dungeon_boss（HP=300）；
 *   ③ entranceId=3 → 荒冢（biome 2）+ BOSS=幽冢鬼母（HP=270）；
 *   ④ entranceId=4 → 熔窟（biome 3）+ BOSS=熔岩巨像（HP=390）；
 *   ⑤ 默认入口路径不变 = playtest golden（entranceId=1 → biome 0）不触达石牢/荒冢/熔窟；
 *   ⑥ C（Sprint 2 修复）：熔窟等级门槛（L1 → LEVEL_TOO_LOW；L3 放行；biome0/1/2 无门槛）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bootResidentRun, enterInstance, exitInstance, getWorld, addPlayerToRoom } from "../src/run-manager.ts";
import { RESIDENT_ROOM_ID } from "../src/room-service.ts";
import { EntityKind } from "../sim-core/src/types.ts";
import {
  BIOME_DEFAULT,
  BIOME_STONE_PRISON,
  BIOME_BARROW,
  BIOME_MOLTEN_CAVERN,
  ENEMY_BASE_HP,
  HP_MULT,
  ENTRANCE_COOLDOWN_TICKS,
  MOLTEN_CAVERN_MIN_LEVEL,
} from "../sim-core/src/constants.ts";

const SEAT = 1;

test("入口→biome：entranceId=2 石牢 / 3 荒冢 / 4 熔窟 / 默认入口普通副本（golden 路径不变）", () => {
  bootResidentRun();

  // ① 石牢入口（entranceId=2，生产常量）→ biome 1。
  const stone = enterInstance(2, [{ seatId: SEAT, userId: "u-stone" }], { lifetimeMs: 10 ** 12 });
  assert.equal(stone.ok, true, "石牢入口创建成功");
  assert.equal(stone.biomeId, BIOME_STONE_PRISON, "E34：enterInstance 返回 biomeId=1（客户端副本色调下发）");
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
  assert.equal(normal.biomeId, BIOME_DEFAULT, "E34：默认入口返回 biomeId=0（无副本色调）");
  const normalWorld = getWorld(normal.instanceRoomId!)!;
  assert.equal(normalWorld.biomeId, BIOME_DEFAULT, "默认入口 → biome 0（golden 路径）");
  const normalBoss = normalWorld.actors().find((a) => a.kind === EntityKind.BOSS)!;
  assert.equal(normalBoss.maxHp, ENEMY_BASE_HP * HP_MULT.boss, "dungeon_boss HP=300");
  exitInstance(normal.instanceRoomId!, { seatId: SEAT });

  // ③ 荒冢入口（entranceId=3，生产常量）→ biome 2（幽灵精英 + 幽冢鬼母 BOSS）。
  for (let i = 0; i < ENTRANCE_COOLDOWN_TICKS + 1; i++) resident.step();
  const barrow = enterInstance(3, [{ seatId: SEAT, userId: "u-barrow" }], { lifetimeMs: 10 ** 12 });
  assert.equal(barrow.ok, true, "荒冢入口创建成功");
  assert.equal(barrow.biomeId, BIOME_BARROW, "E34：荒冢入口返回 biomeId=2");
  const barrowWorld = getWorld(barrow.instanceRoomId!)!;
  assert.equal(barrowWorld.biomeId, BIOME_BARROW, "荒冢入口 → biome 2");
  const barrowBoss = barrowWorld.actors().find((a) => a.kind === EntityKind.BOSS)!;
  assert.equal(barrowBoss.maxHp, Math.round(ENEMY_BASE_HP * HP_MULT.boss * 0.9), "幽冢鬼母 HP=270");
  exitInstance(barrow.instanceRoomId!, { seatId: SEAT });

  // ④ 熔窟入口（entranceId=4，生产常量）→ biome 3（火系敌人 + 熔岩巨像 BOSS）。
  //    C（Sprint 2 修复）：熔窟需等级 ≥ MOLTEN_CAVERN_MIN_LEVEL；先播种等级再进，否则被门槛拒。
  for (let i = 0; i < ENTRANCE_COOLDOWN_TICKS + 1; i++) resident.step();
  addPlayerToRoom(RESIDENT_ROOM_ID, SEAT, "u-molten", undefined, MOLTEN_CAVERN_MIN_LEVEL);
  const molten = enterInstance(4, [{ seatId: SEAT, userId: "u-molten" }], { lifetimeMs: 10 ** 12 });
  assert.equal(molten.ok, true, "熔窟入口创建成功（等级达标）");
  assert.equal(molten.biomeId, BIOME_MOLTEN_CAVERN, "E34：熔窟入口返回 biomeId=3");
  const moltenWorld = getWorld(molten.instanceRoomId!)!;
  assert.equal(moltenWorld.biomeId, BIOME_MOLTEN_CAVERN, "熔窟入口 → biome 3");
  const moltenBoss = moltenWorld.actors().find((a) => a.kind === EntityKind.BOSS)!;
  assert.equal(moltenBoss.maxHp, Math.round(ENEMY_BASE_HP * HP_MULT.boss * 1.3), "熔岩巨像 HP=390");
  exitInstance(molten.instanceRoomId!, { seatId: SEAT });
});

// ------------------------------------------------------------------
// C（Sprint 2 修复）：熔窟等级门槛（防 L1 新手被熔岩巨像一击秒杀）
// ------------------------------------------------------------------

test("C 熔窟等级门槛：L1 进熔窟 → LEVEL_TOO_LOW；L3 放行；biome1 无门槛", () => {
  bootResidentRun();
  const rw = getWorld(RESIDENT_ROOM_ID)!;
  const LOW_SEAT = 2; // 未播种等级 → levelBySeat 缺省 L1
  const OK_SEAT = 3; // 播种 L3 → 熔窟放行

  // ① L1（未播种等级，缺省 1）进熔窟 → 拒绝 LEVEL_TOO_LOW（含所需等级）。
  const low = enterInstance(4, [{ seatId: LOW_SEAT, userId: "u-low" }], { lifetimeMs: 10 ** 12 });
  assert.equal(low.ok, false, "L1 进熔窟被拒");
  assert.equal(low.reason, "LEVEL_TOO_LOW", "错误码 LEVEL_TOO_LOW");
  assert.equal(low.requiredLevel, MOLTEN_CAVERN_MIN_LEVEL, "含所需等级 3");

  // ② 播种等级 L3 → 熔窟放行（world.biomeId=3）。
  addPlayerToRoom(RESIDENT_ROOM_ID, OK_SEAT, "u-l3", undefined, MOLTEN_CAVERN_MIN_LEVEL);
  const ok = enterInstance(4, [{ seatId: OK_SEAT, userId: "u-l3" }], { lifetimeMs: 10 ** 12 });
  assert.equal(ok.ok, true, "L3 进熔窟放行");
  assert.equal(getWorld(ok.instanceRoomId!)!.biomeId, BIOME_MOLTEN_CAVERN, "熔窟 → biome 3");
  exitInstance(ok.instanceRoomId!, { seatId: OK_SEAT });

  // ③ biome1（石牢）无门槛：L1 也应放行（等级门槛只对 biome3 生效，golden 不变）。
  for (let i = 0; i < ENTRANCE_COOLDOWN_TICKS + 1; i++) rw.step();
  const stone = enterInstance(2, [{ seatId: LOW_SEAT, userId: "u-stone-nogate" }], { lifetimeMs: 10 ** 12 });
  assert.equal(stone.ok, true, "石牢（biome1）L1 无门槛放行");
  exitInstance(stone.instanceRoomId!, { seatId: LOW_SEAT });
});
