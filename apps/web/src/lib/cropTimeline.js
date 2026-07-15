/** Crop / farming chronology for the novel setting board. */

/**
 * @typedef {'grain' | 'veg' | 'specialty' | 'tech'} CropKind
 * @typedef {{
 *   yearLabel: string,
 *   stage: string,
 *   event: string,
 *   impact: string,
 *   kinds: CropKind[],
 * }} CropTimelineEvent
 */

/** @type {{ id: CropKind | 'all', label: string }[]} */
export const CROP_TIMELINE_TABS = [
  { id: "all", label: "全部" },
  { id: "grain", label: "粮油棉" },
  { id: "veg", label: "蔬果" },
  { id: "specialty", label: "特种作物" },
  { id: "tech", label: "农技基建" },
];

/** @type {{ id: CropKind, title: string, examples: string, notes: string }[]} */
export const CROP_KIND_CARDS = [
  {
    id: "grain",
    title: "粮油棉主粮线",
    examples: "水稻（黄灯/绿灯、J-2、BS-6 等）、小麦、玉米、黄豆/绿豆、棉花、向日葵",
    notes: "从试种、二茬到联盟育秧与优质稻种提纯；核心是压低戕含量、稳住绿灯品质",
  },
  {
    id: "veg",
    title: "蔬果日常线",
    examples: "黄瓜、茄子、番茄、萝卜、第二茬蔬菜、百香果等",
    notes: "梯田密植试种 + 交换菜园分流；部分黄灯种子靠泉水浸泡与密度控制应对戕雨",
  },
  {
    id: "specialty",
    title: "特种/高颐线",
    examples: "绿灯香椿、高颐菠菜、紫薯等戕敏感作物",
    notes: "依赖高颐土壤、无污染泉水与颐石全程隔戕；是「科学种田」辨识度最高的品类",
  },
  {
    id: "tech",
    title: "农技与基建线",
    examples: "泉水灌溉、羊耕犁、防虫网大棚、颐石大棚、人力水车、水肥一体、隐蔽山谷育秧",
    notes: "没有防护与微环境，绿灯体系就扩不出去；技术跃迁常与联盟协作同步",
  },
];

/**
 * @type {CropTimelineEvent[]}
 */
