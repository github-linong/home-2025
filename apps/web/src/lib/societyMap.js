/** Schematic geo-map data for the novel's base / forest / territory layout. */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   kind: 'region' | 'base' | 'forest' | 'landmark' | 'local' | 'plot' | 'pack' | 'creature',
 *   x: number,
 *   y: number,
 *   w?: number,
 *   h?: number,
 *   note?: string,
 * }} MapMarker
 * @typedef {{
 *   id: string,
 *   from: string,
 *   to: string,
 *   label: string,
 *   curved?: boolean,
 * }} MapPath
 * @typedef {{
 *   id: string,
 *   label: string,
 *   x: number,
 *   y: number,
 *   w: number,
 *   h: number,
 * }} MapZone
 * @typedef {{ code: string, name: string, note: string }} NumberedRow
 * @typedef {{ id: string, text: string, x: number, y: number }} MapAnnotation
 */

/**
 * Soft region envelopes on 1000×900 canvas.
 * Macro regions sit on the rim; 晖三编号山系集中在中部贴林带。
 * @type {MapZone[]}
 */
export const SOCIETY_MAP_ZONES = [
  { id: "z-bai", label: "白城大区（北·远）", x: 380, y: 8, w: 240, h: 70 },
  { id: "z-lan", label: "兰城大区（西·远）", x: 8, y: 180, w: 130, h: 200 },
  { id: "z-hong", label: "红城大区（东北·远）", x: 820, y: 16, w: 160, h: 150 },
  { id: "z-hui", label: "晖城大区（中）", x: 160, y: 120, w: 640, h: 520 },
  { id: "z-gui", label: "桂城大区（南·远）", x: 380, y: 800, w: 240, h: 70 },
];

/**
 * Numbered mountain domains near 晖三 (ridge/lake sequence).
 * Spatial anchors from text:
 * - 五十号山在四十九号山东边（约 16×12 km 大山域）
 * - 四十九→六十号山直线约六十里；五十五号山介于其间（北狼核心）
 * - 五十二号山为飞往六十号山途中会合点
 * - 六十一号山在六十号山北缘熊洞一带
 * - 五十一号山邻接五十号山东侧
 * - 二十二号山在南部进化林深处（南部狼领地，距北部一区约数百里）
 * @type {NumberedRow[]}
 */
export const SOCIETY_MOUNTAIN_ROWS = [
  {
    code: "二十二号山",
    name: "南部进化林深处",
    note: "南部狼群内部领地；瀑布下水潭、进化川苔草采集点。距北部一区约数百里山路。",
  },
  {
    code: "二十六号山",
    name: "晖一方向山域",
    note: "老四复仇与跨区交锋情节中出现；偏晖一东侧进化林序列。",
  },
  {
    code: "四十九号山",
    name: "贴领地主林带",
    note: "三峰；一/三/四/六区等分区。贴北部一区北/西隔离带；青龙实训与北狼活动密集。三区曾归夏青经营，第三峰偏狼群。",
  },
  {
    code: "五十号山",
    name: "四十九号山东邻 · 试验区",
    note: "约东西 16 公里、南北 12 公里、四峰；原熊域后入狼安保。夏青主管红色戕草土壤修复试验；含隐蔽山谷、熊洞、硬度竹与绿灯松。",
  },
  {
    code: "五十一号山",
    name: "五十号山东侧邻山",
    note: "金丝猴等入侵/流失情节出镜；与五十号山同属东向编号延伸。",
  },
  {
    code: "五十二号山",
    name: "北向航线会合点",
    note: "自四十九号山顶停机坪飞往六十号山时，常在此接头狼/断腰狼再北行。",
  },
  {
    code: "五十五号山",
    name: "北部狼群核心山域",
    note: "距四十九号山极近（狼跑数分钟级）。常住/争议核心；与四十九泉水、六十暗河水系相关。",
  },
  {
    code: "六十号山",
    name: "北向远端 · 山核桃",
    note: "至四十九号山直线约六十里。山核桃树坐标；北边毗蟒蛇领地。",
  },
  {
    code: "六十一号山",
    name: "六十号山北缘",
    note: "半山腰熊洞等坐标；与六十号山同列北向远端。",
  },
  {
    code: "烈火山",
    name: "晖一安区外据点",
    note: "烈火盘踞；距晖三北部一区约数百里，不属晖三四十九序列。",
  },
];

