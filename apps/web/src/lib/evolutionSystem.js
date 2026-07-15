/** Evolution-system dimensions and ability tracks for the novel setting board. */

/**
 * @typedef {{ title: string, summary: string, detail: string }} EvolutionCard
 * @typedef {{ name: string, note: string }} NamedNote
 */

/**
 * Five complementary grading lenses.
 * Ability *tracks* (力量、弹力、肺活量…) are catalogued separately below —
 * the “ten-level ruler” applies across those measurable tracks.
 * @type {EvolutionCard[]}
 */
export const EVOLUTION_DIMENSION_CARDS = [
  {
    title: "1 · 十级能力标尺",
    summary: "可检测的具体能力项目统一按 1–10 级划分，级高者强。",
    detail:
      "力量、速度、耐力、弹力、爆发力、肺活量，以及视觉、听觉、嗅觉、味觉、触觉各感触项目，评定时都可用十级尺子。广播、任务评级、战队编成与领主安保权限，多数直接引用这一标尺。",
  },
  {
    title: "2 · 戕进化危险分级",
    summary: "针对可能威胁人类的「戕进化」，划分为高、中、低三档。",
    detail:
      "并非所有进化都是正面增强。高 / 中 / 低危险等级用于评估生物威胁程度，并指导隔离、灭灾与管控（如五十号山危险区阶段性降级实验）。",
  },
  {
    title: "3 · 脑域进化双维度",
    summary: "脑域专修者按一级、二级、三级分档，再按功能区归档。",
    detail:
      "基础功能区：智力、观察力、记忆力、思维力、情绪捕捉。后文还讨论想象力，并把「同频」列作新增脑域能力。一人可多功能并进；三级且多类兼修者极为稀少。",
  },
  {
    title: "4 · 木桶理论（均衡 / 不均衡）",
    summary: "多数人进化后各项机能整体提升约一倍，属「均衡进化」。",
    detail:
      "约 0.15% 的人会在部分单项上继续狂飙，形成长板或短板：账面单项惊人，实际战力提升有限，甚至因躯体承受不住而受伤。",
  },
  {
    title: "5 · 感触类战力模型",
    summary: "视觉、嗅觉、听觉、味觉、触觉五类感触进化，单靠感官不够。",
    detail:
      "若基础格斗与枪法不上乘，很难成为主力。唯有感官达顶级，并配合扎实实战能力，才有机会担任队长或核心队员。磁觉一度悬在「脑域 / 触感」归类争议中，见专项。",
  },
];

/**
 * Locomotion / kinetic body tracks (all can take 1–10 grades).
 * @type {NamedNote[]}
 */
export const EVOLUTION_BODY_TRACKS = [
  { name: "力量型", note: "肌力输出与负重；开荒劳作、近战压制的常用公开身份" },
  { name: "速度型", note: "位移与追逐；顶级速度进化者可压过同阶力量型短打" },
  { name: "耐力型", note: "长时间劳动与抗压续航" },
  { name: "弹力型", note: "弹跳、缓冲与爆发位移；可与力量双系并进（如霍准：五级弹力 + 七级力量）" },
  { name: "爆发力型", note: "瞬间起手与短时极限输出；特战编成中常见" },
];

/**
 * Organ / metabolism tracks that bottleneck real combat and farming life.
 * @type {NamedNote[]}
 */
export const EVOLUTION_ORGAN_TRACKS = [
  {
    name: "肺活量（肺）",
    note: "高级者可用特殊呼吸法超量供氧，使全身肌肉极致协调；持久战与游泳战占优（如妍龙；其部下汪曼等同出蛟龙特战体系）",
  },
  {
    name: "胃肠 / 消化代谢（胃）",
    note: "决定能量摄取上限：高强度用进化能力极耗卡路里，胃肠若跟不上则瘦弱、战力打折；生肉耐受亦看胃肠进化与修复",
  },
  {
    name: "骨骼与皮肤韧性",
    note: "药浴与药剂常用于修复损伤、拉近自身更佳状态；不等于直接抬高十级上限",
  },
];

/**
 * Sense tracks.
 * @type {NamedNote[]}
 */
export const EVOLUTION_SENSE_TRACKS = [
  { name: "视觉型", note: "远程侦察、射击校射、微表情与伪装识别；可接脑神经信息处理优势" },
  { name: "听觉型", note: "远距预警、定位潜行与通讯监听" },
  { name: "嗅觉型", note: "追踪、毒物与血迹辨识；进化动物普遍很强" },
  { name: "味觉型", note: "水质、药剂与食物风险快速筛查" },
  { name: "触觉型", note: "震动、温度与接触反馈入作战链" },
];

/**
 * Special / contested classifications.
 * @type {NamedNote[]}
 */
