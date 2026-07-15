/** 戕 / 颐 measurement grades, synthetic subtypes, and derived products. */

/**
 * @typedef {{ name: string, note: string }} NamedNote
 * @typedef {{ name: string, range: string, effect: string }} GradeRow
 */

/** Core dual-element primer. */
/** @type {NamedNote[]} */
export const QIANG_YI_CORE = [
  {
    name: "戕",
    note: "恶性倾向：失控、狂暴、恶性变异；人类不能从戕中取能，摄入只添伤害",
  },
  {
    name: "颐",
    note: "良性倾向：稳定进化与作物生长；属于颐进化的人类以颐为主要能量来源",
  },
  {
    name: "对立统一",
    note: "二者并行维持生态平衡；地理与水系浓度不同，比例决定进化方向与食品品质",
  },
];

/**
 * Food / blood numeric thresholds (public early–mid yardsticks).
 * 戕常用 ‰；颐常用绝对含量刻度（文中亦曾用万分之口径描述同源规则）。
 * @type {GradeRow[]}
 */
export const QIANG_YI_CONTENT_GRADES = [
  {
    name: "绿灯食物门槛",
    range: "戕 < 5‰，且颐偏高",
    effect: "现阶段人类补能首选；高颐低戕才易吸收",
  },
  {
    name: "高颐元素植物 / 肉类",
    range: "颐 ≥ 5（常见写法）",
    effect: "可支撑特级营养液原料；低于 5 不再算高颐，即使戕仍低也只能做普通营养液",
  },
  {
    name: "普通营养液",
    range: "戕 < 5‰，颐 ≤ 5",
    effect: "快速补体力；远途任务标配",
  },
  {
    name: "特级营养液",
    range: "戕 < 5‰，颐 5–10",
    effect: "更快补能，并加速损伤修复",
  },
  {
    name: "颐元素刺激液",
    range: "戕 < 5‰，颐 > 10",
    effect: "补能修伤，并短时大幅抬升战力（文中常写作「翻倍」量级）；有副作用，稀缺高价",
  },
];

/**
 * Named synthetic / extracted 颐N · 戕N subtypes with special effects.
 * @type {GradeRow[]}
 */
export const QIANG_YI_SYNTH_ROWS = [
  {
    name: "颐6（恢复因子）",
    range: "自血液等提取的颐合成组分",
    effect: "可制成抗过敏药剂；张十母子血样曾被提取颐6用于张三抗敏与调养",
  },
  {
    name: "颐7",
    range: "高颐生物体内天然颐合成元素（如颐蛇，体内颐含量约 7）",
    effect:
      "目前无法人工合成。改善胃肠功能，兼具生物屏障、抗肿瘤、增强免疫、抗衰老；宜提取入药而非纯当肉吃",
  },
  {
    name: "香椿类颐合成气体",
    range: "特定进化椿树芽释放",
    effect: "可刺激肾上腺素、性激素、胰岛素分泌；药用研究价值高，亦易招虫与暴露领地风险",
  },
  {
    name: "戕7 / 戕合成毒",
    range: "对应高戕生物（如戕蛇）体内戕合成组分",
    effect: "与颐7数字对应的恶性侧：剧毒、污染水土；灭灾时常被点名严控",
  },
];

/** Key props / phenomena. */
/** @type {NamedNote[]} */
export const QIANG_YI_PROP_ROWS = [
  {
    name: "戕雨 / 戕雪",
    note: "周期抬升环境戕浓度；雨后勿立刻收颐石，需等超量戕蒸发回常态",
  },
  {
    name: "颐石",
    note: "散发颐元素，驱除以石为核心约直径两米球域内的戕；需保护壳，移动/淋雨时防护面具要戴够数秒启动时间",
  },
  {
    name: "无污染泉水",
    note: "灌溉提质、药浴与栽培刚需；暴露风险极高，常驱动势力觊觎",
  },
  {
    name: "降戕剂",
    note: "降低体内戕含量；须按检测滴定，过量会打破原有平衡",
  },
  {
    name: "黄灯 / 红灯",
    note: "戕偏高食物与生物的风险色标；成年期戕颐平衡后调理更难（如红灯兔）",
  },
  {
    name: "高颐粪肥",
    note: "白蚁粪（颐 > 10）、蟑螂粪（约颐 6.8）等可改土或供肥；活体异地难养，常买粪不买虫",
  },
];

/**
 * @param {GradeRow[]} synth
 * @param {GradeRow[]} grades
 */
export function assertQiangYiCatalog(synth, grades) {
  if (!synth.some((r) => r.name.includes("颐6"))) {
    throw new Error("missing 颐6");
  }
  if (!synth.some((r) => r.name.includes("颐7"))) {
    throw new Error("missing 颐7");
  }
  if (!grades.some((r) => r.name.includes("刺激液"))) {
    throw new Error("missing stimulant fluid grade");
  }
}