/**
 * Key numbered plots in 晖三北部一区.
 * @type {NumberedRow[]}
 */
export const SOCIETY_TERRITORY_ROWS = [
  {
    code: "北部一区",
    name: "约 1–26 号领地群",
    note: "晖三安全区北侧外合法耕垦带；铁网墙北隔离带直接贴四十九 / 五十号山。",
  },
  {
    code: "一号领地",
    name: "前哨弧 · 偏北",
    note: "直邻二号★、三号★；与二、三同属安全区核心区；进化鼠排查等事件中常联动，兼作联盟信息／资源枢纽。",
  },
  {
    code: "二号领地",
    name: "唐怀线 → 空缺再分配",
    note: "安全区西南角；直邻一★、三★、十一★、九★。失主后可由领地管理部收回。进化鼠外溢时首批排查对象，亦是十一号的直接屏障。",
  },
  {
    code: "三号领地",
    name: "夏青主舞台",
    note: "直邻二★、四★、九★。南贴安全区边缘；北向经旧隔离带望北部一区神狼域，东头已堵树设障防误闯；西接西部狼缓冲；东北向待定十一号。泉水、羊老大、北狼邻居；进化鼠事件首发地。",
  },
  {
    code: "四号领地",
    name: "赵泽 · 邻地领主",
    note: "直邻三★、九★；与三号仅二十多米，进化鼠排查第一线。夏青同盟核心邻地。",
  },
  {
    code: "六号领地",
    name: "西侧邻地",
    note: "与七号西侧相邻；曾有野梧桐紧急支援。",
  },
  {
    code: "七号领地",
    name: "张三 · 七号领主",
    note: "张三驻地；其人同时担任第九种植中心负责人。样本检测与科研团队骨干（如张陶）常挂靠此线。五十号山试验业务由夏青主管，勿把山域误写成「七号实验区」。",
  },
  {
    code: "八号领地",
    name: "基建对照邻居",
    note: "别墅／林地等基建常被对照提及；勿与九号 wild 接壤线混为一谈。",
  },
  {
    code: "九号领地",
    name: "wild 接壤 · 进化鼠威胁源向",
    note: "与二★、三★、四★直邻；前哨弧外侧 wild 地块。后段亦可改建为第九种植中心（九号线／第九中心同源叙事）。",
  },
  {
    code: "十一号领地",
    name: "东北向待定 · 霍家中签",
    note: "相对三号偏东北；与二号★直邻（核心区侧屏障）。霍家父子侥幸中签尚未正式接管；若成行，霍雷（四级）／霍准（七级）可为夏青同盟北翼增援，北线有望连片。晖一名义管辖；重联、张十/叶杨等亦曾染指。",
  },
  {
    code: "十八 / 二十二 / 二十三号等",
    name: "后段扩编块",
    note: "北部一区后期仍按编号扩殖；勿与二十二号山混淆（山≠地）。",
  },
];

/**
 * Direct adjacency among core plots 1–4 (★ = story-confirmed neighbor).
 * @typedef {{ plot: string, neighbors: string, link: string }} TerritoryAdjacencyRow
 * @type {TerritoryAdjacencyRow[]}
 */
export const SOCIETY_TERRITORY_ADJACENCY = [
  {
    plot: "一号",
    neighbors: "二号★、三号★",
    link: "与二号、三号同属安全区核心区；在排查进化鼠等事件中经常联动，是领地联盟的信息与资源枢纽",
  },
  {
    plot: "二号",
    neighbors: "一号★、三号★、十一号★、九号★",
    link: "处于安全区西南角，与多块 wild 领地接壤；进化鼠外溢时首批被排查，也是十一号领地的直接屏障",
  },
  {
    plot: "三号",
    neighbors: "二号★、四号★、九号★",
    link: "「啮齿类进化鼠」事件首发地；夏青在此布防并准许排查队进入，四号、九号随后跟进处置",
  },
  {
    plot: "四号",
    neighbors: "三号★、九号★",
    link: "与三号仅二十多米，是排查进化鼠时的「第一线」；因距离过近，三号、四号同时受到九号方向的威胁",
  },
];

/** Layout note for plots 1–4 as a safe-zone → wild outpost arc. */
export const SOCIETY_TERRITORY_OUTPOST_NOTE =
  "一号、二号、三号、四号连成一片，构成安全区向 wild 扩张的前哨区：一号偏北、二号居中偏西、三号在东南、四号紧接三号再往东，形成包围 wild（九号、十一号等）的弧形防线。处理三／四号危险时，常需同时兼顾一号侧安全区指挥体系与二号侧后勤支援。";

