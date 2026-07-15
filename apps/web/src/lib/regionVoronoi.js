/**
 * Hierarchical Voronoi regions: macro 大区 → interior clipped to parent cell
 * → 晖三 local clipped to 晖三 cell. Same canvas as SOCIETY_MAP_* (x right, y down).
 * Leaflet CRS.Simple: GeoJSON [lng, lat] = [x, -y].
 */

import { Delaunay } from "d3-delaunay";
import { SOCIETY_MAP_MARKERS, SOCIETY_MAP_ZONES } from "./societyMap.js";

/** @typedef {{ id: string, label: string, note?: string, x: number, y: number, fill: string, layer: string, parentId?: string }} RegionSeed */
/** @typedef {{ type: 'FeatureCollection', features: object[] }} FeatureCollection */

/**
 * @param {RegionSeed[]} seeds
 * @param {[number, number, number, number]} bounds [xmin, ymin, xmax, ymax]
 * @returns {FeatureCollection}
 */
export function voronoiFeatureCollection(seeds, bounds) {
  if (!seeds.length) {
    return { type: "FeatureCollection", features: [] };
  }

  const delaunay = Delaunay.from(
    seeds,
    (d) => d.x,
    (d) => d.y,
  );
  const voronoi = delaunay.voronoi(bounds);

  /** @type {object[]} */
  const features = [];
  for (let i = 0; i < seeds.length; i += 1) {
    const poly = voronoi.cellPolygon(i);
    if (!poly || poly.length < 4) continue;
    features.push(ringToFeature(seeds[i], poly));
  }

  return { type: "FeatureCollection", features };
}

/**
 * @param {RegionSeed} seed
 * @param {number[][]} ringXY open or closed [x,y]
 */
function ringToFeature(seed, ringXY) {
  const open = openRing(ringXY);
  const ring = open.map(([x, y]) => [x, -y]);
  const first = ring[0];
  ring.push([first[0], first[1]]);
  return {
    type: "Feature",
    id: seed.id,
    properties: {
      id: seed.id,
      label: seed.label,
      note: seed.note || "",
      fill: seed.fill,
      layer: seed.layer,
      seedX: seed.x,
      seedY: seed.y,
      parentId: seed.parentId || "",
    },
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
}

/**
 * Voronoi cells clipped to a convex parent ring (hierarchical nesting).
 * @param {RegionSeed[]} seeds
 * @param {number[][]} parentRingXY
 * @returns {FeatureCollection}
 */
export function voronoiClippedFeatureCollection(seeds, parentRingXY) {
  if (!seeds.length || !parentRingXY?.length) {
    return { type: "FeatureCollection", features: [] };
  }

  const parent = orientRingCCW(openRing(parentRingXY));
  const bbox = padBBox(ringBBox(parent), 2);
  const clamped = seeds.map((s) => {
    const [x, y] = ensurePointInRing(s.x, s.y, parent);
    return { ...s, x, y, parentId: s.parentId || "" };
  });

  const unique = dedupeSeeds(clamped, 1.2);
  if (unique.length < 1) {
    return { type: "FeatureCollection", features: [] };
  }

  // Re-ensure after nudge
  const ready = unique.map((s) => {
    const [x, y] = ensurePointInRing(s.x, s.y, parent);
    return { ...s, x, y };
  });

  const delaunay = Delaunay.from(
    ready,
    (d) => d.x,
    (d) => d.y,
  );
  const voronoi = delaunay.voronoi(bbox);

  /** @type {object[]} */
  const features = [];
  for (let i = 0; i < ready.length; i += 1) {
    const poly = voronoi.cellPolygon(i);
    if (!poly || poly.length < 4) continue;
    const clipped = clipPolygonToConvex(poly, parent);
    if (clipped.length < 3) continue;
    features.push(ringToFeature(ready[i], clipped));
  }

  return { type: "FeatureCollection", features };
}

/**
 * @param {RegionSeed[]} seeds
 * @param {number} minDist
 */
function dedupeSeeds(seeds, minDist) {
  /** @type {RegionSeed[]} */
  const out = [];
  for (const s of seeds) {
    const hit = out.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < minDist);
    if (hit) {
      const angle = (out.length * 2.4) % (Math.PI * 2);
      out.push({
        ...s,
        x: s.x + Math.cos(angle) * minDist,
        y: s.y + Math.sin(angle) * minDist,
      });
    } else {
      out.push(s);
    }
  }
  return out;
}

