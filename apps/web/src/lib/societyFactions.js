/** Society / space / faction / base / forest / team data for the novel setting board. */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   category: number,
 *   x: number,
 *   y: number,
 *   symbolSize?: number | number[],
 * }} GraphNode
 * @typedef {{ source: string, target: string, label?: string, lineType?: 'solid' | 'dashed' }} GraphEdge
 * @typedef {{ title: string, summary: string, detail: string }} SpaceCard
 * @typedef {{ name: string, group: string, note: string }} BaseRow
 * @typedef {{ name: string, base: string, stance: string, note: string }} TeamRow
 * @typedef {{ name: string, group: string, camp: string, role: string, stance: string }} FactionRow
 */

/** @type {SpaceCard[]} */
export const SOCIETY_REGION_CARDS = [
  {
    title: "红城大区",
    summary: "综合实力排名靠前；红一等为核心具名基地。",
    detail:
      "临海基地多有肥料（蟹壳肥等）产出外销。红一/红二等常就科研考察、资源共享向晖三方向递交申请。",
  },
  {
    title: "兰城大区",
    summary: "西方基地群；经西北进化林可抵晖三侧。",
    detail:
      "兰五与晖三进化林地理连通；亦有研究院（如兰一）参与跨基地科研互动与设备生态。",
  },
  {
    title: "晖城大区",
    summary: "中部十基地；夏青主舞台所在大区。",
    detail:
      "晖三为人数排名第三的基地；同区晖一～晖六等竞争协作并行（擂台、抢肥、情报互通不冲突）。",
  },
  {
    title: "白城大区",
    summary: "北方基地群；白一等含高校/医疗节点。",
    detail:
      "常出现跨基地公务、医学与交换链路（如白一基地访问、白三种质交换等）。",
  },
  {
    title: "桂城大区",
    summary: "南方基地群；临海且受海洋进化生物压力大。",
    detail:
      "桂三等一旦失守，难民可能北冲晖一/晖三方向；蟹壳肥采购冲突也常指向桂一/桂五。",
  },
];

/** @type {BaseRow[]} */
export const SOCIETY_BASE_ROWS = [
  {
    name: "晖三",
    group: "晖城",
    note: "主舞台。下挂青龙（相对独立）、夙风、东阳等战队；北部一区与进化林贴合。",
  },
  {
    name: "晖一",
    group: "晖城",
    note: "南侧邻居。对十一号等地有名义管辖，内部斗争下难稳控；下挂寒霜，林缘烈火山盘踞烈火。",
  },
  {
    name: "晖二",
    group: "晖城",
    note: "同区竞争者；曾与晖五一起抢晖三已订蟹壳肥。",
  },
  {
    name: "晖五",
    group: "晖城",
    note: "南侧另一邻居；黑豹等战队；蓝血晖五分部也曾外溢施压。",
  },
  {
    name: "晖六",
    group: "晖城",
    note: "经西部进化林可达；人猴冲突尖锐；可能作入侵路径。",
  },
  {
    name: "白一",
    group: "白城",
    note: "北方大区节点；医疗/高校与跨基地公务常牵涉。",
  },
  {
    name: "红一",
    group: "红城",
    note: "红城核心之一；就泉眼等资源递交访问与共享申请。",
  },
  {
    name: "兰五",
    group: "兰城",
    note: "经晖三西北进化林可达；北部入侵路径候选之一。",
  },
  {
    name: "红十一",
    group: "红城",
    note: "穿北进化林可达；与兰五、晖六同为北向通路选项。",
  },
  {
    name: "桂三",
    group: "桂城",
    note: "海洋压力大；失守则难民可能北冲晖城。",
  },
];