/**
 * Xia Qing's three strategic fronts from 三号 (adjacent / near powers).
 * @typedef {{ direction: string, focus: string, note: string }} XiaqingFrontRow
 * @type {XiaqingFrontRow[]}
 */
export const SOCIETY_XIAQING_FRONTS = [
  {
    direction: "北部",
    focus: "北部一区领地（神狼域）",
    note: "受「神狼」庇佑；北狼曾与西部狼群对吼驱敌，被当地人奉为神明。夏青盼霍家入主十一号，使北方战力／资源连成一片。",
  },
  {
    direction: "西部",
    focus: "西部狼群控制区",
    note: "西部狼曾试图入侵北部一区，被神狼威慑退回。对夏青既是潜在野怪威胁，也是未来扩张或交易对象。",
  },
  {
    direction: "东北",
    focus: "十一号领地（待定）",
    note: "霍家父子侥幸中签尚未正式接管；若成行，霍雷（四级）与霍准（七级）可为夏青联盟增援。",
  },
];

/** Macro layout around 三号：safe zone, isolation belt, wolf buffer, pending 11. */
export const SOCIETY_XIAQING_LAYOUT_NOTE =
  "三号位于安全区边缘：北靠北部一区神狼域、西接西部狼地盘、东北向待定十一号。与北缘领地隔旧隔离带，夏青已在旧隔离带东头堵树设障防误闯。西狼与北区冲突缓冲带，正好构成安全区与 wild 之间的战略纵深。综合：北有盟友／神狼、南有安全区、西有狼群天然屏障、东／东北有待定扩展空间，相对稳固且可外拓。";

/** One-line ASCII schematic for the board (≈ = adjacent or belt-separated). */
export const SOCIETY_XIAQING_LAYOUT_DIAGRAM = [
  "安全区 → 夏青领地 ≈ 北部一区领地（神狼）≈ 十一号领地（霍家待定）",
  " │",
  " └── 西部狼群",
];

/**
 * Named packs / clans around 晖三.
 * @type {NumberedRow[]}
 */
export const SOCIETY_PACK_ROWS = [
  {
    code: "北部狼群",
    name: "五十五 / 四十九号山一带 · 神狼",
    note: "头狼（神狼／女王）、断腰狼、帅巨狼、狼犬老二、病狼等。核心偏五十五号山，日常贴四十九号山与三号地；曾与西部狼对吼驱敌，北区人奉为神明。",
  },
  {
    code: "西部狼群",
    name: "晖三西部进化林（晖六东缘）",
    note: "驻守西林深处，阻猴群东扩；曾试图入侵北部一区，被神狼威慑退回。对三号既是西侧屏障／缓冲，也是潜在威胁与可交易、可扩张对象。",
  },
  {
    code: "南部狼群",
    name: "二十二号山一带 · 老四",
    note: "距北部一区约数百里；瀑布水潭、与虎群邻域。老四为狼王/前狼王线。",
  },
  {
    code: "东部豺狼群",
    name: "东部进化林 / 五十–五十一号山东侧一带",
    note: "原文多称「豺狼」；有豺王线。与晖一东部狼群（晖一东侧进化林）不是同一群体。",
  },
  {
    code: "北部熊群",
    name: "五十号山熊洞 / 六十一号山",
    note: "五十号山原为熊域；六十一号山亦有熊洞坐标。",
  },
  {
    code: "西部虎群",
    name: "南部狼西邻高危域",
    note: "与二十二号山狼域相邻/共管狩猎区；进境需狼护送。",
  },
  {
    code: "晖一东部狼群等",
    name: "晖一东侧进化林",
    note: "晖一东 / 西 / 南狼群独立命名；二十六号山等跨区情节关联。",
  },
];

/**
 * Distance / scale callouts (canvas coords).
 * @type {MapAnnotation[]}
 */
export const SOCIETY_MAP_ANNOTATIONS = [
  { id: "a-scale", text: "示意比例：四十九→六十 ≈ 六十里直距", x: 500, y: 118 },
  { id: "a-49-50", text: "东邻 · 五十更大", x: 560, y: 248 },
  { id: "a-south-far", text: "↕ 南部进化林 · 约数百里", x: 500, y: 620 },
  { id: "a-huoshan-far", text: "烈火山距北部一区约数百里", x: 280, y: 740 },
];

