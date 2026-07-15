/** Cross-species cooperation beats (public encyclopedia / chapter markers). */

/**
 * @typedef {'wolves' | 'bears' | 'tigers' | 'avian' | 'beasts'} SpeciesFaction
 * @typedef {{
 *   yearLabel: string,
 *   stage: string,
 *   event: string,
 *   impact: string,
 *   factions: SpeciesFaction[],
 * }} SpeciesCooperationEvent
 */

/** @type {{ id: SpeciesFaction | 'all', label: string }[]} */
export const SPECIES_COOPERATION_TABS = [
  { id: "all", label: "全部" },
  { id: "wolves", label: "狼族" },
  { id: "bears", label: "熊组" },
  { id: "tigers", label: "虎族" },
  { id: "avian", label: "飞禽" },
  { id: "beasts", label: "走兽伙伴" },
];

/** @type {{ id: SpeciesFaction, title: string, relation: string, members: string, notes: string }[]} */
export const SPECIES_FACTION_CARDS = [
  {
    id: "wolves",
    title: "狼族（多支系）",
    relation: "邻居 → 盟友 → 协议伙伴",
    members:
      "北部狼群：头狼/女王、断腰狼、帅巨狼、狼犬老二、病狼等；西部狼群；南部狼群：老四等；晖一东/西/南狼群另有独立命名。东侧邻族为「东部豺狼群」（豺狼≠狼族，勿混称）",
    notes:
      "不是驯化，而是基于交换与信任的同伴关系：巡逻、护山、联合作战换颐石、药物、知识与通讯工具",
  },
  {
    id: "bears",
    title: "熊组",
    relation: "交易对象 → 战场合力的邻族",
    members: "领地周边进化棕熊、脑域进化熊（熊王线）、五十号山熊洞相关群体",
    notes:
      "开篇定位即「熊？交易对象」；脑域熊能聚群协同，人类忌硬刚；后文出现熊王关注战场、医疗互助等更深互动",
  },
  {
    id: "tigers",
    title: "虎族",
    relation: "高危邻族 → 医疗/情报协作",
    members: "瞎眼虎等虎群个体、西部前虎王、实验虎相关线",
    notes:
      "进虎群领地风险极高，常由南北/西部狼护送协同；后期出现为前虎王争取再生手术、抵挡蓝血抓捕等",
  },
  {
    id: "avian",
    title: "飞禽",
    relation: "侦察与空中协同节点",
    members: "渡鸦、玉带海雕等驯养/高进化飞禽",
    notes:
      "领主侧驯养鸟与高进化渡鸦常用于侦查、控鸟与空情共享；跨文明叙事亦把渡鸦列入多元物种网络",
  },
  {
    id: "beasts",
    title: "走兽伙伴",
    relation: "同伴 / 员工级协作",
    members: "羊老大、呆瓜猴、红松鼠、小飞毛等",
    notes:
      "羊是首个深度绑定伙伴；猴与松鼠承担技术活、采样、助战——简介原句「猴和松鼠？姐的员工！」",
  },
];

/**
 * Zhang San’s reading of Xia Qing as a living “human ↔ evolved-animal” case.
 * @type {{ title: string, summary: string }}
 */
export const SPECIES_SYMBIOSIS_THESIS = {
  title: "张三视域：活案例夏青",
  summary:
    "张三把夏青视为「人与进化动物和谐共生」的活案例。他推崇的不是单纯「能和动物住一起」，而是她无意中验证了：人类与进化动物可以在信任、平等、分工与保护框架下形成稳定共生体——这正符合他长期的研究设想。",
};

/**
 * Core traits of the cooperation model Zhang San endorses.
 * @type {{ name: string, note: string }[]}
 */
export const SPECIES_SYMBIOSIS_PRINCIPLES = [
  {
    name: "平等共生而非单向利用",
    note:
      "夏青把进化兽当「同伴」而非「资源」或「宠物」。清理林地时羊啃树、狼犬拖枝、自己砍树，分工明确、互惠互利。",
  },
  {
    name: "信任与安全感",
    note:
      "动物愿主动搬进夏青住处，说明对人类充分信任；夏青亦以日常照料、共享空间巩固这种信任。",
  },
  {
    name: "科研价值与实际应用并重",
    note:
      "张三看重的是可验证的共生可行性：日常协作同时产出可观察数据，服务农业、安保与医疗等应用，而非停留在奇闻轶事。",
  },
  {
    name: "谨慎保护",
    note:
      "对动物身体状况保密、只允许少量采样：既保证科研，又避免外界觊觎，为合作模式提供可持续安全框架。",
  },
];

