/**
 * Alternate map engines for society geography (browser client only).
 * Coordinates match SOCIETY_MAP_* — north↑ in data space (y grows downward in canvas).
 */

/** @typedef {{ id: string, label: string, kind: string, x: number, y: number, w?: number, h?: number, note?: string }} MapMarker */
/** @typedef {{ id: string, from: string, to: string, label: string, curved?: boolean }} MapPath */
/** @typedef {{ id: string, label: string, x: number, y: number, w: number, h: number }} MapZone */
/** @typedef {{ vbW: number, vbH: number, markers: MapMarker[], paths: MapPath[], zones: MapZone[], annotations: { text: string, x: number, y: number }[] }} MapPayload */

const KIND_COLOR = {
  base: "#2a3444",
  forest: "#2f6b3a",
  landmark: "#b5482a",
  local: "#5a7a6a",
  plot: "#6b8f3a",
  pack: "#6b4a28",
  creature: "#8a6a40",
};

const KIND_NAME = {
  base: "基地",
  forest: "编号山域",
  landmark: "地标",
  local: "本地空间",
  plot: "编号领地",
  pack: "族群",
  creature: "个体",
};

/** Per-kind ECharts scatter glyph (shape over color for discrimination). */
const KIND_SYMBOL = {
  // settlement block
  base: "roundRect",
  // mountain silhouette
  forest:
    "path://M0,20 L8,4 L14,14 L18,8 L28,20 Z",
  // classic pin
  landmark: "pin",
  // zone plate
  local: "rect",
  // land parcel flag
  plot: "diamond",
  // pack / herd wedge
  pack: "triangle",
  // individual
  creature: "circle",
};

const KIND_SYMBOL_SIZE = {
  base: 18,
  forest: 22,
  landmark: 26,
  local: 16,
  plot: 12,
  pack: 16,
  creature: 10,
};

/** G6 built-in node types — shapes parallel ECharts glyphs. */
const KIND_G6_TYPE = {
  base: "rect",
  forest: "triangle",
  landmark: "star",
  local: "ellipse",
  plot: "diamond",
  pack: "hexagon",
  creature: "circle",
};

/**
 * @param {string} kind
 * @param {string} [id]
 */
function kindSize(kind, id) {
  const base = KIND_SYMBOL_SIZE[kind] || 14;
  if (id === "mt-49" || id === "mt-50") return Math.max(base, 28);
  if (id === "hui3") return Math.max(base, 22);
  return base;
}

/**
 * @param {MapPayload} payload
 * @returns {Record<string, MapMarker>}
 */
function byId(payload) {
  return Object.fromEntries(payload.markers.map((m) => [m.id, m]));
}

/**
 * ECharts: cartesian scatter + lines (interactive zoom/tooltip).
 * @param {HTMLElement} el
 * @param {MapPayload} payload
 */