/**
 * Layout rules (north↑):
 * 1. Far bases on rim: 白北、兰西、红东北、桂南；晖一/晖五在晖三正南。
 * 2. Local mountain belt north of 北部一区: …61–60–52–55–49–50–51…
 * 3. Plots south of 49/50；晖三安区再南。
 * 4. 22号山 + 南部狼远在更南；烈火山偏晖一西。
 * @type {MapMarker[]}
 */
export const SOCIETY_MAP_MARKERS = [
  // —— macro far ——
  { id: "bai1", label: "白一", kind: "base", x: 500, y: 40, w: 64, h: 26, note: "白城 / 北·远" },
  { id: "hong11", label: "红十一", kind: "base", x: 880, y: 56, w: 76, h: 26, note: "北林远端" },
  { id: "hong1", label: "红一", kind: "base", x: 900, y: 120, w: 64, h: 26, note: "红城核心" },
  { id: "lan5", label: "兰五", kind: "base", x: 56, y: 260, w: 64, h: 26, note: "西北通路远端" },

  // —— N numbered belt (far→near toward 49) ——
  { id: "mt-61", label: "六十一号山", kind: "forest", x: 300, y: 130, w: 108, h: 28, note: "六十北缘 · 熊洞" },
  { id: "mt-60", label: "六十号山", kind: "forest", x: 300, y: 175, w: 108, h: 30, note: "≈60里至49" },
  { id: "mt-52", label: "五十二号山", kind: "forest", x: 360, y: 220, w: 108, h: 28, note: "飞六十会合" },
  { id: "mt-55", label: "五十五号山", kind: "forest", x: 420, y: 255, w: 108, h: 28, note: "北狼核心" },
  { id: "mt-49", label: "四十九号山", kind: "forest", x: 480, y: 290, w: 128, h: 34, note: "贴领地主林" },
  { id: "mt-50", label: "五十号山", kind: "forest", x: 640, y: 280, w: 140, h: 40, note: "东邻大山域" },
  { id: "mt-51", label: "五十一号山", kind: "forest", x: 780, y: 260, w: 108, h: 28, note: "50东侧" },

  // —— packs on their mountains ——
  { id: "pack-n", label: "北部狼群", kind: "pack", x: 420, y: 300, w: 96, h: 26, note: "55/49" },
  { id: "c-tou", label: "头狼", kind: "creature", x: 360, y: 330, w: 54, h: 20, note: "女王" },
  { id: "c-duanyao", label: "断腰狼", kind: "creature", x: 430, y: 330, w: 68, h: 20, note: "北线枢纽" },
  { id: "c-shuai", label: "帅巨狼", kind: "creature", x: 500, y: 330, w: 68, h: 20, note: "主力战力" },
  { id: "c-laoer", label: "狼犬老二", kind: "creature", x: 570, y: 330, w: 80, h: 20, note: "常驻三号侧" },
  { id: "pack-bear", label: "北部熊群", kind: "pack", x: 640, y: 330, w: 96, h: 26, note: "50熊洞" },
  { id: "pack-jackal", label: "东部豺狼", kind: "pack", x: 780, y: 300, w: 96, h: 26, note: "东线豺狼" },
  { id: "pack-w", label: "西部狼群", kind: "pack", x: 200, y: 300, w: 96, h: 26, note: "西林深处" },

  // —— west corridor ——
  { id: "hui6", label: "晖六", kind: "base", x: 120, y: 360, w: 68, h: 26, note: "西向邻基" },

  // —— plots: south of 49/50, still north of 晖三 ——
  // Outpost arc (N→safe): 1 north, 2 mid-west, 3 SE, 4 east of 3; wild 9/11 beyond the arc
  { id: "t6", label: "六号地", kind: "plot", x: 300, y: 400, w: 60, h: 22, note: "七号西邻" },
  { id: "t7", label: "七号地", kind: "plot", x: 370, y: 400, w: 60, h: 22, note: "张三线路" },
  { id: "t1", label: "一号地", kind: "plot", x: 500, y: 350, w: 60, h: 22, note: "前哨弧偏北" },
  { id: "t2", label: "二号地", kind: "plot", x: 420, y: 390, w: 60, h: 22, note: "西南角·唐怀" },
  { id: "t3", label: "三号地", kind: "plot", x: 520, y: 410, w: 60, h: 22, note: "夏青·东南" },
  { id: "c-sheep", label: "羊老大", kind: "creature", x: 520, y: 438, w: 64, h: 20, note: "三号伙伴" },
  { id: "t4", label: "四号地", kind: "plot", x: 600, y: 410, w: 60, h: 22, note: "赵泽·贴三号" },
  { id: "t9", label: "九号地", kind: "plot", x: 560, y: 355, w: 60, h: 22, note: "wild·鼠威胁向" },
  { id: "t11", label: "十一号地", kind: "plot", x: 640, y: 330, w: 68, h: 22, note: "东北向·霍家待定" },
  { id: "north1", label: "北部一区·1–26号", kind: "local", x: 500, y: 460, w: 150, h: 28, note: "贴林耕垦带" },
  { id: "hui3", label: "晖三安全区", kind: "base", x: 500, y: 500, w: 110, h: 32, note: "安区治所" },
  { id: "hui2", label: "晖二", kind: "base", x: 640, y: 500, w: 68, h: 26, note: "同区东邻" },

  // —— deep south: hundreds of li ——
  { id: "mt-22", label: "二十二号山", kind: "forest", x: 420, y: 680, w: 120, h: 30, note: "南部狼核心" },
  { id: "pack-s", label: "南部狼群", kind: "pack", x: 420, y: 720, w: 96, h: 26, note: "数百里外" },
  { id: "c-laosi", label: "老四", kind: "creature", x: 500, y: 720, w: 60, h: 20, note: "南狼王线" },
  { id: "pack-tiger", label: "西部虎群", kind: "pack", x: 300, y: 700, w: 96, h: 26, note: "邻22号山" },
  { id: "pack-hyena", label: "南部鬣狗群", kind: "pack", x: 560, y: 700, w: 112, h: 24, note: "南线邻族" },

  // —— 晖一 belt south of 晖城, still north of 桂 ——
  { id: "mt-26", label: "二十六号山", kind: "forest", x: 700, y: 660, w: 108, h: 28, note: "晖一东侧序列" },
  { id: "pack-hui1-e", label: "晖一东部狼群", kind: "pack", x: 700, y: 700, w: 120, h: 24, note: "晖一侧" },
  { id: "huoshan", label: "烈火山", kind: "landmark", x: 280, y: 780, w: 92, h: 28, note: "数百里外据点" },
  { id: "hui1", label: "晖一", kind: "base", x: 480, y: 780, w: 68, h: 26, note: "晖三正南邻基" },
  { id: "hui5", label: "晖五", kind: "base", x: 600, y: 800, w: 68, h: 26, note: "晖三东南邻基" },
  { id: "gui3", label: "桂三", kind: "base", x: 500, y: 850, w: 68, h: 26, note: "更南临海" },
];

