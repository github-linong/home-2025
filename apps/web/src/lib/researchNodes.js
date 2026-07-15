/** Five breakthrough research nodes currently in plot focus. */

/**
 * @typedef {{
 *   name: string,
 *   axis: string,
 *   lead: string,
 *   mission: string,
 *   note: string
 * }} ResearchNode
 */

/**
 * Plot-salient “科研制高点” — agriculture, environment, biomed, military meds.
 * @type {ResearchNode[]}
 */
export const RESEARCH_NODES = [
  {
    name: "第九种植中心（原第九中心）",
    axis: "农业现代化",
    lead: "张三（负责人）· 张陶（推广种植专家）",
    mission: "实验室成果 → 可推广种子；盯发芽率、二元素稳定性、攻击性戕进化比率",
    note:
      "基地农业现代化与安全区粮食升级主阵地；亦是夏青获得种植技术支持的核心通道。",
  },
  {
    name: "五十号山试验区",
    axis: "环境修复",
    lead: "夏青（管理者）· 张何（实验）",
    mission: "红色戕草连续催熟试验：抬高大棚戕浓度促结籽，把污染土降至安全含量",
    note:
      "决定污染地能否快速复耕；为周边领地扩展提供环境基础。地理上贴四十九号山东侧。",
  },
  {
    name: "肝脏功能进化研究",
    axis: "生物医学",
    lead: "唐怀（样本）· 晖三军方 · 红一科研",
    mission: "唐怀体内三种特殊酶的基因定位与克隆；国内十二家顶尖实验室联合攻关",
    note:
      "一旦突破，可带动解毒、免疫类药与功能食品规模化生产。",
  },
  {
    name: "恢复力进化研究",
    axis: "创伤修复",
    lead: "张十（样本）· 基地顶尖科研团队",
    mission: "解析张十体内「恢复因子」，开发快速创伤修复技术",
    note:
      "军事与民用急救核心技术，稀缺度极高；与颐6 等材料线索交叉。",
  },
  {
    name: "红一军团卫生部药剂研发",
    axis: "军用医疗",
    lead: "纪黎等（部门协作线）",
    mission: "结合最新生物技术，研发前线用降戕剂与急救药剂",
    note:
      "直接服务红军编制部队战场生存率；军用科研重要节点。",
  },
];

/**
 * Breakthrough stakes that flow from the five nodes.
 * @type {{ name: string, via: string, note: string }[]}
 */
export const RESEARCH_OUTPUT_ROWS = [
  {
    name: "可推广绿灯 / 安全种质",
    via: "第九种植中心",
    note: "发芽率、二元素稳定、攻击性戕进化比率是量化门槛",
  },
  {
    name: "污染土安全阈值复垦",
    via: "五十号山试验区",
    note: "红色戕草催熟 → 吸附 / 降戕路径可规模化复用",
  },
  {
    name: "解毒 · 免疫药 / 功能食品",
    via: "肝脏功能进化研究",
    note: "以唐怀三酶基因为药源与食源的上游平台",
  },
  {
    name: "快速创伤修复技术",
    via: "恢复力进化研究",
    note: "恢复因子基因层解析是军民用急救的制高点",
  },
  {
    name: "前线降戕剂与急救药剂",
    via: "红一军团卫生部",
    note: "把生物技术压成可配发给红军编制的战场方案",
  },
];

/**
 * @param {ResearchNode[]} nodes
 */
export function assertResearchNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length !== 5) {
    throw new Error("research nodes must be the five plot-critical points");
  }
  const names = new Set();
  for (const node of nodes) {
    if (!node.name || !node.axis || !node.lead || !node.mission || !node.note) {
      throw new Error(`invalid research node: ${JSON.stringify(node)}`);
    }
    if (names.has(node.name)) {
      throw new Error(`duplicate research node: ${node.name}`);
    }
    names.add(node.name);
  }
  const required = ["第九种植", "五十号山", "肝脏", "恢复力", "红一"];
  for (const key of required) {
    if (![...names].some((n) => n.includes(key))) {
      throw new Error(`missing research node containing: ${key}`);
    }
  }
}
