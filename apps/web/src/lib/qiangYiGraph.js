/** Graph data for 戕 / 颐 relationship diagram — fixed dual-track layout. */

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
 */

/** @type {{ name: string }[]} */
export const QIANG_YI_CATEGORIES = [
  { name: "起点 / 核心" },
  { name: "戕向（恶性侧）" },
  { name: "颐向（良性侧）" },
  { name: "人为调节" },
  { name: "落地结果" },
];

/**
 * Coordinates are percent of chart (layout: none).
 * Left column = 戕 track, right column = 颐 track, center = synthesis.
 *
 * @type {GraphNode[]}
 */
export const QIANG_YI_NODES = [
  { id: "core-field", name: "磁场紊乱 · 大气异变", category: 0, x: 50, y: 5, symbolSize: [168, 40] },
  { id: "qiang", name: "戕", category: 1, x: 22, y: 20, symbolSize: [72, 48] },
  { id: "yi", name: "颐", category: 2, x: 78, y: 20, symbolSize: [72, 48] },
  { id: "qiang-rain", name: "戕雨 / 戕雪", category: 1, x: 12, y: 36, symbolSize: [108, 36] },
  { id: "qiang-risk", name: "失控 / 恶性变异", category: 1, x: 34, y: 36, symbolSize: [120, 36] },
  { id: "yi-stone", name: "颐石", category: 2, x: 62, y: 36, symbolSize: [72, 36] },
  { id: "spring", name: "无污染泉水", category: 2, x: 82, y: 36, symbolSize: [112, 36] },
  { id: "yellow-red", name: "黄灯 · 红灯风险", category: 1, x: 12, y: 52, symbolSize: [120, 36] },
  { id: "anti-qiang", name: "降戕剂", category: 3, x: 32, y: 52, symbolSize: [72, 36] },
  { id: "yi6", name: "颐6 恢复因子", category: 2, x: 52, y: 52, symbolSize: [112, 36] },
  { id: "yi7", name: "颐7", category: 2, x: 74, y: 52, symbolSize: [64, 36] },
  { id: "stim", name: "颐元素刺激液", category: 3, x: 92, y: 52, symbolSize: [112, 36] },
  { id: "shelter", name: "颐石防护 / 大棚", category: 3, x: 48, y: 66, symbolSize: [124, 36] },
  { id: "yi-crop", name: "高颐作物 / 颐蛇", category: 2, x: 76, y: 66, symbolSize: [120, 36] },
  { id: "balance", name: "浓度动态平衡", category: 4, x: 30, y: 72, symbolSize: [120, 36] },
  { id: "evolution", name: "生物大进化", category: 4, x: 22, y: 88, symbolSize: [112, 40] },
  { id: "farming", name: "绿灯品质 · 药剂", category: 4, x: 70, y: 88, symbolSize: [132, 40] },
];

/** @type {GraphEdge[]} */
export const QIANG_YI_EDGES = [
  { source: "core-field", target: "qiang", label: "显现" },
  { source: "core-field", target: "yi", label: "显现" },
  { source: "qiang", target: "qiang-rain", label: "抬升" },
  { source: "qiang", target: "qiang-risk", label: "倾向" },
  { source: "qiang-rain", target: "qiang-risk", label: "诱发" },
  { source: "qiang-risk", target: "yellow-red", label: "后果" },
  { source: "yi", target: "yi-stone", label: "凝练" },
  { source: "yi", target: "spring", label: "富集" },
  { source: "yi", target: "yi7", label: "合成" },
  { source: "yi", target: "yi6", label: "提取" },
  { source: "spring", target: "yi-crop", label: "灌溉" },
  { source: "yi-crop", target: "yi7", label: "颐蛇等", lineType: "dashed" },
  { source: "yi-crop", target: "stim", label: "颐>10" },
  { source: "yi-stone", target: "shelter", label: "造境" },
  { source: "anti-qiang", target: "qiang-risk", label: "缓解", lineType: "dashed" },
  { source: "shelter", target: "qiang-rain", label: "隔挡", lineType: "dashed" },
  { source: "qiang", target: "balance", label: "" },
  { source: "yi", target: "balance", label: "" },
  { source: "yellow-red", target: "farming", label: "拖累" },
  { source: "shelter", target: "farming", label: "保绿" },
  { source: "spring", target: "farming", label: "选址根基" },
  { source: "yi6", target: "farming", label: "抗敏入药" },
  { source: "yi7", target: "farming", label: "胃肠 / 屏障" },
  { source: "stim", target: "farming", label: "爆发战力" },
  { source: "balance", target: "evolution", label: "定方向" },
  { source: "balance", target: "farming", label: "定品质" },
];

/**
 * @param {GraphNode[]} nodes
 * @param {GraphEdge[]} edges
 */
export function assertQiangYiGraph(nodes, edges) {
  if (!Array.isArray(nodes) || nodes.length < 8) {
    throw new Error("qiang/yi graph needs enough nodes");
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
  if (!ids.has("qiang") || !ids.has("yi")) {
    throw new Error("graph must include 戕 and 颐 cores");
  }
  if (!ids.has("spring")) {
    throw new Error("graph must include 无污染泉水");
  }
  if (!ids.has("yi6") || !ids.has("yi7")) {
    throw new Error("graph must include 颐6 and 颐7");
  }
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error(`edge points to missing node: ${edge.source} -> ${edge.target}`);
    }
  }
}