/**
 * Connectors emphasize adjacency / known corridors (not every social link).
 * @type {MapPath[]}
 */
export const SOCIETY_MAP_PATHS = [
  { id: "p-61-60", from: "mt-61", to: "mt-60", label: "北缘" },
  { id: "p-60-52", from: "mt-60", to: "mt-52", label: "航线" },
  { id: "p-52-55", from: "mt-52", to: "mt-55", label: "" },
  { id: "p-55-49", from: "mt-55", to: "mt-49", label: "数分钟级" },
  { id: "p-49-50", from: "mt-49", to: "mt-50", label: "东邻" },
  { id: "p-50-51", from: "mt-50", to: "mt-51", label: "东延" },
  { id: "p-lan-60", from: "lan5", to: "mt-60", label: "西北林远路", curved: true },
  { id: "p-hong-51", from: "hong11", to: "mt-51", label: "北林通路", curved: true },
  { id: "p-hui6-w", from: "hui6", to: "pack-w", label: "西林" },
  { id: "p-w-55", from: "pack-w", to: "mt-55", label: "", curved: true },
  { id: "p-pack-n-55", from: "pack-n", to: "mt-55", label: "核心" },
  { id: "p-bear-50", from: "pack-bear", to: "mt-50", label: "熊洞" },
  { id: "p-jackal-51", from: "pack-jackal", to: "mt-51", label: "" },
  { id: "p-49-north", from: "mt-49", to: "north1", label: "贴隔离带" },
  { id: "p-50-north", from: "mt-50", to: "north1", label: "试验区南缘", curved: true },
  { id: "p-t3", from: "t3", to: "north1", label: "" },
  { id: "p-t3-t11", from: "t3", to: "t11", label: "东北待定", curved: true },
  { id: "p-t3-w", from: "t3", to: "pack-w", label: "西向缓冲", curved: true },
  { id: "p-t7", from: "t7", to: "north1", label: "" },
  { id: "p-north-safe", from: "north1", to: "hui3", label: "出区向南" },
  { id: "p-laoer-t3", from: "c-laoer", to: "t3", label: "邻居" },
  { id: "p-sheep-t3", from: "c-sheep", to: "t3", label: "" },
  { id: "p-duanyao-n", from: "c-duanyao", to: "pack-n", label: "" },
  { id: "p-south-gap", from: "hui3", to: "mt-22", label: "数百里山路", curved: true },
  { id: "p-22-s", from: "mt-22", to: "pack-s", label: "领地" },
  { id: "p-s-laosi", from: "pack-s", to: "c-laosi", label: "" },
  { id: "p-tiger-22", from: "pack-tiger", to: "mt-22", label: "邻域" },
  { id: "p-26-hui1e", from: "mt-26", to: "pack-hui1-e", label: "" },
  { id: "p-hui1-hui3", from: "hui1", to: "hui3", label: "擂台邻基", curved: true },
  { id: "p-volcano", from: "hui1", to: "huoshan", label: "林缘据点" },
  { id: "p-gui", from: "gui3", to: "hui1", label: "难民北冲", curved: true },
];