export async function initEchartsSocietyMap(el, payload) {
  const echarts = await import("echarts/core");
  const { ScatterChart, LinesChart } = await import("echarts/charts");
  const { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } =
    await import("echarts/components");
  const { CanvasRenderer } = await import("echarts/renderers");
  echarts.use([
    ScatterChart,
    LinesChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
    CanvasRenderer,
  ]);

  const chart = echarts.init(el, undefined, { renderer: "canvas" });
  const kinds = [...new Set(payload.markers.map((m) => m.kind))];
  const index = byId(payload);

  /** @type {Record<string, number[][]>} */
  const seriesData = {};
  for (const k of kinds) seriesData[k] = [];
  for (const m of payload.markers) {
    // flip Y so north (small y) is at top of cartesian
    seriesData[m.kind].push([m.x, payload.vbH - m.y, m.label, m.note || "", m.id]);
  }

  const lineCoords = payload.paths
    .map((p) => {
      const a = index[p.from];
      const b = index[p.to];
      if (!a || !b) return null;
      return {
        coords: [
          [a.x, payload.vbH - a.y],
          [b.x, payload.vbH - b.y],
        ],
        label: p.label || "",
      };
    })
    .filter(Boolean);

  chart.setOption({
    backgroundColor: "#f4f6f2",
    animationDuration: 400,
    legend: {
      top: 6,
      textStyle: { fontSize: 11, color: "rgba(45,52,38,0.75)" },
      data: kinds.map((k) => ({
        name: KIND_NAME[k] || k,
        icon: KIND_SYMBOL[k] || "circle",
        itemStyle: { color: KIND_COLOR[k] || "#555" },
      })),
    },
    tooltip: {
      trigger: "item",
      formatter: (p) => {
        if (p.seriesType === "lines") return p.data?.label || "";
        const d = p.data || [];
        const note = d[3] || "";
        return `<b>${d[2] || ""}</b><br/><span style="opacity:.72">${p.seriesName || ""}${note ? " · " + note : ""}</span>`;
      },
    },
    grid: { left: 36, right: 20, top: 42, bottom: 48 },
    dataZoom: [
      { type: "inside", xAxisIndex: 0, filterMode: "none" },
      { type: "inside", yAxisIndex: 0, filterMode: "none" },
    ],
    xAxis: {
      type: "value",
      min: 0,
      max: payload.vbW,
      show: false,
    },
    yAxis: {
      type: "value",
      min: 0,
      max: payload.vbH,
      show: false,
    },
    series: [
      {
        type: "lines",
        coordinateSystem: "cartesian2d",
        polyline: false,
        data: lineCoords,
        lineStyle: { color: "rgba(70,90,60,0.35)", width: 1.4, curveness: 0.08 },
        effect: { show: false },
        z: 1,
      },
      ...kinds.map((k) => ({
        name: KIND_NAME[k] || k,
        type: "scatter",
        data: seriesData[k],
        symbol: KIND_SYMBOL[k] || "circle",
        symbolKeepAspect: true,
        symbolSize: (val) => kindSize(k, val?.[4]),
        itemStyle: {
          color: KIND_COLOR[k] || "#555",
          borderColor: k === "creature" ? "rgba(255,255,255,0.9)" : "#fff",
          borderWidth: k === "plot" ? 1 : 1.5,
          opacity: k === "local" ? 0.85 : 0.95,
        },
        label: {
          show: true,
          formatter: (p) => p.data?.[2] || "",
          position: "bottom",
          fontSize: k === "creature" || k === "plot" ? 9 : 10,
          color: "rgba(30,36,28,0.85)",
          distance: 4,
        },
        z: k === "creature" ? 3 : 2,
      })),
    ],
  });

  const onResize = () => chart.resize();
  window.addEventListener("resize", onResize);
  return {
    dispose() {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    },
  };
}

/**
 * AntV G6: preset-layout graph on map coordinates.
 * @param {HTMLElement} el
 * @param {MapPayload} payload
 */
