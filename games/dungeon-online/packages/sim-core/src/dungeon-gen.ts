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

/** 地牢网格尺寸（tile=32px；坐标以 tile 计，落地乘 32）。 */
const GRID_W = 64;
const GRID_H = 40;

/**
 * 确定性地牢生成。
 * @param seed  人类可读 run_seed（任意字符串；经 hashString64 规整为 uint64）。
 * @param biomeId 生物群系 ID，参与 seed 派生，保证不同 biome 同 seed 仍不同布局。
 */
export function generateLayout(seed: string, biomeId: number): LayoutSnapshot {
  // 关键：biomeId 进入种子派生，确保 (seed, biome) 二元组决定整条随机流。
  const rng = new Rng(hashString64(`${seed}:${biomeId}`));

  const floorCount = rng.nextInt(3, 5);
  const floorSequence: number[] = [];
  for (let f = 0; f < floorCount; f += 1) {
    // 每层一个变体索引（0..biomeId+2，确定性）。
    floorSequence.push(rng.nextInt(0, biomeId + 2));
  }

  // 基础刷怪池（排除 caster_ember、brute_charger、bomber_imp、gunner_imp）：维持 grunt/elite/boss 三类的相对分布不变。
  // caster_ember / brute_charger / bomber_imp / gunner_imp 均仅以「确定性低密度」方式注入（见下方各自槽位替换），
  // 不计入随机池，控制其出现频率，避免破坏各原型的设计占比意图。
  const enemyTypeIds = Object.keys(ENEMY_PROTOTYPES).filter(
    (id) => id !== "caster_ember" && id !== "brute_charger" && id !== "bomber_imp" && id !== "gunner_imp",
  );
  const spawnPoints: SpawnPoint[] = [];
  let wave = 0;
  for (let f = 0; f < floorCount; f += 1) {
    const wavesThisFloor = rng.nextInt(1, 3);
    for (let w = 0; w < wavesThisFloor; w += 1) {
      wave += 1;
      const rolled = enemyTypeIds[rng.nextInt(0, enemyTypeIds.length - 1)];
      // caster_ember：确定性低密度注入 —— 仅当本槽为 elite_warden 时，以 20% 概率替换为远程施法者。
      // 不替代 boss_emberlord / grunt_swarm；不新增精英总数；rng 由 seed 派生，无 Date/Math.random。
      // brute_charger：确定性低密度注入 —— 仅当本槽为 grunt_swarm 时，以 20% 概率替换为激进冲锋者。
      // 不替代 elite_warden / boss_emberlord；rng 由 seed 派生，无 Date/Math.random；保持可控频率。
      // bomber_imp（自爆兵）：确定性低密度注入 —— 仅当本槽为 grunt_swarm 且 wave>1 时，以 15% 概率
      //   替换为自爆兵。rng 抽流与「仅 brute」先例逐位一致（复用 grunt 槽那单次 nextFloat）：
      //   r<0.2 → brute_charger；0.2≤r<0.35 → bomber_imp（=15% of grunt rolls）；否则 grunt_swarm。
      //   仅 wave≥2 注入 bomber，wave 1 绝不注入（保留「wave 1 至少含一 grunt_swarm」保证，见下方）。
      //   无 Date/Math.random；整体确定性 intact。
      // gunner_imp（M16 枪手）：确定性低密度注入 —— 仅当本槽为 grunt_swarm 且 wave>1 时，以 ~12% 概率
      //   （0.35≤r<0.47）替换为飞行弹道枪手。复用 grunt 槽那单次 nextFloat（不新增 rng 抽流，rng 序列
      //   与「仅 brute/bomber」先例逐位一致）：r<0.2→brute；0.2≤r<0.35→bomber；0.35≤r<0.47→gunner；
      //   否则 grunt。仅 wave≥2 注入 gunner，wave 1 绝不注入（保留 wave-1 grunt 保证，见下方）；
      //   故 playtest-core-loop 220-tick 窗口（未抵达含 gunner 的 wave≥2）实体集不变，GOLDEN_PLAYTEST_HASH
      //   稳定；但其改变了部分 wave≥2 grunt 的 enemyTypeId → 布局哈希随之改变（确定性 intact，重锁见
      //   determinism.test.ts）。无 Date/Math.random。
      let enemyTypeId: string;
      if (rolled === "elite_warden") {
        enemyTypeId = rng.nextBool(0.2) ? "caster_ember" : rolled;
      } else if (rolled === "grunt_swarm") {
        const r = rng.nextFloat();
        if (r < 0.2) {
          enemyTypeId = "brute_charger";
        } else if (wave > 1 && r < 0.35) {
          enemyTypeId = "bomber_imp";
        } else if (wave > 1 && r < 0.47) {
          enemyTypeId = "gunner_imp";
        } else {
          enemyTypeId = "grunt_swarm";
        }
      } else {
        enemyTypeId = rolled;
      }
      const count = rng.nextInt(2, 6);
      const pos: Vec2 = {
        x: rng.nextInt(0, GRID_W - 1) * 32,
        y: rng.nextInt(0, GRID_H - 1) * 32,
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
  const resCount = rng.nextInt(2, 5);
  for (let i = 0; i < resCount; i += 1) {
    resourceNodes.push({
      pos: {
        x: rng.nextInt(0, GRID_W - 1) * 32,
        y: rng.nextInt(0, GRID_H - 1) * 32,
      },
      resourceId: resourceIds[rng.nextInt(0, resourceIds.length - 1)],
    });
  }

  return { seed, biomeId, spawnPoints, resourceNodes, floorSequence };
}
