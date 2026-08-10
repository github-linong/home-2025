/**
 * dungeon-gen.ts — 地牢生成（E3 / 系统⑤，纪律 A）
 *
 * S3.1 确定性种子生成：run_seed + biome_id → 房间图 + SpawnPoint[] + 资源点 + 楼层序列。
 * S3.2 SpawnPoint[] 输出契约：只读实例（pos/enemy_type_id/wave/count），纪律 A（⑧只读不调）。
 * S3.3 布局快照序列化：LayoutSnapshot（JSON 低频）。
 *
 * 纪律 A（关键）：本模块只产出数据（LayoutSnapshot），不依赖 ⑧ enemy-ai 运行时；
 *   反向亦同（⑤↔⑧ 单向：⑧ 读 ⑤ 输出，不 import 本模块运行时）。
 *   因此本文件仅 `import type`（类型）与 `import`（纯数据原型表），无任何运行时函数相互依赖。
 *
 * 确定性（C7）：生成流完全由 hashString64(seed) + biomeId 派生的 Rng 决定，
 *   不引入 Date / Math.random / 全局可变状态 → 同 seed+biome 必产同 LayoutSnapshot。
 */

import {
  ENEMY_PROTOTYPES,
  RESOURCE_PROTOTYPES,
  type SpawnPoint,
  type Vec2,
} from "./types.ts";
import { Rng, hashString64 } from "./rng.ts";

/** 楼层资源点（仅数据描述，供 E3 输出）。 */
export interface ResourceNode {
  readonly pos: Vec2;
  readonly resourceId: string;
}

/**
 * 布局快照（S3.3 序列化契约，JSON 低频）。
 * 确定性：同 seed + 同 biome → 同 LayoutSnapshot（C7 golden 对齐）。
 */
export interface LayoutSnapshot {
  readonly seed: string;
  readonly biomeId: number;
  readonly spawnPoints: readonly SpawnPoint[];
  readonly resourceNodes: readonly ResourceNode[];
  readonly floorSequence: readonly number[];
}

/* ============================================================================
 * D1–D3 数字裁定（Tunable generation defaults）
 * ----------------------------------------------------------------------------
 * 本区块集中管理地牢生成的全部「魔法数字」，改为具名常量 + 设计理由（数字裁定）。
 * 修改任一默认值即视为一次平衡决策，应在 PR 描述里说明依据；
 * 若改动导致 LayoutSnapshot 哈希变化，须重跑 determinism.test.ts 并按需重锁
 * GOLDEN_LAYOUT_HASH（参见该测试注释）。本 sprint 仅做「命名 + 注释」，
 * 不改动任何数值（除非明显失衡/有 bug）。
 *
 * 抽流约定（见 rng.ts）：
 *   - Rng.nextInt(min,max) 为闭区间 [min,max]（两端含）。
 *   - 注入判定复用 grunt_swarm 槽那单次 nextFloat() 抽流，按累积阈值分区，
 *     绝不新增 rng 抽流 → 与「仅 brute / 仅 brute+bomber」先例逐位一致（确定性 intact）。
 * ========================================================================== */

/** 地牢网格尺寸（以 tile 计；世界 px = tile × TILE_PX）。坐标在此范围内取整数 tile 再 ×TILE_PX。 */
const GRID_W = 64;
const GRID_H = 40;

/** 每 tile 像素数；与 types.ts「32px tile」全项目一致。网格坐标 × 此值落地为世界 px。 */
const TILE_PX = 32;

/** 单层变体索引上界加成：每层 variant ∈ [0, biomeId + FLOOR_VARIANT_MAX_BONUS]。
 *  +2 让每个 biome 在同 seed 下仍可派生数个确定布局变体（biomeId=0 → 3 变体，=1 → 4 变体…）。
 *  调大 → 同 biome 内布局多样性更高；调小 → 更收敛。 */
const FLOOR_VARIANT_MAX_BONUS = 2;

/** 楼层数 [min,max]（闭区间，nextInt 含两端）。3 层保单次会话可控；5 层封顶总波次/遭遇数。 */
const FLOOR_COUNT_MIN = 3;
const FLOOR_COUNT_MAX = 5;

/** 每层波数 [min,max]（闭区间）。1 波用于短层（opener 轻量）；至多 3 波逐步加压。
 *  与楼层数相乘 → 总波次落在 ~3–15。 */
const WAVES_PER_FLOOR_MIN = 1;
const WAVES_PER_FLOOR_MAX = 3;

/** 单个刷怪点的敌人数 [min,max]（闭区间）。2 保证每点有存在感；6 为单 tile 簇密度上限，避免过载。
 *  注意：这是「每刷怪点」而非「每波总数」。 */