/**
 * @param {MapMarker[]} markers
 * @param {MapPath[]} paths
 * @param {MapZone[]} zones
 */
export function assertSocietyMap(markers, paths, zones) {
  if (!Array.isArray(markers) || markers.length < 20) {
    throw new Error("society map needs enough markers");
  }
  const ids = new Set();
  for (const m of markers) {
    if (!m.id || !m.label || !m.kind || typeof m.x !== "number" || typeof m.y !== "number") {
      throw new Error(`invalid marker: ${JSON.stringify(m)}`);
    }
    if (ids.has(m.id)) throw new Error(`duplicate marker: ${m.id}`);
    ids.add(m.id);
  }
  for (const need of [
    "hui3",
    "hui1",
    "mt-22",
    "mt-49",
    "mt-50",
    "mt-51",
    "mt-52",
    "mt-55",
    "mt-60",
    "mt-61",
    "t3",
    "t7",
    "huoshan",
    "pack-n",
    "pack-w",
    "pack-s",
    "c-laosi",
    "c-laoer",
    "c-duanyao",
  ]) {
    if (!ids.has(need)) throw new Error(`missing map marker: ${need}`);
  }

  // Relative geography sanity (canvas y grows south).
  const at = (id) => markers.find((m) => m.id === id);
  const m49 = at("mt-49");
  const m50 = at("mt-50");
  const m60 = at("mt-60");
  const m22 = at("mt-22");
  const north1 = at("north1");
  const hui3 = at("hui3");
  if (!(m50.x > m49.x)) throw new Error("五十号山 should be east of 四十九号山");
  if (!(m60.y < m49.y)) throw new Error("六十号山 should be north of 四十九号山");
  if (!(Math.hypot(m60.x - m49.x, m60.y - m49.y) > Math.hypot(m50.x - m49.x, m50.y - m49.y))) {
    throw new Error("六十号山 should be farther from 四十九 than 五十 is");
  }
  if (!(m22.y > north1.y && m22.y > hui3.y)) {
    throw new Error("二十二号山 should be south of northern plot / 晖三");
  }

  const t1 = at("t1");
  const t2 = at("t2");
  const t3 = at("t3");
  const t4 = at("t4");
  if (!(t1.y < t3.y && t1.y < t4.y)) {
    throw new Error("一号地 should sit north of 三号 / 四号 on schematic");
  }
  if (!(t2.x < t3.x && t4.x > t3.x)) {
    throw new Error("二号 west of 三号, 四号 east of 三号 on schematic");
  }
  if (!(Math.hypot(t4.x - t3.x, t4.y - t3.y) < 120)) {
    throw new Error("四号 should sit close to 三号 on schematic (~二十多米 lore)");
  }

  for (const path of paths) {
    if (!ids.has(path.from) || !ids.has(path.to)) {
      throw new Error(`map path points to missing marker: ${path.from} -> ${path.to}`);
    }
  }
  if (!Array.isArray(zones) || zones.length < 5) {
    throw new Error("society map needs five region zones");
  }
}