/**
 * Two cell polygons share a border segment (within epsilon) → adjacent.
 * @param {{ features: object[] }} fc
 * @returns {Array<[string, string]>}
 */
export function adjacencyPairs(fc) {
  /** @type {Array<[string, string]>} */
  const pairs = [];
  const feats = fc.features || [];
  const eps = 1.5;

  /**
   * @param {number[][]} ring
   */
  function edges(ring) {
    /** @type {string[]} */
    const out = [];
    for (let i = 0; i < ring.length - 1; i += 1) {
      const a = ring[i];
      const b = ring[i + 1];
      const x1 = Math.round(a[0] / eps) * eps;
      const y1 = Math.round(a[1] / eps) * eps;
      const x2 = Math.round(b[0] / eps) * eps;
      const y2 = Math.round(b[1] / eps) * eps;
      const key =
        x1 < x2 || (x1 === x2 && y1 <= y2)
          ? `${x1},${y1}|${x2},${y2}`
          : `${x2},${y2}|${x1},${y1}`;
      out.push(key);
    }
    return out;
  }

  /** @type {Map<string, string[]>} */
  const edgeOwner = new Map();
  for (const f of feats) {
    const id = String(f.properties?.id || f.id || "");
    const ring = f.geometry?.type === "Polygon" ? f.geometry.coordinates?.[0] : null;
    if (!ring || !id) continue;
    for (const e of edges(ring)) {
      const owners = edgeOwner.get(e) || [];
      owners.push(id);
      edgeOwner.set(e, owners);
    }
  }

  /** @type {Set<string>} */
  const seen = new Set();
  for (const owners of edgeOwner.values()) {
    if (owners.length < 2) continue;
    for (let i = 0; i < owners.length; i += 1) {
      for (let j = i + 1; j < owners.length; j += 1) {
        const a = owners[i];
        const b = owners[j];
        if (a === b) continue;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

/* ── polygon helpers (convex parent cells from Voronoi) ── */

/**
 * @param {number[][]} ring
 * @returns {number[][]}
 */
export function openRing(ring) {
  if (!ring?.length) return [];
  const out = ring.map((p) => [p[0], p[1]]);
  const a = out[0];
  const b = out[out.length - 1];
  if (a[0] === b[0] && a[1] === b[1]) out.pop();
  return out;
}

/**
 * @param {number[][]} ring
 * @returns {[number, number, number, number]}
 */
export function ringBBox(ring) {
  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  for (const [x, y] of openRing(ring)) {
    if (x < xmin) xmin = x;
    if (y < ymin) ymin = y;
    if (x > xmax) xmax = x;
    if (y > ymax) ymax = y;
  }
  return [xmin, ymin, xmax, ymax];
}

/**
 * @param {[number, number, number, number]} box
 * @param {number} pad
 */
export function padBBox(box, pad) {
  return [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad];
}

/**
 * Signed area (positive if CCW).
 * @param {number[][]} ring
 */
export function ringArea(ring) {
  const pts = openRing(ring);
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * @param {number[][]} ring
 */
export function orientRingCCW(ring) {
  const open = openRing(ring);
  if (ringArea(open) < 0) open.reverse();
  return open;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number[][]} ring
 */
export function pointInRing(x, y, ring) {
  const pts = openRing(ring);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * @param {number[][]} ring
 * @returns {[number, number]}
 */
export function ringCentroid(ring) {
  const pts = openRing(ring);
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number[][]} ring
 * @returns {[number, number]}
 */
export function ensurePointInRing(x, y, ring) {
  if (pointInRing(x, y, ring)) return [x, y];
  const [cx, cy] = ringCentroid(ring);
  for (let t = 0.92; t > 0.04; t -= 0.04) {
    const nx = cx + (x - cx) * t;
    const ny = cy + (y - cy) * t;
    if (pointInRing(nx, ny, ring)) return [nx, ny];
  }
  return [cx, cy];
}

/**
 * Sutherland–Hodgman clip of subject against convex clip polygon (CCW).
 * @param {number[][]} subject
 * @param {number[][]} clip
 * @returns {number[][]}
 */
export function clipPolygonToConvex(subject, clip) {
  const clipRing = orientRingCCW(clip);
  let output = openRing(subject);
  if (!output.length || clipRing.length < 3) return [];

  /**
   * @param {number[]} p
   * @param {number[]} a
   * @param {number[]} b
   */
  const inside = (p, a, b) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-7;

  /**
   * @param {number[]} s
   * @param {number[]} e
   * @param {number[]} a
   * @param {number[]} b
   */
  const intersection = (s, e, a, b) => {
    const dcx = a[0] - b[0];
    const dcy = a[1] - b[1];
    const dpx = s[0] - e[0];
    const dpy = s[1] - e[1];
    const n1 = a[0] * b[1] - a[1] * b[0];
    const n2 = s[0] * e[1] - s[1] * e[0];
    const denom = dcx * dpy - dcy * dpx;
    if (Math.abs(denom) < 1e-12) return [e[0], e[1]];
    return [(n1 * dpx - n2 * dcx) / denom, (n1 * dpy - n2 * dcy) / denom];
  };

  for (let i = 0; i < clipRing.length; i += 1) {
    const a = clipRing[i];
    const b = clipRing[(i + 1) % clipRing.length];
    const input = output;
    output = [];
    if (!input.length) break;
    let S = input[input.length - 1];
    for (const E of input) {
      if (inside(E, a, b)) {
        if (!inside(S, a, b)) output.push(intersection(S, E, a, b));
        output.push(E);
      } else if (inside(S, a, b)) {
        output.push(intersection(S, E, a, b));
      }
      S = E;
    }
  }
  return output;
}

/**
 * GeoJSON feature ring ([lng,lat]=[x,-y]) → canvas [x,y] open ring.
 * @param {object} feature
 * @returns {number[][]}
 */
export function featureRingXY(feature) {
  const ring = feature?.geometry?.coordinates?.[0];
  if (!ring?.length) return [];
  return orientRingCCW(ring.map(([lng, lat]) => [lng, -lat]));
}

/**
 * Absolute area of a GeoJSON polygon feature (canvas units²).
 * @param {object} feature
 */
export function featureArea(feature) {
  return Math.abs(ringArea(featureRingXY(feature)));
}

const REGION_COLORS = {
  "z-bai": "#b8c4d4",
  "z-lan": "#8aa8c0",
  "z-hong": "#d09078",
  "z-hui": "#9cba88",
  "z-gui": "#78a8b8",
};

const BASE_COLOR = "#5a6a80";
const PLOT_COLOR = "#6d8a3e";
const FOREST_COLOR = "#3f5230";
const SAFE_COLOR = "#3a4558";
const LOCAL_COLOR = "#4a5d48";
const POI_COLOR = "#7a6a58";
const PORT_COLOR = "#5a8aaa";
const LAB_COLOR = "#6a5a78";

/** Toolbar / drill-down layer catalog (order = UI order). */
export const REGION_LAYER_META = [
  { id: "macro", label: "五大区", blurb: "白 / 兰 / 红 / 晖 / 桂贴边拼图" },
  { id: "full", label: "完整拼图", blurb: "五区内细分裁进父大区，铺满全国" },
  {
    id: "full-local",
    label: "完整+晖三细",
    blurb: "全国拼图上把晖三格换成周边细层",
  },
  { id: "in-bai", label: "白城内", zoneId: "z-bai", blurb: "裁进白城大区父边界" },
  { id: "in-lan", label: "兰城内", zoneId: "z-lan", blurb: "裁进兰城大区父边界" },
  { id: "in-hong", label: "红城内", zoneId: "z-hong", blurb: "裁进红城大区父边界" },
  { id: "in-hui", label: "晖城内", zoneId: "z-hui", blurb: "裁进晖城大区；可再下钻晖三" },
  { id: "in-gui", label: "桂城内", zoneId: "z-gui", blurb: "裁进桂城大区父边界" },
  { id: "local", label: "晖三周边", blurb: "裁进晖城内·晖三格" },
];

/**
 * Soft envelope box (fitBounds fallback); interiors use parent Voronoi rings.
 * @param {string} zoneId
 * @param {number} vbW
 * @param {number} vbH
 * @returns {[number, number, number, number]}
 */
export function clipBoxForZone(zoneId, vbW = 1000, vbH = 900) {
  const z = SOCIETY_MAP_ZONES.find((row) => row.id === zoneId);
  if (!z) return [0, 0, vbW, vbH];
  const minSpanX = zoneId === "z-hui" ? 520 : 300;
  const minSpanY = zoneId === "z-hui" ? 420 : 240;
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  const hw = Math.max(z.w, minSpanX) / 2 + 28;
  const hh = Math.max(z.h, minSpanY) / 2 + 28;
  return [
    Math.max(0, cx - hw),
    Math.max(0, cy - hh),
    Math.min(vbW, cx + hw),
    Math.min(vbH, cy + hh),
  ];
}

/**
 * Place seeds inside a parent polygon (real coords preferred; else fan at centroid).
 * @param {number[][]} parentRing
 * @param {{ id: string, label: string, note?: string, fill: string, layer: string, x?: number, y?: number, parentId?: string }[]} items
 * @returns {RegionSeed[]}
 */
export function seedsInPolygon(parentRing, items) {
  const parent = orientRingCCW(parentRing);
  const [cx, cy] = ringCentroid(parent);
  const [xmin, ymin, xmax, ymax] = ringBBox(parent);
  const rx = (xmax - xmin) * 0.28;
  const ry = (ymax - ymin) * 0.28;
  const n = items.length;
  const parentId = items[0]?.parentId || "";

  return items.map((item, i) => {
    let x = item.x;
    let y = item.y;
    if (x == null || y == null) {
      const angle = (Math.PI * 2 * i) / Math.max(n, 1) - Math.PI / 2;
      x = cx + Math.cos(angle) * rx;
      y = cy + Math.sin(angle) * ry;
    }
    const [px, py] = ensurePointInRing(x, y, parent);
    return {
      id: item.id,
      label: item.label,
      note: item.note || "",
      x: px,
      y: py,
      fill: item.fill,
      layer: item.layer,
      parentId: item.parentId || parentId,
    };
  });
}

/**
 * Macro: five 大区 as adjacent Voronoi cells over the canvas.
 * @param {number} vbW
 * @param {number} vbH
 */
export function buildMacroRegionLayer(vbW = 1000, vbH = 900) {
  /** @type {RegionSeed[]} */
  const seeds = SOCIETY_MAP_ZONES.map((z) => ({
    id: z.id,
    label: z.label.replace(/（.*）/, "").trim(),
    note: z.label,
    x: z.x + z.w / 2,
    y: z.y + z.h / 2,
    fill: REGION_COLORS[z.id] || "#a0b090",
    layer: "macro",
  }));
  return voronoiFeatureCollection(seeds, [0, 0, vbW, vbH]);
}

/**
 * @param {FeatureCollection} macro
 * @param {string} zoneId
 */
export function macroRingForZone(macro, zoneId) {
  const f = macro.features.find((row) => row.properties?.id === zoneId);
  return f ? featureRingXY(f) : [];
}

/**
 * @param {number[][]} parentRing
 */
export function buildBaiInteriorLayer(parentRing) {
  const byId = Object.fromEntries(SOCIETY_MAP_MARKERS.map((m) => [m.id, m]));
  const bai1 = byId.bai1;
  const seeds = seedsInPolygon(parentRing, [
    {
      id: "bai1",
      label: "白一",
      note: bai1?.note || "北方大区节点；医疗/高校",
      fill: BASE_COLOR,
      layer: "in-bai",
      parentId: "z-bai",
      x: bai1?.x,
      y: bai1?.y,
    },
    {
      id: "bai-campus",
      label: "白一高校/医疗带",
      note: "跨基地公务与医学链路常牵涉",
      fill: LAB_COLOR,
      layer: "in-bai",
      parentId: "z-bai",
    },
    {
      id: "bai-xchg",
      label: "北方交换站",
      note: "白三种质交换等跨基链路",
      fill: POI_COLOR,
      layer: "in-bai",
      parentId: "z-bai",
    },
    {
      id: "bai-corridor",
      label: "北向公务走廊",
      note: "连晖城方向的正式往来通道示意",
      fill: REGION_COLORS["z-bai"],
      layer: "in-bai",
      parentId: "z-bai",
    },
  ]);
  return voronoiClippedFeatureCollection(seeds, parentRing);
}

/**
 * @param {number[][]} parentRing
 */
export function buildLanInteriorLayer(parentRing) {
  const byId = Object.fromEntries(SOCIETY_MAP_MARKERS.map((m) => [m.id, m]));
  const lan5 = byId.lan5;
  const seeds = seedsInPolygon(parentRing, [
    {
      id: "lan5",
      label: "兰五",
      note: lan5?.note || "经西北进化林可达晖三侧",
      fill: BASE_COLOR,
      layer: "in-lan",
      parentId: "z-lan",
      x: lan5?.x,
      y: lan5?.y,
    },
    {
      id: "lan1",
      label: "兰一研究院",
      note: "跨基地科研互动与设备生态",
      fill: LAB_COLOR,
      layer: "in-lan",
      parentId: "z-lan",
    },
    {
      id: "lan-forest",
      label: "西北进化林缘",
      note: "连晖三西北林的入口带",
      fill: FOREST_COLOR,
      layer: "in-lan",
      parentId: "z-lan",
    },
    {
      id: "lan-pass",
      label: "北向通路口",
      note: "北部入侵路径候选之一",
      fill: POI_COLOR,
      layer: "in-lan",
      parentId: "z-lan",
    },
  ]);
  return voronoiClippedFeatureCollection(seeds, parentRing);
}

/**
 * @param {number[][]} parentRing
 */
export function buildHongInteriorLayer(parentRing) {
  const byId = Object.fromEntries(SOCIETY_MAP_MARKERS.map((m) => [m.id, m]));
  const hong1 = byId.hong1;
  const hong11 = byId.hong11;
  const seeds = seedsInPolygon(parentRing, [
    {
      id: "hong1",
      label: "红一",
      note: hong1?.note || "红城核心；科研考察申请常指向晖三",
      fill: "#8a4030",
      layer: "in-hong",
      parentId: "z-hong",
      x: hong1?.x,
      y: hong1?.y,
    },
    {
      id: "hong11",
      label: "红十一",
      note: hong11?.note || "穿北进化林可达",
      fill: BASE_COLOR,
      layer: "in-hong",
      parentId: "z-hong",
      x: hong11?.x,
      y: hong11?.y,
    },
    {
      id: "hong2",
      label: "红二",
      note: "同区具名基地；常与红一共提资源共享申请",
      fill: BASE_COLOR,
      layer: "in-hong",
      parentId: "z-hong",
    },
    {
      id: "hong-port",
      label: "临海肥源带",
      note: "蟹壳肥等外销产地示意",
      fill: PORT_COLOR,
      layer: "in-hong",
      parentId: "z-hong",
    },
  ]);
  return voronoiClippedFeatureCollection(seeds, parentRing);
}

/**
 * @param {number[][]} parentRing
 */
export function buildHuiInteriorLayer(parentRing) {
  const byId = Object.fromEntries(SOCIETY_MAP_MARKERS.map((m) => [m.id, m]));
  /** @type {{ id: string, label: string, note?: string, fill: string, layer: string, parentId: string, x?: number, y?: number }[]} */
  const items = [];
  const pushMarker = (id, fill, label) => {
    const m = byId[id];
    if (!m) return;
    items.push({
      id: m.id,
      label: label || m.label,
      note: m.note || "",
      fill,
      layer: "in-hui",
      parentId: "z-hui",
      x: m.x,
      y: m.y,
    });
  };

  pushMarker("hui3", SAFE_COLOR, "晖三");
  pushMarker("hui1", BASE_COLOR, "晖一");
  pushMarker("hui2", BASE_COLOR, "晖二");
  pushMarker("hui5", BASE_COLOR, "晖五");
  pushMarker("hui6", BASE_COLOR, "晖六");
  pushMarker("north1", LOCAL_COLOR, "北部一区");
  pushMarker("mt-49", FOREST_COLOR);
  pushMarker("mt-50", FOREST_COLOR);
  pushMarker("pack-w", POI_COLOR, "西部狼群域");
  pushMarker("huoshan", "#b5482a", "烈火山");

  if (items.length < 3) {
    items.push(
      { id: "hui3", label: "晖三", fill: SAFE_COLOR, layer: "in-hui", parentId: "z-hui" },
      { id: "hui1", label: "晖一", fill: BASE_COLOR, layer: "in-hui", parentId: "z-hui" },
      { id: "hui6", label: "晖六", fill: BASE_COLOR, layer: "in-hui", parentId: "z-hui" },
    );
  }

  return voronoiClippedFeatureCollection(seedsInPolygon(parentRing, items), parentRing);
}

/**
 * @param {number[][]} parentRing
 */
export function buildGuiInteriorLayer(parentRing) {
  const byId = Object.fromEntries(SOCIETY_MAP_MARKERS.map((m) => [m.id, m]));
  const gui3 = byId.gui3;
  const seeds = seedsInPolygon(parentRing, [
    {
      id: "gui3",
      label: "桂三",
      note: gui3?.note || "海洋压力大；失守则难民可能北冲",
      fill: BASE_COLOR,
      layer: "in-gui",
      parentId: "z-gui",
      x: gui3?.x,
      y: gui3?.y,
    },
    {
      id: "gui1",
      label: "桂一",
      note: "蟹壳肥采购冲突常指向桂一/桂五",
      fill: BASE_COLOR,
      layer: "in-gui",
      parentId: "z-gui",
    },
    {
      id: "gui5",
      label: "桂五",
      note: "同属南方临海基地群",
      fill: BASE_COLOR,
      layer: "in-gui",
      parentId: "z-gui",
    },
    {
      id: "gui-sea",
      label: "南部海域边缘",
      note: "桂城临海压力带",
      fill: PORT_COLOR,
      layer: "in-gui",
      parentId: "z-gui",
    },
    {
      id: "gui-north-pass",
      label: "北冲通道",
      note: "难民北压晖一/晖三方向示意",
      fill: POI_COLOR,
      layer: "in-gui",
      parentId: "z-gui",
    },
  ]);
  return voronoiClippedFeatureCollection(seeds, parentRing);
}

/** Fallback rectangle if 晖三 cell missing (tests / degraded). */
function defaultLocalParentRing() {
  return [
    [220, 160],
    [860, 160],
    [860, 620],
    [220, 620],
  ];
}

/**
 * Local: 晖三安区核 + 北部一区 + 编号领地/山 — clipped to 晖三 parent cell.
 * @param {number[][]} [parentRing]
 */
export function buildHui3LocalLayer(parentRing) {
  const parent = parentRing?.length ? orientRingCCW(parentRing) : defaultLocalParentRing();
  const byId = Object.fromEntries(SOCIETY_MAP_MARKERS.map((m) => [m.id, m]));

  /** @type {{ id: string, label: string, note?: string, fill: string, layer: string, parentId: string, x?: number, y?: number }[]} */
  const items = [];
  const push = (m, fill, layer, label = m.label) => {
    items.push({
      id: m.id,
      label,
      note: m.note || "",
      fill,
      layer,
      parentId: "hui3",
      x: m.x,
      y: m.y,
    });
  };

  if (byId.hui3) push(byId.hui3, SAFE_COLOR, "safe", "晖三安全区·内外城核");
  if (byId.north1) push(byId.north1, LOCAL_COLOR, "local", "北部一区");
  for (const id of ["t1", "t6", "t7", "t3", "t2", "t4", "t9", "t11"]) {
    if (byId[id]) push(byId[id], PLOT_COLOR, "plot");
  }
  for (const id of ["mt-49", "mt-50", "mt-55", "mt-52", "mt-51", "mt-60"]) {
    if (byId[id]) push(byId[id], FOREST_COLOR, "forest");
  }

  return voronoiClippedFeatureCollection(seedsInPolygon(parent, items), parent);
}

/**
 * @param {FeatureCollection[]} parts
 * @returns {FeatureCollection}
 */
export function mergeFeatureCollections(parts) {
  return {
    type: "FeatureCollection",
    features: parts.flatMap((p) => p.features || []),
  };
}

/**
 * @param {Record<string, FeatureCollection>} interiors
 */
export function composeFullNation(interiors) {
  return mergeFeatureCollections([
    interiors["in-bai"],
    interiors["in-lan"],
    interiors["in-hong"],
    interiors["in-hui"],
    interiors["in-gui"],
  ]);
}

/**
 * @param {Record<string, FeatureCollection>} interiors
 * @param {FeatureCollection} local
 */
export function composeFullWithLocal(interiors, local) {
  const huiRest = {
    type: "FeatureCollection",
    features: (interiors["in-hui"].features || []).filter(
      (f) => f.properties?.id !== "hui3",
    ),
  };
  return mergeFeatureCollections([
    interiors["in-bai"],
    interiors["in-lan"],
    interiors["in-hong"],
    huiRest,
    local,
    interiors["in-gui"],
  ]);
}

/**
 * Child cells should (approx) fill the parent.
 * @param {object} parentFeature
 * @param {FeatureCollection} children
 * @param {number} [tol]
 */
export function assertChildrenFillParent(parentFeature, children, tol = 0.12) {
  const parentA = featureArea(parentFeature);
  if (parentA < 1) throw new Error("parent area too small");
  const childA = (children.features || []).reduce((s, f) => s + featureArea(f), 0);
  const gap = Math.abs(parentA - childA) / parentA;
  if (gap > tol) {
    throw new Error(
      `children area ${childA.toFixed(0)} vs parent ${parentA.toFixed(0)} gap ${(gap * 100).toFixed(1)}%`,
    );
  }
}

/**
 * Bundle used by Leaflet region map.
 * @param {number} [vbW]
 * @param {number} [vbH]
 */
export function buildSocietyRegionBundle(vbW = 1000, vbH = 900) {
  const macro = buildMacroRegionLayer(vbW, vbH);
  const ringBai = macroRingForZone(macro, "z-bai");
  const ringLan = macroRingForZone(macro, "z-lan");
  const ringHong = macroRingForZone(macro, "z-hong");
  const ringHui = macroRingForZone(macro, "z-hui");
  const ringGui = macroRingForZone(macro, "z-gui");

  /** @type {Record<string, FeatureCollection>} */
  const interiors = {
    "in-bai": buildBaiInteriorLayer(ringBai),
    "in-lan": buildLanInteriorLayer(ringLan),
    "in-hong": buildHongInteriorLayer(ringHong),
    "in-hui": buildHuiInteriorLayer(ringHui),
    "in-gui": buildGuiInteriorLayer(ringGui),
  };

  const hui3Feat = interiors["in-hui"].features.find((f) => f.properties?.id === "hui3");
  const localParent = hui3Feat ? featureRingXY(hui3Feat) : defaultLocalParentRing();
  const local = buildHui3LocalLayer(localParent);

  const full = composeFullNation(interiors);
  const fullLocal = composeFullWithLocal(interiors, local);

  /** @type {Record<string, FeatureCollection>} */
  const layers = {
    macro,
    full,
    "full-local": fullLocal,
    ...interiors,
    local,
  };

  /** @type {Record<string, Array<[string, string]>>} */
  const adjacency = {};
  for (const [key, fc] of Object.entries(layers)) {
    adjacency[key] = adjacencyPairs(fc);
  }

  return {
    vbW,
    vbH,
    layers,
    adjacency,
    meta: REGION_LAYER_META,
    parentRings: {
      "z-bai": ringBai,
      "z-lan": ringLan,
      "z-hong": ringHong,
      "z-hui": ringHui,
      "z-gui": ringGui,
      hui3: localParent,
    },
  };
}