const SPAWN_COUNT_MIN = 2;
const SPAWN_COUNT_MAX = 6;

/** 资源点数量 [min,max]（闭区间）。最少 2 保证有拾取；最多 5 避免杂乱。与楼层/波次数无关。 */
const RESOURCE_NODE_MIN = 2;
const RESOURCE_NODE_MAX = 5;

/** bomber_imp / gunner_imp 注入的最低波次（wave >= 此值才注入；等价于原 wave>1）。
 *  锁定 wave 1 为纯 grunt_swarm opener：保留温和开场，并稳定 playtest/world 哈希（wave-1 实体集不变）。 */
const INJECTED_ENEMY_MIN_WAVE = 2;

/* ── 注入概率（确定性低密度；均不计入随机池，控制出现频率以保原型占比意图）── */

/** elite_warden 槽被替换为远程施法者 caster_ember 的概率。
 *  仅限 warden 槽 → 永不替代 grunt_swarm / boss_emberlord（保留 opener/boss 身份），也不增精英总数。
 *  ~20% 使其成为偶发威胁而非常驻。 */
const CASTER_INJECTION_CHANCE = 0.2;

/** grunt_swarm 槽被替换为近战冲锋者 brute_charger 的概率（r < BRUTE_CUM）。
 *  约 20% → 大致每若干次 grunt 抽中出现一次，是频繁但不主导的近战变体；
 *  绝不注入精英/boss，不增精英/boss 计数。 */
const BRUTE_INJECTION_CHANCE = 0.2;

/** grunt_swarm 槽在 wave>=INJECTED_ENEMY_MIN_WAVE 时被替换为自爆兵 bomber_imp 的概率（BRUTE_CUM ≤ r < BOMBER_CUM）。
 *  约 15% → 情境性 AOE 威胁；门控到 wave≥2 以保留 wave-1 纯 grunt 开场；复用单次 nextFloat 抽流。 */
const BOMBER_INJECTION_CHANCE = 0.15;

/** grunt_swarm 槽在 wave>=INJECTED_ENEMY_MIN_WAVE 时被替换为飞行枪手 gunner_imp 的概率（BOMBER_CUM ≤ r < GUNNER_CUM）。
 *  约 12% → 比 brute/bomber 更稀有；同样门控到 wave≥2 保留 opener；复用单次 nextFloat 累积阈值抽流。 */
const GUNNER_INJECTION_CHANCE = 0.12;

/** 累积阈值（由上述概率派生；浮点求和已验证 == 字面量 0.35 / 0.47，确定性逐位一致）。
 *  分区：r < BRUTE_CUM → brute；BRUTE_CUM ≤ r < BOMBER_CUM → bomber；BOMBER_CUM ≤ r < GUNNER_CUM → gunner；否则 grunt。
 *  调上面任一 *_CHANCE 时本阈值自动跟随，无需手改（保持同步）。 */
const BRUTE_CUM = BRUTE_INJECTION_CHANCE; // 0.2
const BOMBER_CUM = BRUTE_INJECTION_CHANCE + BOMBER_INJECTION_CHANCE; // 0.35
const GUNNER_CUM = BOMBER_CUM + GUNNER_INJECTION_CHANCE; // 0.47

/** 注入型敌人 ID（确定性低密度注入，不计入随机池）。集中声明便于维护与同步。 */
const INJECTED_ENEMY_IDS: readonly string[] = [
  "caster_ember",
  "brute_charger",
  "bomber_imp",
  "gunner_imp",
];

/**
 * 确定性地牢生成。
 * @param seed  人类可读 run_seed（任意字符串；经 hashString64 规整为 uint64）。
 * @param biomeId 生物群系 ID，参与 seed 派生，保证不同 biome 同 seed 仍不同布局。
 */
