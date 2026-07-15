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
    name: "北区前列地块",
    note: "早期具名邻居；高处可与二 / 三 / 七 / 八 / 九号一并入视野。",
  },
  {
    code: "二号领地",
    name: "唐怀线 → 空缺再分配",
    note: "紧邻三号；失主后可由领地管理部收回，再分配常引发基地间抢夺。",
  },
  {
    code: "三号领地",
    name: "夏青主舞台",
    note: "贴北隔离带与四十九号山；泉水、羊老大、北狼邻居皆落于此。",
  },
  {
    code: "四号领地",
    name: "赵泽线",
    note: "邻接三号一线；入侵报警、巡视应答中常出现。",
  },
  {
    code: "六号领地",
    name: "西侧邻地",
    note: "与七号西侧相邻；曾有野梧桐紧急支援。",
  },
  {
    code: "七号领地",
    name: "张三线路地块",
    note: "与第九种植中心科研线相关的邻域据点；检测、样本流转常经此走廊。五十号山试验区由夏青主管，勿与七号混同。",
  },
  {
    code: "八 / 九号领地",
    name: "基建对照邻居",
    note: "八号别墅/林地、九号标准化大棚常被对照提及。",
  },
  {
    code: "十一号领地",
    name: "空缺争夺焦点",
    note: "领主身亡后成多方焦；晖一名义管辖难稳控；霍家、重联、张十/叶杨等皆有染指线。",
  },
  {
    code: "十八 / 二十二 / 二十三号等",
    name: "后段扩编块",
    note: "北部一区后期仍按编号扩殖；勿与二十二号山混淆（山≠地）。",
  },
];

/**
 * Named packs / clans around 晖三.
 * @type {NumberedRow[]}
 */
export const SOCIETY_PACK_ROWS = [
  {
    code: "北部狼群",
    name: "五十五 / 四十九号山一带",
    note: "头狼、断腰狼、帅巨狼、狼犬老二、病狼等。核心偏五十五号山，日常贴四十九号山与三号地。",
  },
  {
    code: "西部狼群",
    name: "晖三西部进化林（晖六东缘）",
    note: "驻守西林深处，阻猴群东扩；曾发动兽潮。",
  },
  {
    code: "南部狼群",
    name: "二十二号山一带 · 老四",
    note: "距北部一区约数百里；瀑布水潭、与虎群邻域。老四为狼王/前狼王线。",
  },
  {
    code: "东部豺群",
    name: "五十 / 五十一号山东侧",
    note: "东线邻族；排查分区常点名。",
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
  { id: "pack-jackal", label: "东部豺群", kind: "pack", x: 780, y: 300, w: 96, h: 26, note: "东线" },
  { id: "pack-w", label: "西部狼群", kind: "pack", x: 200, y: 300, w: 96, h: 26, note: "西林深处" },

  // —— west corridor ——
  { id: "hui6", label: "晖六", kind: "base", x: 120, y: 360, w: 68, h: 26, note: "西向邻基" },

  // —— plots: south of 49/50, still north of 晖三 ——
  { id: "t6", label: "六号地", kind: "plot", x: 360, y: 380, w: 60, h: 22, note: "七号西邻" },
  { id: "t7", label: "七号地", kind: "plot", x: 430, y: 380, w: 60, h: 22, note: "张三线路" },
  { id: "t3", label: "三号地", kind: "plot", x: 500, y: 380, w: 60, h: 22, note: "夏青" },
  { id: "c-sheep", label: "羊老大", kind: "creature", x: 500, y: 408, w: 64, h: 20, note: "三号伙伴" },
  { id: "t2", label: "二号地", kind: "plot", x: 570, y: 380, w: 60, h: 22, note: "唐怀" },
  { id: "t4", label: "四号地", kind: "plot", x: 640, y: 380, w: 60, h: 22, note: "赵泽" },
  { id: "north1", label: "北部一区·1–26号", kind: "local", x: 500, y: 445, w: 150, h: 28, note: "贴林耕垦带" },
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
  { id: "p-50-north", from: "mt-50", to: "north1", label: "实验区南缘", curved: true },
  { id: "p-t3", from: "t3", to: "north1", label: "" },
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
