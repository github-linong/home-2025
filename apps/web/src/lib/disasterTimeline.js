/** Shared disaster-timeline events for the novel setting board chart + table. */

/**
 * @typedef {'prelude' | 'story'} DisasterTimelineEra
 * @typedef {{
 *   era: DisasterTimelineEra,
 *   yearLabel: string,
 *   stage: string,
 *   event: string,
 *   impact: string,
 * }} DisasterTimelineEvent
 */

/** @type {{ id: DisasterTimelineEra | 'all', label: string }[]} */
export const DISASTER_TIMELINE_ERA_TABS = [
  { id: "prelude", label: "灾变序章" },
  { id: "story", label: "开篇之后" },
  { id: "all", label: "全部" },
];

/**
 * Pre-story cascade from public synopsis / chapter-1 background;
 * post-opening beats from public setting encyclopedias (QQ 阅读百科等) keyed by chapter phases.
 *
 * @type {DisasterTimelineEvent[]}
 */
export const DISASTER_TIMELINE_EVENTS = [
  // —— 灾变序章（故事开始之前）——
  {
    era: "prelude",
    yearLabel: "起点",
    stage: "起点",
    event: "核污染水排海",
    impact: "多数人认定的天灾开端；霓虹国不顾抗议向海排放核污染水",
  },
  {
    era: "prelude",
    yearLabel: "三月后",
    stage: "排海约三月后",
    event: "霓虹国火山爆发",
    impact: "火山灰、岩浆、海啸与地震将其吞没；幸存者不及总人口 5%",
  },
  {
    era: "prelude",
    yearLabel: "随后",
    stage: "紧随其后",
    event: "五大洲火山连环",
    impact: "几十座大火山接连爆发；火山灰污染全星淡水",
  },
  {
    era: "prelude",
    yearLabel: "数月",
    stage: "火山后数月",
    event: "全球酸雨期",
    impact: "酸雨长达数月，全星农业系统崩溃",
  },
  {
    era: "prelude",
    yearLabel: "半年后",
    stage: "火山爆发约半年后",
    event: "误以为灾已结束",
    impact: "大气能见度好转，人们庆祝并准备重建家园",
  },
  {
    era: "prelude",
    yearLabel: "同节点",
    stage: "同上节点前后",
    event: "超强伽马射线暴",
    impact: "八千光年外超新星引发；两大洲通讯/电力瘫痪，卫星毁尽，生物大量死亡",
  },
  {
    era: "prelude",
    yearLabel: "随之",
    stage: "伽马射线暴后",
    event: "磁场紊乱",
    impact: "蓝星磁场混乱，为神秘元素显现铺垫",
  },
  {
    era: "prelude",
    yearLabel: "元素",
    stage: "元素显现",
    event: "戕与颐出现",
    impact: "华国科学家命名；全星生物短时间大进化，地狱生存模式开启",
  },
  {
    era: "prelude",
    yearLabel: "灾初",
    stage: "大进化初期",
    event: "安全区体制成型",
    impact: "人类聚居安全区；物资与净水靠积分兑换；远距通讯一度依赖电台/收音机",
  },
  {
    era: "prelude",
    yearLabel: "第4年",
    stage: "天灾第 4 年",
    event: "虫灾",
    impact: "夏青之母死于虫灾",
  },
  {
    era: "prelude",
    yearLabel: "第5年",
    stage: "天灾第 5 年",
    event: "兽潮",
    impact: "夏青之父死于兽潮（与高级进化人相关冲突交织）",
  },
  {
    era: "prelude",
    yearLabel: "此后",
    stage: "第 5–10 年间",
    event: "戕雨/戕雪常态化",
    impact: "周期性抬升戕浓度，种植与生存持续承压；颐石等应对手段逐渐出现",
  },
  {
    era: "prelude",
    yearLabel: "第10年前",
    stage: "第 10 年前夕",
    event: "推出领地政策",
    impact: "基地广播号召出区种田；清理并开放领地认领，缺人则可能摊派",
  },

  // —— 故事开篇之后 ——
  {
    era: "story",
    yearLabel: "开篇",
    stage: "第 10 年 · 开篇",
    event: "走出安全区种田",
    impact: "夏青离开晖三基地，认领三号地；故事正式开始",
  },
  {
    era: "story",
    yearLabel: "1–4章",
    stage: "奠基期（约第 1–4 章）",
    event: "三号地立定根基",
    impact: "确认领主权利与正当防卫；发现无污染泉眼；取得首块缓冲林",
  },
  {
    era: "story",
    yearLabel: "5–30章",
    stage: "拓展期（约第 5–30 章）",
    event: "羊老大与人兽协作",
    impact: "野猪换山坡完成首次扩土；引入羊老大；与排查队、青龙战队形成互助雏形",
  },
  {
    era: "story",
    yearLabel: "约15章",
    stage: "拓展期内",
    event: "初遇领地戕雨",
    impact: "周期性灾害落地三号地；羊老大一度失控，人兽信任经危机后更稳固",
  },
  {
    era: "story",
    yearLabel: "31–150章",
    stage: "深化期（约第 31–150 章）",
    event: "领地联盟成立",
    impact: "制定共同规则；隐蔽山谷与养殖支点落地；大宗作物规模化；引入颐石防护抗戕雨",
  },
  {
    era: "story",
    yearLabel: "约114章",
    stage: "深化期标志节点",
    event: "经济共同体成型",
    impact: "联盟首次集体采购磨面机与秧苗；人兽协作向巡逻/契约深化",
  },
  {
    era: "story",
    yearLabel: "151–600章",
    stage: "升级期（约第 151–600 章）",
    event: "第九种植中心",
    impact: "实验室、制药厂、养殖场等多功能落地；栽培指南与特效药对外输出；跨物种协作制度化",
  },
  {
    era: "story",
    yearLabel: "中后期",
    stage: "升级期冲突面",
    event: "对阵蓝血/烈火",
    impact: "外部掠夺与扭曲科研势力抬头；领地联盟转入联合防御与情报博弈",
  },
  {
    era: "story",
    yearLabel: "601章+",
    stage: "升华期（约第 601 章起）",
    event: "万物共生升维",
    impact: "领地建设从物质基建转向文明秩序；推动更广联盟网络与共生理念",
  },
  {
    era: "story",
    yearLabel: "约1227章",
    stage: "升华期制度建设",
    event: "土壤研究部",
    impact: "领地联盟成立土壤研究部，把种田经验推进到区域科研协作",
  },
  {
    era: "story",
    yearLabel: "约1491章",
    stage: "升华期标志节点",
    event: "首份跨物种协议",
    impact: "夏青与南部狼群领主等三方签章；动物从「资源」升格为权利主体的伙伴",
  },
  {
    era: "story",
    yearLabel: "连载中",
    stage: "连载进行时",
    event: "蓝血威胁仍在",
    impact: "联盟群协作与暗网势力冲突仍在推进；细节以原文更新为准",
  },
];