export function generateLayout(seed: string, biomeId: number): LayoutSnapshot {
  // 关键：biomeId 进入种子派生，确保 (seed, biome) 二元组决定整条随机流。
  const rng = new Rng(hashString64(`${seed}:${biomeId}`));

  const floorCount = rng.nextInt(FLOOR_COUNT_MIN, FLOOR_COUNT_MAX);
  const floorSequence: number[] = [];
  for (let f = 0; f < floorCount; f += 1) {
    // 每层一个变体索引（0..biomeId+FLOOR_VARIANT_MAX_BONUS，确定性）。
    floorSequence.push(rng.nextInt(0, biomeId + FLOOR_VARIANT_MAX_BONUS));
  }

  // 基础刷怪池：排除注入型敌人（caster_ember / brute_charger / bomber_imp / gunner_imp），
  // 维持 grunt/elite/boss 三类的相对分布不变。注入型敌人仅以「确定性低密度」方式注入
  // （见下方各自槽位替换），不计入随机池，控制其出现频率，避免破坏各原型的设计占比意图。
  const enemyTypeIds = Object.keys(ENEMY_PROTOTYPES).filter(
    (id) => !INJECTED_ENEMY_IDS.includes(id),
  );
  const spawnPoints: SpawnPoint[] = [];
  let wave = 0;
  for (let f = 0; f < floorCount; f += 1) {
    const wavesThisFloor = rng.nextInt(WAVES_PER_FLOOR_MIN, WAVES_PER_FLOOR_MAX);
    for (let w = 0; w < wavesThisFloor; w += 1) {
      wave += 1;
      const rolled = enemyTypeIds[rng.nextInt(0, enemyTypeIds.length - 1)];
      // 确定性低密度注入（理由见上方各 *_INJECTION_CHANCE 常量注释）：
      // - caster_ember：仅当本槽为 elite_warden 时，以 CASTER_INJECTION_CHANCE 概率替换为远程施法者；
      //   不替代 boss_emberlord / grunt_swarm；不新增精英总数；rng 由 seed 派生，无 Date/Math.random。
      // - brute_charger：仅当本槽为 grunt_swarm 时，以 BRUTE_CUM 累积阈值（=BRUTE_INJECTION_CHANCE）替换为冲锋者；
      //   不替代 elite_warden / boss_emberlord；rng 由 seed 派生，保持可控频率。
      // - bomber_imp / gunner_imp：仅当本槽为 grunt_swarm 且 wave>=INJECTED_ENEMY_MIN_WAVE 时，
      //   复用 grunt 槽那单次 nextFloat 按累积阈值（BOMBER_CUM / GUNNER_CUM）替换为自爆兵/枪手；
      //   仅 wave≥2 注入（wave 1 绝不注入，保留纯 grunt opener 保证）；
      //   rng 抽流与「仅 brute」逐位一致（确定性 intact）。无 Date/Math.random。
      let enemyTypeId: string;
      if (rolled === "elite_warden") {
        enemyTypeId = rng.nextBool(CASTER_INJECTION_CHANCE) ? "caster_ember" : rolled;
      } else if (rolled === "grunt_swarm") {
        const r = rng.nextFloat();
        if (r < BRUTE_CUM) {
          enemyTypeId = "brute_charger";
        } else if (wave >= INJECTED_ENEMY_MIN_WAVE && r < BOMBER_CUM) {
          enemyTypeId = "bomber_imp";
        } else if (wave >= INJECTED_ENEMY_MIN_WAVE && r < GUNNER_CUM) {
          enemyTypeId = "gunner_imp";
        } else {
          enemyTypeId = "grunt_swarm";
        }
      } else {
        enemyTypeId = rolled;
      }
      const count = rng.nextInt(SPAWN_COUNT_MIN, SPAWN_COUNT_MAX);
      const pos: Vec2 = {
        x: rng.nextInt(0, GRID_W - 1) * TILE_PX,
        y: rng.nextInt(0, GRID_H - 1) * TILE_PX,
      };
      spawnPoints.push({ pos, enemyTypeId, wave, count });
    }
  }

  // ── 波次推进（progression）：保证 wave 1 至少含一个 grunt_swarm ──
  // 确定性（无新增随机源）：仅当 wave 1 无 grunt_swarm 时，把「首个 wave-1 刷怪点」的
  // enemyTypeId 改写为 grunt_swarm（保留其 pos/wave/count），确保 opener 是温和杂兵波，
  // 且满足 playtest-core-loop 的 mkWorld 对 grunt 的硬依赖。不引入随机性。
  const firstWave1 = spawnPoints.find((sp) => sp.wave === 1);
  if (
    firstWave1 &&
    !spawnPoints.some((sp) => sp.wave === 1 && sp.enemyTypeId === "grunt_swarm")
  ) {
    spawnPoints[spawnPoints.indexOf(firstWave1)] = {
      ...firstWave1,
      enemyTypeId: "grunt_swarm",
    };
  }

  const resourceIds = Object.keys(RESOURCE_PROTOTYPES);
  const resourceNodes: ResourceNode[] = [];
  const resCount = rng.nextInt(RESOURCE_NODE_MIN, RESOURCE_NODE_MAX);
  for (let i = 0; i < resCount; i += 1) {
    resourceNodes.push({
      pos: {
        x: rng.nextInt(0, GRID_W - 1) * TILE_PX,
        y: rng.nextInt(0, GRID_H - 1) * TILE_PX,
      },
      resourceId: resourceIds[rng.nextInt(0, resourceIds.length - 1)],
    });
  }

  return { seed, biomeId, spawnPoints, resourceNodes, floorSequence };
}