/**
 * @param {NumberedRow[]} mountains
 * @param {NumberedRow[]} territories
 * @param {NumberedRow[]} [packs]
 */
export function assertNumberedCatalog(mountains, territories, packs = []) {
  for (const code of ["二十二", "四十九", "五十", "五十一", "五十二", "五十五", "六十", "六十一"]) {
    if (!mountains.some((r) => r.code.includes(code))) {
      throw new Error(`missing mountain ${code}`);
    }
  }
  if (!territories.some((r) => r.code.includes("三号"))) {
    throw new Error("missing 三号领地");
  }
  if (!territories.some((r) => r.code.includes("七号"))) {
    throw new Error("missing 七号领地");
  }
  if (!territories.some((r) => r.code.includes("九号领地"))) {
    throw new Error("missing 九号领地");
  }
  if (!territories.some((r) => r.code.includes("十一号"))) {
    throw new Error("missing 十一号领地");
  }
  if (packs.length) {
    if (!packs.some((r) => r.code.includes("北部狼"))) {
      throw new Error("missing 北部狼群");
    }
    if (!packs.some((r) => r.code.includes("南部狼"))) {
      throw new Error("missing 南部狼群");
    }
    if (!packs.some((r) => r.note.includes("老四") || r.code.includes("老四"))) {
      throw new Error("missing 老四 in pack catalog");
    }
  }
}

/**
 * Client payload for ECharts / AntV / Leaflet renderers (same coordinates as SVG).
 */
export function buildSocietyMapPayload() {
  return {
    vbW: 1000,
    vbH: 900,
    markers: SOCIETY_MAP_MARKERS.filter((m) => m.kind !== "region"),
    paths: SOCIETY_MAP_PATHS,
    zones: SOCIETY_MAP_ZONES,
    annotations: SOCIETY_MAP_ANNOTATIONS,
  };
}

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   note?: string,
 *   fill?: string,
 *   stroke?: string,
 *   text?: string,
 *   children?: AdminNestNode[],
 * }} AdminNestNode
 */

/**
 * Administrative containment (nation ⊃ region ⊃ base ⊃ districts),
 * like 中国 ⊃ 河北 ⊃ 石家庄 ⊃ 市区 — not stacked farm-plot cards.
 * @type {Record<string, { id: string, title: string, blurb: string, root: AdminNestNode }>}
 */