export async function initG6SocietyMap(el, payload) {
  const { Graph } = await import("@antv/g6");
  const index = byId(payload);

  const nodes = payload.markers.map((m) => ({
    id: m.id,
    type: KIND_G6_TYPE[m.kind] || "circle",
    data: { kind: m.kind, note: m.note || "", label: m.label },
    style: {
      x: m.x,
      y: m.y,
      size: kindSize(m.kind, m.id),
      fill: KIND_COLOR[m.kind] || "#555",
      stroke: "#f5f5f0",
      lineWidth: m.kind === "plot" ? 1 : 1.5,
      // roundRect feel for bases
      radius: m.kind === "base" ? 5 : 0,
      // mountain peak points up
      direction: m.kind === "forest" ? "up" : undefined,
      opacity: m.kind === "local" ? 0.85 : 0.95,
      labelText: m.label,
      labelFill: "#1f241c",
      labelFontSize: m.kind === "creature" || m.kind === "plot" ? 9 : 10,
      labelPlacement: "bottom",
      labelOffsetY: 4,
    },
  }));

  const edges = payload.paths
    .filter((p) => index[p.from] && index[p.to])
    .map((p) => ({
      id: p.id,
      source: p.from,
      target: p.to,
      data: { label: p.label || "" },
      style: {
        stroke: "rgba(70,90,60,0.4)",
        lineWidth: 1.4,
        labelText: p.label || "",
        labelFill: "rgba(50,60,40,0.65)",
        labelFontSize: 9,
        endArrow: true,
      },
    }));

  el.replaceChildren();
  el.style.display = "flex";
  el.style.flexDirection = "column";

  // Lightweight HTML legend so shapes are readable without opening every node.
  const legend = document.createElement("div");
  legend.className = "society-g6-legend";
  legend.setAttribute("aria-hidden", "true");
  const legendKinds = [...new Set(payload.markers.map((m) => m.kind))];
  const shapeHint = {
    base: "▮",
    forest: "▲",
    landmark: "★",
    local: "⬭",
    plot: "◆",
    pack: "⬡",
    creature: "●",
  };
  legend.innerHTML = legendKinds
    .map((k) => {
      const color = KIND_COLOR[k] || "#555";
      return `<span class="society-g6-legend__item"><i style="color:${color}">${shapeHint[k] || "●"}</i>${KIND_NAME[k] || k}</span>`;
    })
    .join("");

  const canvasHost = document.createElement("div");
  canvasHost.className = "society-g6-canvas";
  canvasHost.style.flex = "1 1 auto";
  canvasHost.style.minHeight = "0";
  canvasHost.style.width = "100%";
  el.append(legend, canvasHost);

  const graphW = canvasHost.clientWidth || 640;
  const graphH = canvasHost.clientHeight || 560;

  const graph = new Graph({
    container: canvasHost,
    width: graphW,
    height: graphH,
    autoFit: "view",
    padding: 24,
    data: { nodes, edges },
    layout: { type: "preset" },
    behaviors: ["drag-canvas", "zoom-canvas", "drag-element"],
    animation: false,
    node: {
      type: (d) => KIND_G6_TYPE[d.data?.kind] || d.type || "circle",
      style: {
        cursor: "pointer",
      },
      state: {
        active: {
          lineWidth: 2.5,
          stroke: "#fff",
        },
      },
    },
  });

  await graph.render();

  const onResize = () => {
    graph.setSize(canvasHost.clientWidth || 640, canvasHost.clientHeight || 560);
    graph.fitView();
  };
  window.addEventListener("resize", onResize);

  return {
    dispose() {
      window.removeEventListener("resize", onResize);
      graph.destroy();
      el.replaceChildren();
      el.style.display = "";
      el.style.flexDirection = "";
    },
  };
}

/**
 * Leaflet CRS.Simple: pan/zoom spatial map without OSM tiles.
 * @param {HTMLElement} el
 * @param {MapPayload} payload
 */
export async function initLeafletSocietyMap(el, payload) {
  const L = (await import("leaflet")).default;
  await import("leaflet/dist/leaflet.css");

  el.replaceChildren();
  // CRS.Simple: [y, x] with y increasing upward when we negate our SVG y
  const map = L.map(el, {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 3,
    zoomControl: true,
    attributionControl: false,
  });

  const southWest = L.latLng(-(payload.vbH), 0);
  const northEast = L.latLng(0, payload.vbW);
  const bounds = L.latLngBounds(southWest, northEast);
  map.setMaxBounds(bounds.pad(0.08));
  map.fitBounds(bounds);

  // paper-like image plane
  const paper = L.rectangle(bounds, {
    color: "rgba(80,90,70,0.25)",
    weight: 1,
    fillColor: "#f7f5ef",
    fillOpacity: 1,
    interactive: false,
  }).addTo(map);

  for (const z of payload.zones) {
    L.rectangle(
      [
        [- (z.y + z.h), z.x],
        [-z.y, z.x + z.w],
      ],
      {
        color: "rgba(80,90,70,0.3)",
        weight: 1,
        dashArray: "4 4",
        fillColor: "#9caa88",
        fillOpacity: 0.08,
        interactive: false,
      },
    ).addTo(map);
    L.marker(L.latLng(-(z.y + 14), z.x + 12), {
      interactive: false,
      icon: L.divIcon({
        className: "society-leaflet-zone",
        html: `<span>${z.label}</span>`,
      }),
    }).addTo(map);
  }

  const index = byId(payload);
  for (const p of payload.paths) {
    const a = index[p.from];
    const b = index[p.to];
    if (!a || !b) continue;
    L.polyline(
      [
        [-a.y, a.x],
        [-b.y, b.x],
      ],
      {
        color: "rgba(70,90,60,0.45)",
        weight: 1.6,
        dashArray: p.curved ? "5 4" : undefined,
      },
    ).addTo(map);
  }

  for (const m of payload.markers) {
    const color = KIND_COLOR[m.kind] || "#555";
    const marker = L.circleMarker(L.latLng(-m.y, m.x), {
      radius: m.kind === "forest" ? 9 : m.kind === "plot" ? 5 : 7,
      color: "#fff",
      weight: 1.5,
      fillColor: color,
      fillOpacity: 0.95,
    }).addTo(map);
    marker.bindTooltip(`<b>${m.label}</b><br/>${m.note || KIND_NAME[m.kind] || ""}`, {
      direction: "top",
      opacity: 0.95,
    });
    marker.bindPopup(`<b>${m.label}</b><br/><span style="opacity:.75">${m.note || KIND_NAME[m.kind] || ""}</span>`);
  }

  void paper;

  const onResize = () => {
    map.invalidateSize();
  };
  window.addEventListener("resize", onResize);
  // Panel may have just become visible — fix tile/container size after paint.
  requestAnimationFrame(() => map.invalidateSize());

  return {
    dispose() {
      window.removeEventListener("resize", onResize);
      map.remove();
    },
  };
}


