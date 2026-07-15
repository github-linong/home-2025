/**
 * Geographic admin-containment graph for AntV G6.
 * North = smaller y (same as SOCIETY_MAP_*). Combos are region envelopes;
 * leaf nodes sit on map coordinates from SOCIETY_MAP_MARKERS where possible.
 */

import { SOCIETY_MAP_MARKERS } from "./societyMap.js";

/**
 * @param {string} id
 * @returns {{ x: number, y: number, label: string, note?: string }}
 */
function marker(id) {
  const m = SOCIETY_MAP_MARKERS.find((row) => row.id === id);
  if (!m) return { x: 500, y: 500, label: id };
  return { x: m.x, y: m.y, label: m.label, note: m.note };
}

/**
 * @param {string} profileId
 * @param {string} localId
 */
function nid(profileId, localId) {
  return `${profileId}:${localId}`;
}

/**
 * @param {string} profileId
 * @param {object} opts
 */
function combo(profileId, opts) {
  const { id, parent, label, note = "", shape = "rect", fill, stroke, padding } = opts;
  return {
    id: nid(profileId, id),
    combo: parent ? nid(profileId, parent) : undefined,
    type: shape,
    data: {
      label,
      note,
      shape,
      fill,
      stroke,
      padding,
    },
  };
}

/**
 * @param {string} profileId
 * @param {object} opts
 */
function place(profileId, opts) {
  const {
    id,
    parent,
    label,
    note = "",
    x,
    y,
    size = 28,
    fill = "#5c6b3a",
    stroke = "#fff",
    kind = "place",
  } = opts;
  return {
    id: nid(profileId, id),
    combo: parent ? nid(profileId, parent) : undefined,
    data: { label, note, role: kind },
    style: {
      x,
      y,
      size,
      fill,
      stroke,
      lineWidth: 1.6,
      labelText: label,
      labelFill: "#1f241c",
      labelFontSize: kind === "anchor" ? 0 : 11,
      labelFontWeight: 650,
      labelPlacement: "bottom",
      labelOffsetY: 5,
      opacity: kind === "anchor" ? 0.35 : 1,
    },
  };
}

/**
 * 晖三: city core south-center; plots / isolation / forests to the north (aligned with geo map).
 */
