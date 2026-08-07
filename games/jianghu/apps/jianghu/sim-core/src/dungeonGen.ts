/**
 * dungeonGen.ts — 随机副本生成（E5 落地：seed 驱动确定性布局，ADR-JH-ENG-03）
 * ===========================================================================
 * 每个副本 = 服务端权威生成的独立 world（ADR-JH-ENG-03）。dungeonGen 产出：
 *   - LayoutSnapshot（rooms / maxDepth / spawnPoints / bossPlaced，C-Dgn-3 验收对象）
 *   - DungeonSpec（spawnZones: SpawnZone[] / entryTile / exitTile / bossTile，供 run-manager
 *     建实例 world 使用；spawnZones 直接喂给 createWorld({ spawnZones })）
 *
 * 纪律 A（C6）：dungeonGen → **不 import spawning 运行时**（仅 `import type { SpawnZone }`），
 *   只产出数据，spawning 侧只读引用本模块输出类型。
 * 确定性（D9）：所有随机走 `layoutRng(seed)` 流（同 seed ⇒ 同布局/同掉落；golden-test 守护）。
 *   biomeId 参与 Rng 派生（`layout:${seed}:b${biomeId}`），保证不同 biome 同 seed 仍不同布局。
 * 布局规则（dungeon §⑥）：
 *   - rooms ∈ [5,12]；maxDepth = 3；
 *   - BOSS 必置最深层（最后一间房 depth = maxDepth，C-Dgn-3）；
 *   - 副本刷怪密度 ×DUNGEON_SPAWN_DENSITY（1.2，E6 调低，spawning.md §⑥）。
 */

import type { SpawnPoint, Vec2 } from "./types.ts";
import type { SpawnZone } from "./spawning.ts"; // 纪律 A：仅类型（不调生成函数）
import { Rng } from "./rng.ts";
import { instanceSeed, TILE, DUNGEON_SPAWN_DENSITY } from "./constants.ts"; // C7 单一来源

/** 副本布局快照。 */
export interface LayoutSnapshot {
  readonly rooms: number; // 房间数 5–12
  readonly maxDepth: number; // 分层深度（=3）
  readonly spawnPoints: readonly SpawnPoint[]; // 刷怪点（供 spawning 只读）
  readonly bossPlaced: boolean; // BOSS 是否置最深层（C-Dgn-3）
}

/**
 * 副本规格（供 run-manager 建实例 world 使用；seed 仅服务端持有，C-Dgn-1）。
 * spawnZones 直接喂 createWorld({ spawnZones })，entryTile 为成员出生点。
 */
export interface DungeonSpec {
  readonly rooms: number;
  readonly maxDepth: number;
  readonly spawnZones: readonly SpawnZone[];
  readonly entryTile: Vec2; // 成员出生点（安全角，远离刷怪区）
  readonly exitTile: Vec2; // 出本传送点（BOSS 房中心）
  readonly bossTile: Vec2; // BOSS 房中心（最深层）
  readonly bossDepth: number; // BOSS 所在层（= maxDepth，C-Dgn-3）
  readonly bossPlaced: boolean;
  readonly spawnDensityMultiplier: number; // 副本密度 ×1.2（E6 调低，spawning.md §⑥）
}

/** 网格尺寸（tile）。与 createWorld 默认 bounds（40×30 tile）一致。 */
const GRID_TILES_W = 40;
const GRID_TILES_H = 30;

/** 敌人原型 id 池（引用刷怪表 ID，非运行时实例）。 */
const ENEMY_POOL = ["savage", "brigand", "shadow"] as const;

interface InternalDungeon {
  readonly layout: LayoutSnapshot;
  readonly spec: DungeonSpec;
}

/**
 * 单条确定性生成路径：generateLayout 与 buildDungeonSpec 共用，避免双流漂移。
 * 同 seed + 同 biomeId ⇒ 完全一致的布局与规格（D9）。
 */