/** @type {SpaceCard[]} */
export const SOCIETY_FOREST_CARDS = [
  {
    title: "编号山域制度",
    summary: "晖三附近进化林按山脊 / 湖泊排序：几几号山 = 相连多峰的一片山域。",
    detail:
      "贴林主轴常见：四十九（贴领）→五十（东邻大山）→五十一；北向经五十五 / 五十二抵六十 / 六十一（约六十里直距）。二十二号山在南部深处，勿与二十二号领地混淆。",
  },
  {
    title: "四十九 / 五十号山",
    summary: "四十九贴北部一区隔离带；五十在其东，约 16×12 公里，为夏青主管的土壤修复试验区。",
    detail:
      "四十九含三峰与多分区；五十含四峰、熊洞与隐蔽山谷。北狼核心另在更近的五十五号山。",
  },
  {
    title: "南线与烈火山",
    summary: "二十二号山属南部狼群；烈火山在晖一安区外，皆距北部一区约数百里。",
    detail:
      "二十二号山瀑布水潭是川苔草与南狼协作点；烈火盘踞烈火山，可直升机突袭北部一区。",
  },
  {
    title: "跨基地林中通路",
    summary: "编号山域连接兰五 / 红十一 / 晖六，也是战队与族群走廊。",
    detail:
      "北林远抵红十一；西北经六十一带通兰五；西林通晖六并驻西部狼群。",
  },
];

/** @type {TeamRow[]} */
export const SOCIETY_TEAM_ROWS = [
  {
    name: "青龙战队",
    base: "晖三（相对独立）",
    stance: "灰 · 协作核心",
    note: "杨晋；晖三人类前列战力，自主权大。与夏青强协作，也可在进化林草药等资源上交锋；与晖一寒霜可情报互通。",
  },
  {
    name: "夙风战队",
    base: "晖三",
    stance: "灰 · 竞争 / 内斗",
    note: "唐氏线（唐正夙等）。曾是晖三强队；与青龙长期对手，兽潮时亦插手领地混战。",
  },
  {
    name: "东阳战队",
    base: "晖三",
    stance: "灰 · 熟人战队",
    note: "徐娟等出场；开篇任务大厅社交圈，属于晖三常规战队力量。",
  },
  {
    name: "战队联盟",
    base: "晖三",
    stance: "灰 · 议事框架",
    note: "各大战队议事与兽潮动员平台；可与领地联盟合作，但不并入。",
  },
  {
    name: "寒霜战队",
    base: "晖一",
    stance: "灰 · 跨基地情报友军",
    note: "晖一排名前列。基地层可与晖三对立，寒霜与青龙仍可情报互通。",
  },
  {
    name: "烈火战队",
    base: "晖一林缘 · 烈火山",
    stance: "灰 · 对抗又合作",
    note: "火凤凰等；游走明暗两界。官方视为灰色势力；与夏青既对抗（抢泉、突袭）也有交易协作可能；可与蓝血利益交织。",
  },
  {
    name: "黑豹战队",
    base: "晖五",
    stance: "灰 · 竞争压力",
    note: "晖五强队之一；跨区抢肥等硬仗中可能对阵青龙/夏青任务组。",
  },
  {
    name: "蛟龙特战队",
    base: "晖城军方",
    stance: "白 · 大区顶级战力",
    note: "晖城军方顶尖作战队系（如妍龙线）；与各基地战队体系并行的官方精锐。",
  },
];

/** @type {SpaceCard[]} */
export const SOCIETY_SPACE_CARDS = [
  {
    title: "晖三安全区",
    summary: "晖三人类主聚居地；积分兑换；区内信号有限恢复。",
    detail:
      "管理层、军队、战队、种植/养殖/检测等部门俱全。基地长调度战队与跨基地任务。",
  },
  {
    title: "北部一区领地群",
    summary: "晖三区外合法耕垦带；按号认领（约 1–26 号）；夏青三号地主舞台。",
    detail:
      "铁网墙 + 隔离带贴四十九 / 五十号山。排查小队分组护卫；五十号山试验区承载土壤修复；孤身领主亦是掠夺风险对象。",
  },
  {
    title: "跨基地交换网",
    summary: "种质、肥料、科研与暗网利益跨区流动。",
    detail:
      "土豆种、蟹壳肥、研究院访问申请等让晖三与白/红/兰/桂频繁交叉。",
  },
  {
    title: "任务大厅 / 战队生态",
    summary: "基地内任务发布、组队社交与跨区委托枢纽。",
    detail:
      "东阳等熟人战队、青龙接单、基地长下发敏感清剿均经此流转；林外任务常与进化林坐标绑定。",
  },
];