export const CROP_TIMELINE_EVENTS = [
  {
    yearLabel: "1–4章",
    stage: "奠基 · 水源",
    event: "无污染泉眼落地",
    impact: "灌溉与「高品质栽培」的物理前提；后续绿灯作物几乎都绑在泉脉上",
    kinds: ["tech", "specialty"],
  },
  {
    yearLabel: "拓展早期",
    stage: "拓展 · 香椿/红薯",
    event: "香椿移栽与红薯扦插",
    impact: "基础种植工程启动；绿灯香椿成为优等安全植物与交换锚点",
    kinds: ["specialty", "veg"],
  },
  {
    yearLabel: "约9–18章",
    stage: "拓展 · 动力",
    event: "羊耕犁落地",
    impact: "羊老大参与翻地；人兽协作直接进入农田生产力",
    kinds: ["tech"],
  },
  {
    yearLabel: "约15章",
    stage: "灾压 · 防护意识",
    event: "领地初遇戕雨",
    impact: "作物与动物同步承压；后续大棚、防雨布、颐石防护成为刚需",
    kinds: ["tech"],
  },
  {
    yearLabel: "约32章",
    stage: "基建 · 灌溉",
    event: "人力水车体系",
    impact: "用末世可用材料把泉水送达梯田，降低纯人力浇灌上限",
    kinds: ["tech"],
  },
  {
    yearLabel: "深化期",
    stage: "深化 · 大宗作物",
    event: "向日葵与水稻铺开",
    impact: "从口粮试验走向大宗作物规模化；联盟共同规则与山谷支点支撑面积扩张",
    kinds: ["grain"],
  },
  {
    yearLabel: "约114章",
    stage: "深化 · 共同体",
    event: "集体采购秧苗/磨面",
    impact: "领地联盟经济共同体成型；育秧与粮食加工开始社会化协作",
    kinds: ["grain", "tech"],
  },
  {
    yearLabel: "约116章",
    stage: "生产 · 二茬",
    event: "插秧与第二茬蔬菜",
    impact: "水稻秧、向日葵、黄瓜/茄/番茄同季推进；梯田试验田与交换菜园分流",
    kinds: ["grain", "veg"],
  },
  {
    yearLabel: "约308章",
    stage: "技术跃迁",
    event: "颐石大棚造境",
    impact: "防护从「罩棚挡雨」升级为低戕/高颐微环境，绿灯稳产成为可设计目标",
    kinds: ["tech", "specialty"],
  },
  {
    yearLabel: "约372章",
    stage: "育种 · 反馈",
    event: "绿豆二茬与菠菜提纯",
    impact: "暴露育种难：绿灯易转黄灯；《栽培指南》+颐石隔戕成为提质标准动作",
    kinds: ["grain", "specialty"],
  },
  {
    yearLabel: "升级期",
    stage: "升级 · 产业",
    event: "第九种植中心",
    impact: "实验室成果转可推广种子；发芽率 / 二元素稳定 / 攻击性戕进化比率成为量化门槛；栽培指南对外输出",
    kinds: ["tech"],
  },
  {
    yearLabel: "约616章",
    stage: "扩张 · 开荒",
    event: "多棚开荒春耕",
    impact: "规划水稻/小麦/豆类/玉米/棉花/向日葵等组合；山谷育苗分担风险",
    kinds: ["grain", "veg", "tech"],
  },
  {
    yearLabel: "约648章",
    stage: "育种 · 稻种",
    event: "优质稻种线路",
    impact: "J-2、BS-6 等黄灯/绿灯稻种并行：大田产量与梯田提纯双轨",
    kinds: ["grain"],
  },
  {
    yearLabel: "约792章",
    stage: "控场 · 智能化",
    event: "水肥一体与监控",
    impact: "灌溉施肥进入可控场阶段，种植从「能收」迈向「稳质稳量」",
    kinds: ["tech"],
  },
  {
    yearLabel: "约1227章",
    stage: "制度 · 科研",
    event: "联盟土壤研究部",
    impact: "把各领地土壤与栽培经验做成区域科研协作，服务更多作物品类",
    kinds: ["tech"],
  },
  {
    yearLabel: "连载中",
    stage: "持续",
    event: "绿灯体系外推",
    impact: "初代/优种、颐石防护与联盟供给网络仍在扩展；细节以原文更新为准",
    kinds: ["grain", "veg", "specialty", "tech"],
  },
];

/**
 * @param {CropTimelineEvent[]} events
 * @param {CropKind | 'all'} kind
 */
export function filterCropTimelineEvents(events, kind) {
  if (kind === "all") return events;
  return events.filter((item) => item.kinds.includes(kind));
}

/**
 * @param {CropTimelineEvent[]} events
 */
export function assertCropTimelineEvents(events) {
  if (!Array.isArray(events) || events.length < 8) {
    throw new Error("crop timeline needs enough events");
  }
  const labels = new Set();
  const needed = new Set(["grain", "veg", "specialty", "tech"]);
  const seen = new Set();
  for (const item of events) {
    if (
      !item.yearLabel ||
      !item.stage ||
      !item.event ||
      !item.impact ||
      !Array.isArray(item.kinds) ||
      !item.kinds.length
    ) {
      throw new Error(`invalid crop event: ${JSON.stringify(item)}`);
    }
    if (labels.has(item.yearLabel)) {
      throw new Error(`duplicate yearLabel: ${item.yearLabel}`);
    }
    labels.add(item.yearLabel);
    for (const k of item.kinds) seen.add(k);
  }
  for (const id of needed) {
    if (!seen.has(id)) throw new Error(`missing crop kind: ${id}`);
  }
}