/** One-line doctrine underneath the four principles. */
export const SPECIES_SYMBIOSIS_DOCTRINE =
  "在相互信任、平等对待的基础上，人类与进化动物形成分工协作、资源共享的共生体；再以保密与保护措施，让合作既能持续，又能产出可验证的科研价值。";

/**
 * Cooperation chronology. Chapter markers are approximate public anchors.
 *
 * @type {SpeciesCooperationEvent[]}
 */
export const SPECIES_COOPERATION_EVENTS = [
  {
    yearLabel: "约9章起",
    stage: "奠基 · 走兽",
    event: "羊老大结伴",
    impact: "首个非人类深度伙伴：耕犁、守泉、警戒；人兽互信模板从此立下",
    factions: ["beasts"],
  },
  {
    yearLabel: "拓展早期",
    stage: "拓展 · 北部狼",
    event: "断腰狼开谈交换",
    impact: "野猪换山坡等物物交易；北部狼从危险邻族变为可谈判的「狼族 CEO」协作对象",
    factions: ["wolves"],
  },
  {
    yearLabel: "拓展中段",
    stage: "拓展 · 走兽员工",
    event: "猴与松鼠入列",
    impact: "雇佣式协作：技术工、采样、侦察；领地劳动力跨物种化",
    factions: ["beasts"],
  },
  {
    yearLabel: "约114章",
    stage: "深化 · 北部狼",
    event: "狼群巡逻契约",
    impact: "隔离带日常巡防等常态劳务交换；人兽协作制度化萌芽",
    factions: ["wolves"],
  },
  {
    yearLabel: "深化后期",
    stage: "深化 · 北部狼群像",
    event: "头狼/病狼网络铺开",
    impact: "头狼（女王）权威、帅巨狼运力、狼犬老二与病狼等个体分工显性化，北部狼成为稳定邻居",
    factions: ["wolves"],
  },
  {
    yearLabel: "约262章",
    stage: "认知 · 熊组",
    event: "脑域熊风险入局",
    impact: "确认脑域熊可聚群作战；战略上忌硬刚，改走避战、观察与条件交换",
    factions: ["bears"],
  },
  {
    yearLabel: "中期护山",
    stage: "深化 · 熊+狼",
    event: "熊洞护山交换",
    impact: "请北部狼看守五十号山熊洞等要地；熊域进入人狼共同安保版图",
    factions: ["wolves", "bears"],
  },
  {
    yearLabel: "升级早期",
    stage: "升级 · 飞禽",
    event: "渡鸦与驯养鸟入链",
    impact: "八号等地驯养鸟、高进化渡鸦承担侦查/控鸟；空情开始并入任务指挥",
    factions: ["avian"],
  },
  {
    yearLabel: "约417章",
    stage: "侧面 · 熊组体量",
    event: "巨狼巨熊同域图景",
    impact: "巨熊压迫感与狼群战力对照出现；熊组作为金字塔级邻族存在感坐实",
    factions: ["bears", "wolves"],
  },
  {
    yearLabel: "约1125章",
    stage: "升级 · 多族战线",
    event: "与兽同行灭灾",
    impact: "狼群主战、熊王关注战场、飞禽覆盖空域；多族群联合作战常态化",
    factions: ["wolves", "bears", "avian"],
  },
  {
    yearLabel: "天灾11年线",
    stage: "升华 · 南部狼",
    event: "老四深度结盟",
    impact: "南部狼王老四：救同伴、报仇、学知识、劳动换工具；晖三南北狼网络贯通",
    factions: ["wolves"],
  },
  {
    yearLabel: "约1204章",
    stage: "升华 · 南部狼后勤",
    event: "南部狼医疗/通讯协作",
    impact: "治疗伤狼、触屏笔/手机通讯；老四成为可远程调度的南线狼族枢纽",
    factions: ["wolves"],
  },
  {
    yearLabel: "约1250章",
    stage: "升华 · 虎族",
    event: "协同进入虎境",
    impact: "南北/西部狼护送进虎群领地，处理瞎眼虎等检测任务；虎族从远危变可协作",
    factions: ["wolves", "tigers"],
  },
  {
    yearLabel: "约1368章",
    stage: "升华 · 狼族自治",
    event: "狼群联合灭灾",
    impact: "狼群与夏青联合执行灭灾；群体战斗协作再升一级",
    factions: ["wolves"],
  },
  {
    yearLabel: "约1491章",
    stage: "标志 · 南部狼",
    event: "首份跨物种协议",
    impact: "夏青、老四与派驻员工三方签章；动物升格为权利主体伙伴",
    factions: ["wolves"],
  },
  {
    yearLabel: "约1655章",
    stage: "标志 · 虎族",
    event: "西部前虎王医疗线",
    impact: "南部狼用俘获/积分换牙齿再生手术；夏青搭上西部虎族高层协作",
    factions: ["wolves", "tigers"],
  },
  {
    yearLabel: "约1677章",
    stage: "冲突 · 虎+联盟",
    event: "蓝血盯上实验虎",
    impact: "外部势力对实验虎/虎域施压；人狼（及关联护卫）转入反猎捕联合防御",
    factions: ["tigers", "wolves"],
  },
  {
    yearLabel: "约1850章",
    stage: "制度 · 狼族",
    event: "狼群承接排查任务",
    impact: "可自主通过政务应用接进化林排查赚积分——组织化自治",
    factions: ["wolves"],
  },
  {
    yearLabel: "约1851章",
    stage: "日常 · 南狼+走兽",
    event: "护幼与诊所协作",
    impact: "南部狼参与人类幼崽护送、伤狼救治等日常同盟事务，关系生活化",
    factions: ["wolves", "beasts"],
  },
  {
    yearLabel: "连载中",
    stage: "持续推进",
    event: "多物种协作网络",
    impact: "人狼熊虎禽与人类领地联盟并行；共同防御与立法参与仍在推进",
    factions: ["wolves", "bears", "tigers", "avian", "beasts"],
  },
];