/** @type {FactionRow[]} */
export const SOCIETY_FACTION_ROWS = [
  // 1. 基地与官方体系（白）
  {
    name: "晖三基地",
    group: "基地与官方",
    camp: "白",
    role: "晖城最具实权的官方力量；政策、积分、领地认证与跨基任务",
    stance: "多次与夏青直接合作或交锋；可调度青龙等执行敏感任务",
  },
  {
    name: "晖一基地",
    group: "基地与官方",
    camp: "白",
    role: "官方势力之一；对十一号等地有名义管辖",
    stance: "内部斗争削弱掌控力；与蓝血存在勾结暗线（曲方舟等线）",
  },
  {
    name: "第九种植中心",
    group: "基地与官方",
    camp: "白/科研",
    role: "原第九中心；实验室成果转可推广种子（发芽率、二元素稳定、攻击性戕进化比率）",
    stance: "负责人张三，推广专家张陶；基地农业现代化与夏青技术支持主阵地",
  },
  {
    name: "领地管理部 / 排查体系",
    group: "基地与官方",
    camp: "白",
    role: "收放空缺领地、分组护领、频道与灭灾前哨",
    stance: "二号地空缺时收回并再分配；与谭君杰等排查线深度绑定",
  },
  // 2. 领地相关
  {
    name: "一区领地（北部一区）",
    group: "领地",
    camp: "白/灰边界",
    role: "安全区外围农业带；约 1–26 号编地",
    stance: "菠菜等种植情报外泄可引兽潮当晚重点破坏；夏青主舞台",
  },
  {
    name: "十一号领地",
    group: "领地",
    camp: "争夺焦点",
    role: "领主身亡后的空缺地块；晖一名义管辖",
    stance: "霍家试图入主屡不得门；张十、叶杨等亦因底子薄难抗大势力",
  },
  {
    name: "二号领地",
    group: "领地",
    camp: "争夺焦点",
    role: "曾属唐怀线；失主后由领地管理部收回",
    stance: "再分配常引发基地间抢夺与人情博弈",
  },
  {
    name: "领地联盟",
    group: "领地",
    camp: "灰白协作",
    role: "北部一区种田互助、规则与农产品协作",
    stance: "夏青盟主；刻意不吸纳战队以保独立",
  },
  {
    name: "五十号山试验区",
    group: "领地",
    camp: "白/科研",
    role: "红色戕草催熟、污染土降至安全含量的连续试验场",
    stance: "夏青管理、张何实验；决定周边领地能否快速复耕扩展",
  },
  // 3. 商业与财阀
  {
    name: "重联集团",
    group: "商业财阀",
    camp: "灰白资本",
    role: "天灾前大型企业；混乱期并购保底、吸纳高精尖",
    stance: "可与官方对话的经济巨头；介入领地、科研与十一号等议题",
  },
  // 4. 私人武装与地下组织
  {
    name: "蓝血联盟",
    group: "地下组织",
    camp: "黑",
    role: "官方定性邪恶势力；暗中掌控情报与进化资源",
    stance: "晖一暗线活跃；猎取实验体；与官方勾结、与烈火利益可交织",
  },
  {
    name: "烈火战队",
    group: "私人武装",
    camp: "灰",
    role: "明暗两界活动；据烈火山",
    stance: "与夏青对抗又合作；官方视为灰色势力",
  },
  {
    name: "青龙战队",
    group: "私人武装",
    camp: "灰",
    role: "晖三前列战力；进化林外围战斗组",
    stance: "与夏青强协作，亦可因草药等资源交锋",
  },
  {
    name: "霍家",
    group: "私人武装",
    camp: "灰",
    role: "借「新领主」名义染指十一号领地",
    stance: "实力不足，被多方牵制，迟迟不得入主",
  },
  {
    name: "张十、叶杨",
    group: "私人武装",
    camp: "游走",
    role: "与十一号空缺机会相关的人物线",
    stance: "底子薄，难以与大势力正面抗衡",
  },
  // 5. 独立或游走个人
  {
    name: "夏青",
    group: "游走个人",
    camp: "白/灰/黑之间",
    role: "三号领主；本书主角",
    stance: "游走三色势力：既是合作方也是竞争者，资源与规则的枢纽",
  },
  {
    name: "岳海营、谭君杰、彭林",
    group: "游走个人",
    camp: "协作侧",
    role: "情报、排查内应与领地侧盟友",
    stance: "与夏青结盟或被其调度，承担内应与信息工作",
  },
  {
    name: "曲方舟",
    group: "游走个人",
    camp: "白→揭黑",
    role: "晖一官方高层",
    stance: "临死前供出晖一与蓝血联盟勾结情报",
  },
  {
    name: "跨物种盟友",
    group: "游走个人",
    camp: "灰白协作",
    role: "北/西/南狼、熊、虎、飞禽等",
    stance: "林缘巡逻、护山、协议与灭灾共建；详见地图族群表",
  },
];