export const SOCIETY_ADMIN_NESTS = {
  hui1: {
    id: "hui1",
    title: "晖一示例",
    blurb: "华国 ⊃ 晖城大区 ⊃ 晖一 ⊃ 安全区（内/外城）⊃ 区外领主防护林与进化林。",
    root: {
      id: "nation",
      label: "华国",
      note: "灾后国家行政框架",
      fill: "#eef2ea",
      stroke: "#8a9580",
      text: "#2f3540",
      children: [
        {
          id: "reg-hui",
          label: "晖城大区",
          note: "同区尚有晖二～晖六等并列基地",
          fill: "#e2e9d8",
          stroke: "#6f7d62",
          text: "#2f3540",
          children: [
            {
              id: "hui1",
              label: "晖一基地",
              note: "晖三正南邻基；对十一号等地有名义管辖",
              fill: "#d5dde8",
              stroke: "#4a5568",
              text: "#1f2430",
              children: [
                {
                  id: "safe",
                  label: "安全区",
                  note: "人类主聚居核（墙内）",
                  fill: "#2f3540",
                  stroke: "#d7dbe3",
                  text: "#f4f6f8",
                  children: [
                    {
                      id: "outer",
                      label: "外城",
                      note: "外围聚居 / 简易营建层",
                      fill: "#4a5568",
                      stroke: "#c8d0dc",
                      text: "#f4f6f8",
                      children: [
                        {
                          id: "inner",
                          label: "内城",
                          note: "核心衙署 / 坚固居住",
                          fill: "#1c2128",
                          stroke: "#e8eef8",
                          text: "#f4f6f8",
                        },
                      ],
                    },
                  ],
                },
                {
                  id: "outskirt",
                  label: "安全区外",
                  note: "领主空间与林缘",
                  fill: "#e8efe0",
                  stroke: "#5c6b3a",
                  text: "#2f3a28",
                  children: [
                    {
                      id: "lord-belt",
                      label: "领主防护林带",
                      note: "领地内缓冲林 / 防护林 + 耕地",
                      fill: "#5c6b3a",
                      stroke: "#e2ecc8",
                      text: "#f7faef",
                      children: [
                        {
                          id: "plots",
                          label: "编号领地",
                          note: "如十一号等；名义上可挂晖一",
                          fill: "#6d8a3e",
                          stroke: "#f0f6d8",
                          text: "#f7faef",
                        },
                      ],
                    },
                    {
                      id: "iso",
                      label: "隔离带",
                      note: "耕地与进化林过渡",
                      fill: "#9aa882",
                      stroke: "#5a6648",
                      text: "#2f3a28",
                    },
                    {
                      id: "evo",
                      label: "进化林",
                      note: "二十六号山、晖一东侧狼群等",
                      fill: "#3f5230",
                      stroke: "#c9d9b8",
                      text: "#f5f8f0",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  hui3: {
    id: "hui3",
    title: "晖三主舞台",
    blurb: "同构读法：华国 ⊃ 晖城 ⊃ 晖三 ⊃ 内外城 ⊃ 北部一区（含领主缓冲林）⊃ 隔离带外进化林。",
    root: {
      id: "nation",
      label: "华国",
      note: "灾后国家行政框架",
      fill: "#eef2ea",
      stroke: "#8a9580",
      text: "#2f3540",
      children: [
        {
          id: "reg-hui",
          label: "晖城大区",
          note: "晖一～晖六等同区并列",
          fill: "#e2e9d8",
          stroke: "#6f7d62",
          text: "#2f3540",
          children: [
            {
              id: "hui3",
              label: "晖三基地",
              note: "主舞台；人数排名第三的基地之一",
              fill: "#d5dde8",
              stroke: "#4a5568",
              text: "#1f2430",
              children: [
                {
                  id: "safe",
                  label: "晖三安全区",
                  note: "治所 · 铁网墙内",
                  fill: "#2f3540",
                  stroke: "#d7dbe3",
                  text: "#f4f6f8",
                  children: [
                    {
                      id: "outer",
                      label: "外城",
                      note: "外围简易房 / 强风易损层（原文亦称外城）",
                      fill: "#4a5568",
                      stroke: "#c8d0dc",
                      text: "#f4f6f8",
                      children: [
                        {
                          id: "inner",
                          label: "内城",
                          note: "核心坚固区；近内城更贵更安",
                          fill: "#1c2128",
                          stroke: "#e8eef8",
                          text: "#f4f6f8",
                        },
                      ],
                    },
                  ],
                },
                {
                  id: "outskirt",
                  label: "安全区外",
                  note: "合法耕垦与林缘",
                  fill: "#e8efe0",
                  stroke: "#5c6b3a",
                  text: "#2f3a28",
                  children: [
                    {
                      id: "north1",
                      label: "北部一区 · 1–26 号",
                      note: "墙北耕垦带",
                      fill: "#4a5d48",
                      stroke: "#d5e2c8",
                      text: "#f5f8f0",
                      children: [
                        {
                          id: "t3",
                          label: "三号领地（例）",
                          note: "耕地 + 西/北缓冲林（领主防护林）",
                          fill: "#6d8a3e",
                          stroke: "#f0f6d8",
                          text: "#f7faef",
                        },
                      ],
                    },
                    {
                      id: "iso",
                      label: "隔离带",
                      note: "约五十米宽过渡；定期清理喷药",
                      fill: "#9aa882",
                      stroke: "#5a6648",
                      text: "#2f3a28",
                    },
                    {
                      id: "evo",
                      label: "进化林 · 编号山",
                      note: "四十九 / 五十号山等贴林主脉",
                      fill: "#3f5230",
                      stroke: "#c9d9b8",
                      text: "#f5f8f0",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
};

/**
 * @param {typeof SOCIETY_ADMIN_NESTS} nests
 */
export function assertAdminNests(nests) {
  if (!nests?.hui1?.root || !nests?.hui3?.root) {
    throw new Error("admin nests need hui1 and hui3 roots");
  }
  if (nests.hui1.root.label !== "华国" || nests.hui3.root.label !== "华国") {
    throw new Error("admin nest root should be 华国");
  }
}