/**
 * @param {DisasterTimelineEvent[]} events
 * @param {DisasterTimelineEra | 'all'} era
 */
export function filterDisasterTimelineEvents(events, era) {
  if (era === "all") return events;
  return events.filter((item) => item.era === era);
}

/**
 * @param {DisasterTimelineEvent[]} events
 */
export function assertDisasterTimelineEvents(events) {
  if (!Array.isArray(events) || events.length < 2) {
    throw new Error("disaster timeline needs at least 2 events");
  }
  const labels = new Set();
  for (const item of events) {
    if (
      !item.era ||
      !item.yearLabel ||
      !item.stage ||
      !item.event ||
      !item.impact
    ) {
      throw new Error(`invalid timeline event: ${JSON.stringify(item)}`);
    }
    if (item.era !== "prelude" && item.era !== "story") {
      throw new Error(`invalid era: ${item.era}`);
    }
    if (labels.has(item.yearLabel)) {
      throw new Error(`duplicate yearLabel: ${item.yearLabel}`);
    }
    labels.add(item.yearLabel);
  }
  const hasOpening = events.some(
    (e) => /开篇|走出安全区/.test(e.event) || /开篇/.test(e.stage),
  );
  if (!hasOpening) {
    throw new Error("timeline should include story opening");
  }
  const hasPostOpening = events.some((e) =>
    /跨物种|领地联盟|第九种植/.test(e.event + e.stage),
  );
  if (!hasPostOpening) {
    throw new Error("timeline should include post-opening story beats");
  }
}