/** Color-camp legend for the faction overview. */
export const SOCIETY_CAMP_NOTE =
  "习惯称谓：基地官方偏「白」，蓝血等邪势力偏「黑」，战队与财阀等游走其间为「灰」。同一势力可随剧情在三色边界滑动。";

/** @type {{ name: string }[]} */
export const SOCIETY_GRAPH_CATEGORIES = [
  { name: "大区 / 基地" },
  { name: "进化林地理" },
  { name: "各基下属战队" },
  { name: "晖三协作侧" },
  { name: "敌对 / 压力" },
];

/** @type {GraphNode[]} */
export const SOCIETY_GRAPH_NODES = [
  { id: "reg-hong", name: "红城", category: 0, x: 8, y: 4, symbolSize: [72, 28] },
  { id: "reg-lan", name: "兰城", category: 0, x: 24, y: 4, symbolSize: [72, 28] },
  { id: "reg-hui", name: "晖城", category: 0, x: 50, y: 4, symbolSize: [72, 28] },
  { id: "reg-bai", name: "白城", category: 0, x: 76, y: 4, symbolSize: [72, 28] },
  { id: "reg-gui", name: "桂城", category: 0, x: 92, y: 4, symbolSize: [72, 28] },

  { id: "hong1", name: "红一", category: 0, x: 6, y: 16, symbolSize: [56, 26] },
  { id: "hong11", name: "红十一", category: 0, x: 16, y: 16, symbolSize: [64, 26] },
  { id: "lan5", name: "兰五", category: 0, x: 28, y: 16, symbolSize: [56, 26] },
  { id: "hui1", name: "晖一", category: 0, x: 40, y: 16, symbolSize: [56, 26] },
  { id: "hui2", name: "晖二", category: 0, x: 50, y: 16, symbolSize: [56, 26] },
  { id: "hui3", name: "晖三", category: 0, x: 60, y: 16, symbolSize: [64, 30] },
  { id: "hui5", name: "晖五", category: 0, x: 70, y: 16, symbolSize: [56, 26] },
  { id: "hui6", name: "晖六", category: 0, x: 80, y: 16, symbolSize: [56, 26] },
  { id: "bai1", name: "白一", category: 0, x: 92, y: 16, symbolSize: [56, 26] },

  { id: "forest-n", name: "北林→红十一", category: 1, x: 16, y: 30, symbolSize: [112, 28] },
  { id: "forest-nw", name: "西北林→兰五", category: 1, x: 36, y: 30, symbolSize: [112, 28] },
  { id: "forest", name: "晖三进化林", category: 1, x: 58, y: 30, symbolSize: [112, 30] },
  { id: "forest-w", name: "西林→晖六", category: 1, x: 78, y: 30, symbolSize: [104, 28] },
  { id: "gui3", name: "桂三", category: 0, x: 92, y: 30, symbolSize: [56, 26] },
  { id: "huoshan", name: "烈火山", category: 1, x: 40, y: 42, symbolSize: [88, 28] },

  { id: "hanshuang", name: "寒霜(晖一)", category: 2, x: 16, y: 56, symbolSize: [100, 30] },
  { id: "fire", name: "烈火(烈火山)", category: 2, x: 36, y: 56, symbolSize: [112, 30] },
  { id: "qinglong", name: "青龙(晖三)", category: 2, x: 54, y: 56, symbolSize: [100, 30] },
  { id: "sufeng", name: "夙风(晖三)", category: 2, x: 72, y: 56, symbolSize: [100, 30] },
  { id: "heibao", name: "黑豹(晖五)", category: 2, x: 90, y: 56, symbolSize: [100, 30] },

  { id: "safe", name: "晖三安全区", category: 3, x: 18, y: 72, symbolSize: [100, 28] },
  { id: "north", name: "北部一区", category: 3, x: 38, y: 72, symbolSize: [88, 28] },
  { id: "lords", name: "领地联盟", category: 3, x: 56, y: 72, symbolSize: [88, 28] },
  { id: "lab7", name: "五十号山试验区", category: 3, x: 74, y: 72, symbolSize: [120, 28] },
  { id: "center9", name: "第九种植中心", category: 3, x: 92, y: 72, symbolSize: [108, 28] },

  { id: "plot11", name: "十一号领地", category: 4, x: 12, y: 88, symbolSize: [100, 28] },
  { id: "chonglian", name: "重联集团", category: 3, x: 36, y: 88, symbolSize: [88, 28] },
  { id: "blue", name: "蓝血联盟", category: 4, x: 58, y: 88, symbolSize: [88, 28] },
  { id: "pressure", name: "抢地/兽潮压", category: 4, x: 78, y: 88, symbolSize: [108, 28] },
  { id: "species", name: "跨物种盟友", category: 3, x: 94, y: 88, symbolSize: [100, 28] },
];