function buildHui3AdminMap() {
  const p = "hui3";
  const h3 = marker("hui3");
  const n1 = marker("north1");
  const t3 = marker("t3");
  const t7 = marker("t7");
  const t6 = marker("t6");
  const t2 = marker("t2");
  const t4 = marker("t4");
  const mt49 = marker("mt-49");
  const mt50 = marker("mt-50");
  const mt55 = marker("mt-55");
  const mt60 = marker("mt-60");
  const hui1 = marker("hui1");
  const hui2 = marker("hui2");
  const hui5 = marker("hui5");
  const hui6 = marker("hui6");

  const combos = [
    combo(p, {
      id: "nation",
      label: "华国",
      note: "灾后国家框架",
      fill: "#e8eee4",
      stroke: "#6f7a68",
      padding: 44,
    }),
    combo(p, {
      id: "reg-hui",
      parent: "nation",
      label: "晖城大区",
      note: "晖一～晖六等同区并列",
      fill: "#d8e2cc",
      stroke: "#5f6f52",
      padding: 36,
    }),
    combo(p, {
      id: "base",
      parent: "reg-hui",
      label: "晖三基地",
      note: "主舞台 · 安区 + 北侧辖域",
      fill: "#cfd8e8",
      stroke: "#4a5568",
      padding: 30,
    }),
    combo(p, {
      id: "safe",
      parent: "base",
      label: "晖三安全区",
      note: "铁网墙内 · 人类主聚居",
      shape: "circle",
      fill: "#3a4558",
      stroke: "#d7dbe3",
      padding: 26,
    }),
    combo(p, {
      id: "outer",
      parent: "safe",
      label: "外城",
      note: "简易营建 / 强风易损层",
      shape: "circle",
      fill: "#5a6578",
      stroke: "#c8d0dc",
      padding: 20,
    }),
    combo(p, {
      id: "outskirt",
      parent: "base",
      label: "安全区外（北）",
      note: "墙北耕垦 → 隔离带 → 进化林",
      fill: "#e2ecd6",
      stroke: "#5c6b3a",
      padding: 24,
    }),
    combo(p, {
      id: "north1",
      parent: "outskirt",
      label: "北部一区 · 领主防护林带",
      note: "约 1–26 号 · 含缓冲林",
      fill: "#5c6b3a",
      stroke: "#e2ecc8",
      padding: 18,
    }),
    combo(p, {
      id: "iso",
      parent: "outskirt",
      label: "隔离带",
      note: "约五十米宽过渡",
      fill: "#a8b890",
      stroke: "#5a6648",
      padding: 14,
    }),
    combo(p, {
      id: "evo",
      parent: "outskirt",
      label: "进化林 · 编号山",
      note: "贴领地主林带",
      fill: "#3f5230",
      stroke: "#c9d9b8",
      padding: 20,
    }),
  ];

  const nodes = [
    place(p, {
      id: "inner",
      parent: "outer",
      label: "内城",
      note: "核心衙署 / 坚固居住",
      x: h3.x,
      y: h3.y,
      size: 46,
      fill: "#1c2128",
      stroke: "#e8eef8",
    }),
    // Expand 外城 / 安全区 footprints (ring samples)
    place(p, {
      id: "outer-n",
      parent: "outer",
      label: "外城北",
      x: h3.x,
      y: h3.y - 52,
      size: 16,
      fill: "#6a7588",
      kind: "anchor",
    }),
    place(p, {
      id: "outer-s",
      parent: "outer",
      label: "外城南",
      x: h3.x,
      y: h3.y + 52,
      size: 16,
      fill: "#6a7588",
      kind: "anchor",
    }),
    place(p, {
      id: "outer-e",
      parent: "outer",
      label: "外城东",
      x: h3.x + 56,
      y: h3.y,
      size: 16,
      fill: "#6a7588",
      kind: "anchor",
    }),
    place(p, {
      id: "outer-w",
      parent: "outer",
      label: "外城西",
      x: h3.x - 56,
      y: h3.y,
      size: 16,
      fill: "#6a7588",
      kind: "anchor",
    }),
    place(p, {
      id: "safe-n",
      parent: "safe",
      label: "安区北缘",
      x: h3.x,
      y: h3.y - 88,
      size: 12,
      fill: "#4a5568",
      kind: "anchor",
    }),
    place(p, {
      id: "safe-s",
      parent: "safe",
      label: "安区南缘",
      x: h3.x,
      y: h3.y + 72,
      size: 12,
      fill: "#4a5568",
      kind: "anchor",
    }),

    place(p, {
      id: "t6",
      parent: "north1",
      label: "六号",
      note: t6.note || "",
      x: t6.x,
      y: t6.y,
      size: 22,
      fill: "#5c6b3a",
    }),
    place(p, {
      id: "t7",
      parent: "north1",
      label: "七号·张三",
      note: t7.note || "",
      x: t7.x,
      y: t7.y,
      size: 24,
      fill: "#5c6b3a",
    }),
    place(p, {
      id: "t3",
      parent: "north1",
      label: "三号·夏青",
      note: "耕地 + 西/北缓冲林",
      x: t3.x,
      y: t3.y,
      size: 30,
      fill: "#6d8a3e",
    }),
    place(p, {
      id: "t2",
      parent: "north1",
      label: "二号",
      x: t2.x,
      y: t2.y,
      size: 22,
      fill: "#5c6b3a",
    }),
    place(p, {
      id: "t4",
      parent: "north1",
      label: "四号",
      x: t4.x,
      y: t4.y,
      size: 22,
      fill: "#5c6b3a",
    }),
    place(p, {
      id: "buffer",
      parent: "north1",
      label: "领主北缓冲林",
      note: "领地内防护林",
      x: t3.x - 10,
      y: t3.y - 36,
      size: 26,
      fill: "#3f5a30",
    }),
    place(p, {
      id: "north1-label",
      parent: "north1",
      label: n1.label,
      note: n1.note || "",
      x: n1.x,
      y: n1.y + 8,
      size: 18,
      fill: "#4a5d48",
    }),

    place(p, {
      id: "iso-w",
      parent: "iso",
      label: "隔离带西",
      x: 380,
      y: 340,
      size: 14,
      fill: "#8a9870",
      kind: "anchor",
    }),
    place(p, {
      id: "iso-c",
      parent: "iso",
      label: "隔离带（约50m）",
      x: 500,
      y: 335,
      size: 18,
      fill: "#9aa882",
    }),
    place(p, {
      id: "iso-e",
      parent: "iso",
      label: "隔离带东",
      x: 640,
      y: 340,
      size: 14,
      fill: "#8a9870",
      kind: "anchor",
    }),

    place(p, {
      id: "mt49",
      parent: "evo",
      label: mt49.label,
      note: mt49.note || "",
      x: mt49.x,
      y: mt49.y,
      size: 36,
      fill: "#3f5230",
    }),
    place(p, {
      id: "mt50",
      parent: "evo",
      label: mt50.label,
      note: mt50.note || "",
      x: mt50.x,
      y: mt50.y,
      size: 38,
      fill: "#3f5230",
    }),
    place(p, {
      id: "mt55",
      parent: "evo",
      label: mt55.label,
      note: mt55.note || "",
      x: mt55.x,
      y: mt55.y,
      size: 30,
      fill: "#455a38",
    }),
    place(p, {
      id: "mt60",
      parent: "evo",
      label: mt60.label,
      x: mt60.x,
      y: mt60.y,
      size: 26,
      fill: "#455a38",
    }),

    // Sibling bases stay in 晖城但 visibly outside 晖三 envelope
    place(p, {
      id: "hui1-ctx",
      parent: "reg-hui",
      label: "晖一",
      note: "正南邻基",
      x: hui1.x,
      y: hui1.y,
      size: 24,
      fill: "#7a8aa0",
    }),
    place(p, {
      id: "hui2-ctx",
      parent: "reg-hui",
      label: "晖二",
      x: hui2.x,
      y: hui2.y,
      size: 20,
      fill: "#7a8aa0",
    }),
    place(p, {
      id: "hui5-ctx",
      parent: "reg-hui",
      label: "晖五",
      x: hui5.x,
      y: hui5.y,
      size: 20,
      fill: "#7a8aa0",
    }),
    place(p, {
      id: "hui6-ctx",
      parent: "reg-hui",
      label: "晖六",
      x: hui6.x,
      y: hui6.y,
      size: 20,
      fill: "#7a8aa0",
    }),
  ];

  return { nodes, edges: [], combos };
}