/**
 * AntV G6 combo map: nested region envelopes on shared geo coordinates.
 * @param {HTMLElement} el
 * @param {{ id: string, title: string, blurb?: string }} profile
 */
export async function initG6AdminNestMap(el, profile) {
  const { Graph } = await import("@antv/g6");
  const { buildAdminNestGraphData } = await import("./adminNestMap.js");
  const data = buildAdminNestGraphData(profile.id);

  el.replaceChildren();
  el.style.position = "relative";
  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.background = "linear-gradient(180deg, #e7efe4 0%, #f3efe4 55%, #e8eef0 100%)";

  const title = document.createElement("div");
  title.className = "society-admin-g6-title";
  title.innerHTML = `<strong>${profile.title}</strong><span>上北下南 · 与地理示意同坐标系 · 滚轮缩放 / 拖拽 / 双击折叠</span>`;
  el.append(title);

  const canvasHost = document.createElement("div");
  canvasHost.style.flex = "1 1 auto";
  canvasHost.style.minHeight = "0";
  canvasHost.style.width = "100%";
  el.append(canvasHost);

  const graph = new Graph({
    container: canvasHost,
    width: canvasHost.clientWidth || 640,
    height: canvasHost.clientHeight || 520,
    autoFit: "view",
    padding: 40,
    data,
    layout: { type: "preset" },
    animation: false,
    behaviors: ["drag-canvas", "zoom-canvas", "drag-element", "collapse-expand"],
    node: {
      type: "circle",
      style: { cursor: "pointer" },
    },
    combo: {
      type: (d) => d.data?.shape || d.type || "rect",
      style: {
        padding: (d) => d.data?.padding ?? 24,
        fill: (d) => {
          const raw = d.data?.fill || "#dfe6d6";
          if (typeof raw === "string" && raw.startsWith("#") && raw.length === 7) {
            return `${raw}66`;
          }
          return raw;
        },
        stroke: (d) => d.data?.stroke || "#556655",
        lineWidth: 1.7,
        lineDash: (d) => (String(d.id).includes(":iso") ? [6, 4] : undefined),
        radius: 16,
        labelText: (d) => d.data?.label || "",
        labelFill: "#2f3540",
        labelFontSize: 12,
        labelFontWeight: 700,
        labelPlacement: "top",
        labelOffsetY: -4,
        labelBackground: true,
        labelBackgroundFill: "rgba(255,255,255,0.86)",
        labelBackgroundRadius: 4,
        labelPadding: [2, 6, 2, 6],
      },
    },
  });

  await graph.render();
  graph.fitView();

  const onResize = () => {
    graph.setSize(canvasHost.clientWidth || 640, canvasHost.clientHeight || 520);
    graph.fitView();
  };
  window.addEventListener("resize", onResize);

  return {
    dispose() {
      window.removeEventListener("resize", onResize);
      graph.destroy();
      el.replaceChildren();
      el.style.display = "";
      el.style.flexDirection = "";
      el.style.background = "";
      el.style.position = "";
    },
  };
}