/** @type {GraphEdge[]} */
export const SOCIETY_GRAPH_EDGES = [
  { source: "reg-hong", target: "hong1", label: "" },
  { source: "reg-hong", target: "hong11", label: "" },
  { source: "reg-lan", target: "lan5", label: "" },
  { source: "reg-hui", target: "hui1", label: "" },
  { source: "reg-hui", target: "hui2", label: "" },
  { source: "reg-hui", target: "hui3", label: "" },
  { source: "reg-hui", target: "hui5", label: "" },
  { source: "reg-hui", target: "hui6", label: "" },
  { source: "reg-bai", target: "bai1", label: "" },
  { source: "reg-gui", target: "gui3", label: "" },

  { source: "hong11", target: "forest-n", label: "通路" },
  { source: "lan5", target: "forest-nw", label: "通路" },
  { source: "hui6", target: "forest-w", label: "通路" },
  { source: "forest-n", target: "forest", label: "" },
  { source: "forest-nw", target: "forest", label: "" },
  { source: "forest-w", target: "forest", label: "" },
  { source: "hui1", target: "forest", label: "南毗邻", lineType: "dashed" },
  { source: "hui5", target: "forest", label: "南毗邻", lineType: "dashed" },
  { source: "hui1", target: "huoshan", label: "林缘据点" },
  { source: "huoshan", target: "fire", label: "盘踞" },

  { source: "hui1", target: "hanshuang", label: "下属" },
  { source: "hui1", target: "plot11", label: "名义管辖", lineType: "dashed" },
  { source: "hui3", target: "qinglong", label: "协作" },
  { source: "hui3", target: "sufeng", label: "下属" },
  { source: "hui5", target: "heibao", label: "下属" },

  { source: "hui3", target: "safe", label: "治所" },
  { source: "hui3", target: "north", label: "一区领地" },
  { source: "hui3", target: "center9", label: "隶属" },
  { source: "safe", target: "north", label: "出区" },
  { source: "north", target: "forest", label: "贴林" },
  { source: "lords", target: "north", label: "耕垦" },
  { source: "center9", target: "lords", label: "种子技术", lineType: "dashed" },
  { source: "qinglong", target: "lords", label: "强协作" },
  { source: "qinglong", target: "hanshuang", label: "情报互通", lineType: "dashed" },
  { source: "qinglong", target: "forest", label: "作战/争药" },
  { source: "sufeng", target: "north", label: "插手", lineType: "dashed" },
  { source: "lab7", target: "lords", label: "复耕试验" },
  { source: "lords", target: "lab7", label: "主管", lineType: "dashed" },
  { source: "chonglian", target: "center9", label: "资本介入", lineType: "dashed" },
  { source: "chonglian", target: "plot11", label: "染指", lineType: "dashed" },
  { source: "fire", target: "lords", label: "对抗/交易" },
  { source: "fire", target: "center9", label: "觊觎" },
  { source: "heibao", target: "pressure", label: "抢肥" },
  { source: "hui2", target: "pressure", label: "抢地" },
  { source: "gui3", target: "pressure", label: "难民", lineType: "dashed" },
  { source: "bai1", target: "hui3", label: "公务", lineType: "dashed" },
  { source: "hong1", target: "center9", label: "考察", lineType: "dashed" },
  { source: "hong1", target: "lords", label: "肝脏/卫生协作", lineType: "dashed" },
  { source: "blue", target: "lords", label: "渗透" },
  { source: "blue", target: "hui1", label: "勾结", lineType: "dashed" },
  { source: "blue", target: "plot11", label: "争夺", lineType: "dashed" },
  { source: "fire", target: "blue", label: "交织", lineType: "dashed" },
  { source: "species", target: "forest", label: "邻接" },
  { source: "species", target: "lords", label: "协议" },
  { source: "pressure", target: "qinglong", label: "外勤" },
  { source: "pressure", target: "north", label: "兽潮冲击", lineType: "dashed" },
  { source: "hui1", target: "hui3", label: "擂台", lineType: "dashed" },
];

/**
 * @param {GraphNode[]} nodes
 * @param {GraphEdge[]} edges
 */
export function assertSocietyGraph(nodes, edges) {
  if (!Array.isArray(nodes) || nodes.length < 20) {
    throw new Error("society graph needs enough nodes");
  }
  const ids = new Set();
  for (const node of nodes) {
    if (
      !node.id ||
      !node.name ||
      typeof node.category !== "number" ||
      typeof node.x !== "number" ||
      typeof node.y !== "number"
    ) {
      throw new Error(`invalid node: ${JSON.stringify(node)}`);
    }
    if (ids.has(node.id)) throw new Error(`duplicate node id: ${node.id}`);
    ids.add(node.id);
  }
  for (const need of [
    "hui1",
    "hui2",
    "hui3",
    "bai1",
    "hong1",
    "lan5",
    "lords",
    "safe",
    "forest",
    "fire",
    "huoshan",
    "qinglong",
    "sufeng",
    "heibao",
    "forest-n",
    "center9",
    "chonglian",
    "plot11",
    "blue",
  ]) {
    if (!ids.has(need)) throw new Error(`missing node: ${need}`);
  }
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error(`edge points to missing node: ${edge.source} -> ${edge.target}`);
    }
  }
}