function generateInternal(seed: string, biomeId: number): InternalDungeon {
  // biomeId 参与派生：`layout:${seed}:b${biomeId}`（经 layoutRng 单入口，C7/D9）。
  const rng = layoutRng(`${seed}:b${biomeId}`);

  const rooms = rng.nextInt(5, 12);
  const maxDepth = 3;

  const spawnPoints: SpawnPoint[] = [];
  const spawnZones: SpawnZone[] = [];
  let bossPlaced = false;
  let bossTile: Vec2 = { x: 0, y: 0 };
  let entryTile: Vec2 = { x: TILE, y: TILE }; // 安全角出生点（远离刷怪区，防进本即被围）
  let exitTile: Vec2 = entryTile;
  let wave = 0;

  for (let i = 0; i < rooms; i++) {
    // 深度随房间序递增：最后一间必为最深层（depth=maxDepth），置 BOSS（C-Dgn-3）。
    const depth = 1 + Math.floor((i * maxDepth) / rooms);
    const row = Math.floor(i / 3);
    const col = i % 3;
    const gx = Math.min(GRID_TILES_W - 3, Math.max(2, 5 + col * 11 + rng.nextInt(-2, 2)));
    const gy = Math.min(GRID_TILES_H - 3, Math.max(2, 4 + row * 8 + rng.nextInt(-2, 2)));
    const center: Vec2 = { x: gx * TILE, y: gy * TILE };

    if (i === 0) entryTile = center;

    const isBossRoom = i === rooms - 1;
    const wavesThisRoom = isBossRoom ? 2 : rng.nextInt(1, 2);
    for (let w = 0; w < wavesThisRoom; w++) {
      wave += 1;
      if (isBossRoom && w === 0) {
        // BOSS 房第一波 = BOSS（tier=2，必掉更好词缀）；置于最深层中心。
        spawnPoints.push({ pos: center, enemyTypeId: "dungeon_boss", wave, count: 1 });
        // E6：BOSS 默认 aggressive（仇恨半径内索敌追击 + 接触攻击）。
        spawnZones.push({ pos: center, tier: 2, enemyTypeId: "dungeon_boss", count: 1, aggression: "aggressive" });
        bossPlaced = true;
        bossTile = center;
        exitTile = center;
        continue;
      }
      // 普通/精英波：count 依副本密度 ×1.2（E6 调低：1.5→1.2，配区间 1..3，避免副本被围死）。
      const count = Math.max(1, Math.round(rng.nextInt(1, 3) * DUNGEON_SPAWN_DENSITY));
      const pos: Vec2 = {
        x: center.x + rng.nextInt(-1, 1) * TILE,
        y: center.y + rng.nextInt(-1, 1) * TILE,
      };
      const enemyTypeId = ENEMY_POOL[rng.nextInt(0, ENEMY_POOL.length - 1)];
      spawnPoints.push({ pos, enemyTypeId, wave, count });
      // 15% 精英（tier=1），其余普通（tier=0）。
      const tier = rng.nextBool(0.15) ? (1 as const) : (0 as const);
      // E6 敌人类别：普通怪（tier 0）passive（不主动攻击/不追击，被打才反击）；精英（tier 1）aggressive。
      const aggression = tier === 0 ? ("passive" as const) : ("aggressive" as const);
      spawnZones.push({ pos, tier, enemyTypeId, count, aggression });
    }
  }

  const layout: LayoutSnapshot = { rooms, maxDepth, spawnPoints, bossPlaced };
  const spec: DungeonSpec = {
    rooms,
    maxDepth,
    spawnZones,
    entryTile,
    exitTile,
    bossTile,
    bossDepth: maxDepth,
    bossPlaced,
    spawnDensityMultiplier: DUNGEON_SPAWN_DENSITY,
  };
  return { layout, spec };
}

/**
 * 生成副本布局快照（确定性）。
 * @param seed  实例 seed（服务端 computeInstanceSeed 三元组派生，C-Dgn-1）
 * @param biomeId 生物群系 ID（参与 seed 派生，不同 biome 同 seed 布局不同）
 */
export function generateLayout(seed: string, biomeId: number): LayoutSnapshot {
  return generateInternal(seed, biomeId).layout;
}

/** 生成副本规格（含给实例 world 的 SpawnZone[] + 出生/传送/ BOSS 位）。 */
export function buildDungeonSpec(seed: string, biomeId: number): DungeonSpec {
  return generateInternal(seed, biomeId).spec;
}

/** 由服务端三元组计算实例 seed（转发常量模块，C-Dgn-1 单一来源）。 */
export function computeInstanceSeed(
  serverTick: number,
  entranceId: number,
  partyTag: number | string,
): bigint {
  return instanceSeed(serverTick, entranceId, partyTag);
}

/** 确定性布局用的 Rng 流入口（generateLayout 内部使用；同 seed ⇒ 同流，D9）。 */
export function layoutRng(seed: string): Rng {
  return new Rng(`layout:${seed}`);
}