/**
 * Leaflet region map: adjacent Voronoi polygons (province-style shared borders).
 * @param {HTMLElement} el
 * @param {{ vbW?: number, vbH?: number }} [opts]
 */
export async function initLeafletRegionMap(el, opts = {}) {
  const L = (await import("leaflet")).default;
  await import("leaflet/dist/leaflet.css");
  const { buildSocietyRegionBundle, ringBBox, REGION_LAYER_META } = await import(
    "./regionVoronoi.js"
  );

  const vbW = opts.vbW || 1000;
  const vbH = opts.vbH || 900;
  const bundle = buildSocietyRegionBundle(vbW, vbH);

  /** zoneId → interior layer key */
  const zoneToInterior = {
    "z-bai": "in-bai",
    "z-lan": "in-lan",
    "z-hong": "in-hong",
    "z-hui": "in-hui",
    "z-gui": "in-gui",
  };

  el.replaceChildren();
  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.background = "#ebe8df";

  const toolbar = document.createElement("div");
  toolbar.className = "society-region-toolbar";
  const radios = REGION_LAYER_META.map(
    (m, i) =>
      `<label title="${m.blurb || ""}"><input type="radio" name="region-layer" value="${m.id}"${i === 0 ? " checked" : ""} /> ${m.label}</label>`,
  ).join("");
  toolbar.innerHTML = `
    <strong>层级 Voronoi</strong>
    ${radios}
    <span data-region-hint>五大区 → 区内（裁进父界）→ 晖三细；「完整拼图」可铺满全国</span>
    <span data-region-adj></span>
  `;
  el.append(toolbar);

  const canvasHost = document.createElement("div");
  canvasHost.style.flex = "1 1 auto";
  canvasHost.style.minHeight = "0";
  canvasHost.style.width = "100%";
  el.append(canvasHost);

  const map = L.map(canvasHost, {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 3,
    zoomControl: true,
    attributionControl: false,
  });

  const southWest = L.latLng(-vbH, 0);
  const northEast = L.latLng(0, vbW);
  const worldBounds = L.latLngBounds(southWest, northEast);
  map.setMaxBounds(worldBounds.pad(0.06));
  map.fitBounds(worldBounds);

  L.rectangle(worldBounds, {
    color: "rgba(80,90,70,0.2)",
    weight: 1,
    fillColor: "#f4f1ea",
    fillOpacity: 1,
    interactive: false,
  }).addTo(map);

  L.marker(L.latLng(-56, 48), {
    interactive: false,
    icon: L.divIcon({
      className: "society-region-north",
      html: "<span>N</span>",
    }),
  }).addTo(map);

  /** @type {import('leaflet').GeoJSON | null} */
  let activeLayer = null;
  /** @type {import('leaflet').LayerGroup | null} */
  let seedLayer = null;
  const adjEl = toolbar.querySelector("[data-region-adj]");
  const hintEl = toolbar.querySelector("[data-region-hint]");

  /**
   * @param {string} key
   */
  function selectRadio(key) {
    const input = /** @type {HTMLInputElement | null} */ (
      toolbar.querySelector(`input[name="region-layer"][value="${key}"]`)
    );
    if (input) input.checked = true;
  }

  /**
   * @param {string} key
   */
  function fitForLayer(key) {
    if (key === "macro" || key === "full" || key === "full-local") {
      map.fitBounds(worldBounds);
      return;
    }
    const parentKey =
      key === "local"
        ? "hui3"
        : REGION_LAYER_META.find((m) => m.id === key)?.zoneId;
    const parentRing = parentKey ? bundle.parentRings?.[parentKey] : null;
    if (parentRing?.length) {
      const [xmin, ymin, xmax, ymax] = ringBBox(parentRing);
      map.fitBounds(
        L.latLngBounds(L.latLng(-ymax, xmin), L.latLng(-ymin, xmax)).pad(0.1),
      );
      return;
    }
    const fc = bundle.layers[key];
    if (fc?.features?.length) {
      const group = L.geoJSON(fc);
      map.fitBounds(group.getBounds().pad(0.08));
      return;
    }
    map.fitBounds(worldBounds);
  }

  /**
   * @param {string} viewKey
   * @param {object} props
   * @returns {string | null}
   */
  function drillTarget(viewKey, props) {
    if (viewKey === "macro") return zoneToInterior[props.id] || null;
    if (viewKey === "in-hui" && props.id === "hui3") return "local";
    if (viewKey === "full" || viewKey === "full-local") {
      if (props.id === "hui3" || props.parentId === "hui3") return "local";
      if (props.layer?.startsWith("in-")) return props.layer;
    }
    return null;
  }

  /**
   * @param {string} key
   */
  function showLayer(key) {
    if (activeLayer) {
      map.removeLayer(activeLayer);
      activeLayer = null;
    }
    if (seedLayer) {
      map.removeLayer(seedLayer);
      seedLayer = null;
    }
    const fc = /** @type {any} */ (bundle.layers[key]);
    if (!fc) return;

    if (hintEl) {
      const hints = {
        macro: "点击大区 → 区内细分（边界对齐父 Voronoi）",
        full: "全国：五区内块已裁进父大区；点块可进该区或晖三细层",
        "full-local": "全国 + 晖三细层替换晖三格；点块可聚焦子层",
        "in-hui": "点「晖三」可下钻周边细层",
        local: "已裁进晖三父格 · 同级共享边界",
      };
      hintEl.textContent = hints[key] || "同级色块共享边界 · 裁进父多边形";
    }

    activeLayer = L.geoJSON(fc, {
      style: (feat) => ({
        color: "rgba(40,48,36,0.55)",
        weight: 1.4,
        fillColor: feat?.properties?.fill || "#9cba88",
        fillOpacity: 0.72,
      }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        const drill = drillTarget(key, p);
        layer.bindTooltip(
          `<b>${p.label || ""}</b><br/>${p.note || ""}${drill ? "<br/><span style='opacity:.6'>点击下钻</span>" : ""}`,
          { sticky: true, opacity: 0.95 },
        );
        layer.bindPopup(
          `<b>${p.label || ""}</b><br/><span style="opacity:.75">${p.note || ""}</span><br/><span style="opacity:.55;font-size:11px">层级 Voronoi · 裁进父界</span>`,
        );
        layer.on("mouseover", () => {
          layer.setStyle({ weight: 2.4, fillOpacity: 0.88 });
        });
        layer.on("mouseout", () => {
          activeLayer?.resetStyle(layer);
        });
        if (drill) {
          layer.on("click", () => {
            selectRadio(drill);
            showLayer(drill);
          });
        }
      },
    }).addTo(map);

    seedLayer = L.layerGroup().addTo(map);
    for (const f of fc.features || []) {
      const sx = f.properties?.seedX;
      const sy = f.properties?.seedY;
      if (sx == null || sy == null) continue;
      L.circleMarker(L.latLng(-sy, sx), {
        radius: 3,
        color: "#fff",
        weight: 1,
        fillColor: "#2f3540",
        fillOpacity: 0.9,
        interactive: false,
      }).addTo(seedLayer);
    }

    const pairs = bundle.adjacency[key] || [];
    if (adjEl) {
      const sample = pairs
        .slice(0, 4)
        .map(([a, b]) => {
          const fa = fc.features.find((f) => f.properties?.id === a);
          const fb = fc.features.find((f) => f.properties?.id === b);
          return `${fa?.properties?.label || a}↔${fb?.properties?.label || b}`;
        })
        .join(" · ");
      adjEl.textContent = pairs.length
        ? `相邻 ${pairs.length} 对：${sample}${pairs.length > 4 ? " …" : ""}`
        : "";
    }

    fitForLayer(key);
  }

  toolbar.querySelectorAll('input[name="region-layer"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (/** @type {HTMLInputElement} */ (input).checked) {
        showLayer(/** @type {HTMLInputElement} */ (input).value);
      }
    });
  });

  showLayer("macro");

  const onResize = () => map.invalidateSize();
  window.addEventListener("resize", onResize);
  requestAnimationFrame(() => map.invalidateSize());

  return {
    dispose() {
      window.removeEventListener("resize", onResize);
      map.remove();
      el.replaceChildren();
      el.style.display = "";
      el.style.flexDirection = "";
      el.style.background = "";
    },
  };
}