export const EVOLUTION_SPECIAL_TRACKS = [
  {
    name: "磁觉",
    note: "感知生物电流与磁场变动的「第六感」；可辨环境、动植物乃至戕 / 颐相关异常。归类曾摇摆于脑域与触感之间；后文有分型讨论（如 C 类）",
  },
];

/**
 * Multi-system rarity.
 * @type {NamedNote[]}
 */
export const EVOLUTION_MULTI_SYSTEM = [
  { name: "单系 / 双系", note: "天灾年间占多数" },
  { name: "三系", note: "占少数；公开三系常被重点关注甚至实验风险" },
  { name: "四系", note: "极为稀有（夏青：力量 + 视觉 + 听觉 + 磁觉）" },
  { name: "五系", note: "在四系基础上再激发脑域时可能达成；研究侧争夺焦点" },
];

/** Brain-domain function archives (core five + later additions). */
/** @type {NamedNote[]} */
export const EVOLUTION_BRAIN_FUNCS = [
  { name: "智力", note: "综合智识与学习效率" },
  { name: "观察力", note: "细微环境与线索捕捉；可与高级视觉叠加" },
  { name: "记忆力", note: "知识、地图与协议条款的长时存储" },
  { name: "思维力", note: "推演、谋划与战场决策" },
  { name: "情绪捕捉", note: "读人 / 读兽情绪与意图" },
  { name: "想象力", note: "后文纳入讨论的脑域能力种类" },
  { name: "同频", note: "专题论证后增列的第六类脑域能力" },
];

/** 戕-evolution danger tiers. */
/** @type {NamedNote[]} */
export const EVOLUTION_DANGER_TIERS = [
  { name: "高危险", note: "需优先隔离、联防灭灾与严格管控" },
  { name: "中危险", note: "限制活动范围，配合检测与阶段性降级实验" },
  { name: "低危险", note: "可在监控下利用或暂缓清剿" },
];

/** Underlying rules tying tracks together. */
/** @type {NamedNote[]} */
export const EVOLUTION_RULE_ROWS = [
  {
    name: "颐进化与 DNA",
    note: "天灾前哪方面突出，颐进化就更可能往哪方面发展；基因被颐元素激活休眠/低表达片段",
  },
  {
    name: "能量守恒",
    note: "动用进化能力的高强度活动必须大量进食；能量负平衡会啃脂肪再啃肌肉，导致战力崩盘",
  },
  {
    name: "绿灯食疗",
    note: "高颐低戕食物是进化者补能与降戕提颐的首选；胃肠能力跟不上则浪费上限",
  },
  {
    name: "初级 / 高级",
    note: "多系、高等级公开身份影响地位（如金色身份牌）；也更容易被研究机构盯上",
  },
];

/** Xiaqing ability line (public vs hidden). */
/** @type {NamedNote[]} */
export const EVOLUTION_XIAQING_LINE = [
  { name: "对外公开", note: "曾长期报四级力量型，以自保" },
  {
    name: "实测隐藏",
    note: "早期已是力量 + 视觉 + 听觉三系高级；后确认磁觉，成为四系；脑域若激发则可问鼎五系",
  },
  {
    name: "等级侧面",
    note: "力量曾测六级档、听觉七级、视觉九级（随治疗与颐戕调控会变）",
  },
  { name: "实战特长", note: "狙击手技能、领地管理、跨物种协议与科研协作" },
];

/**
 * @param {EvolutionCard[]} cards
 * @param {NamedNote[]} bodyTracks
 * @param {NamedNote[]} organTracks
 */
export function assertEvolutionSystem(cards, bodyTracks = [], organTracks = []) {
  if (!Array.isArray(cards) || cards.length < 5) {
    throw new Error("evolution system needs five dimension cards");
  }
  for (const card of cards) {
    if (!card.title || !card.summary || !card.detail) {
      throw new Error(`invalid evolution card: ${JSON.stringify(card)}`);
    }
    if (/等(?!级)|等等/.test(card.summary) || /等(?!级)|等等/.test(card.detail)) {
      throw new Error(`avoid vague 等 in: ${card.title}`);
    }
  }
  if (bodyTracks.length) {
    for (const need of ["力量型", "弹力型", "速度型"]) {
      if (!bodyTracks.some((t) => t.name.includes(need.replace("型", "")))) {
        throw new Error(`missing body track: ${need}`);
      }
    }
  }
  if (organTracks.length) {
    if (!organTracks.some((t) => t.name.includes("肺"))) {
      throw new Error("missing 肺活量 / 肺 track");
    }
    if (!organTracks.some((t) => t.name.includes("胃") || t.name.includes("胃肠"))) {
      throw new Error("missing 胃肠 / 胃 track");
    }
  }
}