/**
 * @param {SpeciesCooperationEvent[]} events
 * @param {SpeciesFaction | 'all'} faction
 */
export function filterSpeciesCooperationEvents(events, faction) {
  if (faction === "all") return events;
  return events.filter((item) => item.factions.includes(faction));
}

/**
 * @param {{ name: string, note: string }[]} principles
 * @param {{ title: string, summary: string }} thesis
 */
export function assertSpeciesSymbiosis(principles, thesis) {
  if (!thesis?.title || !thesis?.summary) {
    throw new Error("species symbiosis thesis incomplete");
  }
  if (!Array.isArray(principles) || principles.length !== 4) {
    throw new Error("species symbiosis needs four principles");
  }
  for (const row of principles) {
    if (!row.name || !row.note) {
      throw new Error(`invalid symbiosis principle: ${JSON.stringify(row)}`);
    }
  }
}

/**
 * @param {SpeciesCooperationEvent[]} events
 */
export function assertSpeciesCooperationEvents(events) {
  if (!Array.isArray(events) || events.length < 5) {
    throw new Error("species cooperation needs enough events");
  }
  const labels = new Set();
  const needed = new Set(["wolves", "bears", "tigers", "avian", "beasts"]);
  const seen = new Set();
  for (const item of events) {
    if (
      !item.yearLabel ||
      !item.stage ||
      !item.event ||
      !item.impact ||
      !Array.isArray(item.factions) ||
      !item.factions.length
    ) {
      throw new Error(`invalid species event: ${JSON.stringify(item)}`);
    }
    if (labels.has(item.yearLabel)) {
      throw new Error(`duplicate yearLabel: ${item.yearLabel}`);
    }
    labels.add(item.yearLabel);
    for (const f of item.factions) seen.add(f);
  }
  for (const id of needed) {
    if (!seen.has(id)) throw new Error(`missing faction coverage: ${id}`);
  }
}