/**
 * 晖一: same nesting grammar, city further south; evo forest toward 二十六号山 / east.
 */
function buildHui1AdminMap() {
  const p = "hui1";
  const city = marker("hui1");
  const mt26 = marker("mt-26");
  const packE = marker("pack-hui1-e");
  const huoshan = marker("huoshan");
  const h3 = marker("hui3");
  const hui5 = marker("hui5");

  // City core sits on 晖一 coords; invent nearby ring/outskirt relative to it.
  const cx = city.x;
  const cy = city.y;

  const combos = [
    combo(p, {
      id: "nation",
      label: "华国",
      fill: "#e8eee4",
      stroke: "#6f7a68",
      padding: 44,
    }),
    combo(p, {
      id: "reg-hui",
      parent: "nation",
      label: "晖城大区",
      fill: "#d8e2cc",
      stroke: "#5f6f52",
      padding: 36,
    }),
    combo(p, {
      id: "base",
      parent: "reg-hui",
      label: "晖一基地",
      note: "晖三正南邻基",
      fill: "#cfd8e8",
      stroke: "#4a5568",
      padding: 30,
    }),
    combo(p, {
      id: "safe",
      parent: "base",
      label: "晖一安全区",
      shape: "circle",
      fill: "#3a4558",
      stroke: "#d7dbe3",
      padding: 26,
    }),
    combo(p, {
      id: "outer",
      parent: "safe",
      label: "外城",
      shape: "circle",
      fill: "#5a6578",
      stroke: "#c8d0dc",
      padding: 20,
    }),
    combo(p, {
      id: "outskirt",
      parent: "base",
      label: "安全区外",
      note: "领主防护林 · 隔离带 · 进化林",
      fill: "#e2ecd6",
      stroke: "#5c6b3a",
      padding: 24,
    }),
    combo(p, {
      id: "lord-belt",
      parent: "outskirt",
      label: "领主防护林带",
      note: "含名义管辖领地带",
      fill: "#5c6b3a",
      stroke: "#e2ecc8",
      padding: 18,
    }),
    combo(p, {
      id: "iso",
      parent: "outskirt",
      label: "隔离带",
      fill: "#a8b890",
      stroke: "#5a6648",
      padding: 14,
    }),
    combo(p, {
      id: "evo",
      parent: "outskirt",
      label: "进化林",
      note: "晖一东侧序列等",
      fill: "#3f5230",
      stroke: "#c9d9b8",
      padding: 20,
    }),
  ];

  const nodes = [
    place(p, {
      id: "inner",
      parent: "outer",
      label: "内城",
      x: cx,
      y: cy,
      size: 44,
      fill: "#1c2128",
      stroke: "#e8eef8",
    }),
    place(p, {
      id: "outer-n",
      parent: "outer",
      label: "外城北",
      x: cx,
      y: cy - 48,
      size: 14,
      fill: "#6a7588",
      kind: "anchor",
    }),
    place(p, {
      id: "outer-e",
      parent: "outer",
      label: "外城东",
      x: cx + 52,
      y: cy,
      size: 14,
      fill: "#6a7588",
      kind: "anchor",
    }),
    place(p, {
      id: "outer-w",
      parent: "outer",
      label: "外城西",
      x: cx - 52,
      y: cy,
      size: 14,
      fill: "#6a7588",
      kind: "anchor",
    }),
    place(p, {
      id: "safe-n",
      parent: "safe",
      label: "安区北缘",
      x: cx,
      y: cy - 86,
      size: 12,
      fill: "#4a5568",
      kind: "anchor",
    }),

    place(p, {
      id: "plot11",
      parent: "lord-belt",
      label: "十一号等地",
      note: "晖一名义管辖焦点",
      x: cx - 40,
      y: cy - 130,
      size: 26,
      fill: "#6d8a3e",
    }),
    place(p, {
      id: "buffer",
      parent: "lord-belt",
      label: "领主防护林",
      x: cx + 30,
      y: cy - 150,
      size: 28,
      fill: "#3f5a30",
    }),

    place(p, {
      id: "iso-c",
      parent: "iso",
      label: "隔离带",
      x: cx + 40,
      y: cy - 200,
      size: 18,
      fill: "#9aa882",
    }),
    place(p, {
      id: "iso-e",
      parent: "iso",
      label: "隔离带东",
      x: cx + 120,
      y: cy - 205,
      size: 12,
      fill: "#8a9870",
      kind: "anchor",
    }),

    place(p, {
      id: "mt26",
      parent: "evo",
      label: mt26.label,
      note: mt26.note || "",
      x: mt26.x,
      y: mt26.y,
      size: 32,
      fill: "#3f5230",
    }),
    place(p, {
      id: "pack-e",
      parent: "evo",
      label: packE.label,
      note: packE.note || "",
      x: packE.x,
      y: packE.y,
      size: 24,
      fill: "#6b4a28",
    }),
    place(p, {
      id: "huoshan",
      parent: "reg-hui",
      label: huoshan.label,
      note: "晖一安区外据点",
      x: huoshan.x,
      y: huoshan.y,
      size: 28,
      fill: "#b5482a",
    }),
    place(p, {
      id: "hui3-ctx",
      parent: "reg-hui",
      label: "晖三",
      note: "正北主舞台",
      x: h3.x,
      y: h3.y,
      size: 24,
      fill: "#7a8aa0",
    }),
    place(p, {
      id: "hui5-ctx",
      parent: "reg-hui",
      label: "晖五",
      x: hui5.x,
      y: hui5.y,
      size: 20,
      fill: "#7a8aa0",
    }),
  ];

  return { nodes, edges: [], combos };
}

/**
 * @param {string} profileId
 */
export function buildAdminNestGraphData(profileId) {
  if (profileId === "hui3") return buildHui3AdminMap();
  return buildHui1AdminMap();
}
