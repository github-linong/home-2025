#!/usr/bin/env node
/**
 * Normalize demo tags/categories for JSRUN imports and curated enrichment noise.
 *
 * - Prefer lowercase tag `jsrun` (source); never use tag/category `JSRUN`
 * - Unclassified category → `实验`
 * - Collapse enrichment noise ($set, destination-out, …) into site-standard tags
 *
 *   node scripts/normalize-jsrun-tags.mjs
 *   node scripts/normalize-jsrun-tags.mjs --dry
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MD_DIR = path.join(ROOT, "apps/web/src/content/demos");
const ENRICH = path.join(ROOT, "scripts/data/jsrun/curated-enrichment.json");
const dry = process.argv.includes("--dry");

/** Map noisy / synonym tags → canonical site tags (or null to drop). */
const TAG_ALIAS = new Map([
  ["JSRUN", null], // identity is lowercase `jsrun`
  ["jsrun", "jsrun"],
  ["legacy", "legacy"],
  ["精选", "精选"],
  ["实验", "实验"],
  ["Vue 2", "Vue"],
  ["Vue 3", "Vue"],
  ["vue", "Vue"],
  ["Vue2", "Vue"],
  ["Vue3", "Vue"],
  ["Flexbox", "CSS"],
  ["Flex", "CSS"],
  ["CSS动画", "动画"],
  ["Keyframe", "动画"],
  ["keyframes", "动画"],
  ["CSS变量", "CSS"],
  ["伪元素", "CSS"],
  ["伪类", "CSS"],
  ["shape-outside", "CSS"],
  ["clip-path", "CSS"],
  ["CSS Shapes", "CSS"],
  ["multi-column", "CSS"],
  ["masonry", "CSS"],
  ["sticky", "CSS"],
  ["radial-gradient", "CSS"],
  ["conic-gradient", "CSS"],
  ["transform", "CSS"],
  ["transition", "动画"],
  ["offset-path", "动画"],
  ["stroke-dasharray", "SVG"],
  ["destination-out", "Canvas"],
  ["getImageData", "Canvas"],
  ["Image", "Canvas"],
  ["触摸", "交互"],
  ["touch", "交互"],
  ["Drag and Drop", "交互"],
  ["HTML5", "JavaScript"],
  ["DOM", "JavaScript"],
  ["DOM复用", "JavaScript"],
  ["原生JS", "JavaScript"],
  ["定时器", "JavaScript"],
  ["localStorage", "JavaScript"],
  ["Blob URL", "JavaScript"],
  ["FileReader", "JavaScript"],
  ["clipboardData", "JavaScript"],
  ["dataTransfer", "JavaScript"],
  ["CancelToken", "axios"],
  ["响应式", "Vue"],
  ["$set", "Vue"],
  ["$delete", "Vue"],
  ["$nextTick", "Vue"],
  ["slot", "Vue"],
  ["vue-router", "Vue"],
  ["keep-alive", "Vue"],
  ["v-model", "Vue"],
  ["组件封装", "Vue"],
  ["组件通信", "Vue"],
  ["递归组件", "Vue"],
  ["列表交互", "Vue"],
  ["模板渲染", "Vue"],
  ["跨版本", "Vue"],
  ["组件包装", "Vue"],
  ["SortableJS", "交互"],
  ["Vue.Draggable", "交互"],
  ["拖拽排序", "交互"],
  ["批量拖拽", "交互"],
  ["拖动", "交互"],
  ["拖放", "交互"],
  ["拖拽", "交互"],
  ["缩放", "交互"],
  ["聚焦", "交互"],
  ["box-shadow", "CSS"],
  ["交互原型", "交互"],
  ["新手引导", "交互"],
  ["产品引导", "交互"],
  ["intro.js", "交互"],
  ["driver.js", "交互"],
  ["Element UI", "Vue"],
  ["表单交互", "表单"],
  ["多选", "表单"],
  ["上传", "交互"],
  ["粘贴", "交互"],
  ["Base64", "JavaScript"],
  ["piexifjs", "JavaScript"],
  ["EXIF", "JavaScript"],
  ["Orientation", "JavaScript"],
  ["docx-preview", "工具"],
  ["PPTXjs", "工具"],
  ["SheetJS", "工具"],
  ["mammoth", "工具"],
  ["PDF.js", "工具"],
  ["文件预览", "工具"],
  ["Office", "工具"],
  ["Mixed App", "工具"],
  ["混合 App", "工具"],
  ["UA 检测", "JavaScript"],
  ["前端安全", "工具"],
  ["隐私", null],
  ["水印", "图形"],
  ["图像处理", "图形"],
  ["马赛克", "图形"],
  ["可视化", "图形"],
  ["数据可视化", "图形"],
  ["ECharts GL", "ECharts"],
  ["tree", "ECharts"],
  ["layout.tree", "D3"],
  ["hierarchy", "D3"],
  ["SVG", "SVG"],
  ["3D", "图形"],
  ["alpha-beta", "算法"],
  ["Alpha-Beta", "算法"],
  ["博弈搜索", "算法"],
  ["2048", "游戏"],
  ["AI", "算法"],
  ["扫雷", "游戏"],
  ["矩阵", "算法"],
  ["算法", "算法"],
  ["游戏", "游戏"],
  ["转盘", "游戏"],
  ["抽奖", "游戏"],
  ["拼贴", "图形"],
  ["异步", "JavaScript"],
  ["几何", "算法"],
  ["面积", "算法"],
  ["模拟", "算法"],
  ["统计可视化", "图形"],
  ["贫富差距", "算法"],
  ["随机过程", "算法"],
  ["重试", "axios"],
  ["超时", "axios"],
  ["axios", "axios"],
  ["进度条", "Vue"],
  ["文本解析", "JavaScript"],
  ["磁盘占用", "工具"],
  ["高度动画", "动画"],
  ["折叠面板", "交互"],
  ["瀑布流式布局", "布局"],
  ["绝对定位", "CSS"],
  ["resize", "交互"],
  ["定位", "CSS"],
  ["滚动", "交互"],
  ["layout", "布局"],
  ["布局", "布局"],
  ["多列", "布局"],
  ["ellipsis", "CSS"],
  ["BFC", "CSS"],
  ["float", "CSS"],
  ["sticky footer", "布局"],
  ["absolute", "CSS"],
  ["calc", "CSS"],
  ["overflow", "CSS"],
  ["导航", "交互"],
  ["下划线动画", "动画"],
  ["边框", "CSS"],
  ["clip", "CSS"],
  ["涟漪", "动画"],
  ["视觉", "动画"],
  ["前端动画", "动画"],
  ["弹幕", "交互"],
  ["翻牌", "动画"],
  ["特效", "动画"],
  ["数字滚动", "动画"],
  ["jQuery", "jQuery"],
  ["链接", "CSS"],
  ["visited", "CSS"],
  ["屏保", "Vue"],
  ["时间轮盘", "Vue"],
  ["前端", null],
  ["前端实验", "实验"],
  ["前端工具", "工具"],
  ["迁移残片", "实验"],
  ["翻页动画", "动画"],
  ["Turn.js", "交互"],
  ["点阵", "图形"],
  ["太极", "图形"],
  ["矢量绘制", "图形"],
  ["路径", "Canvas"],
  ["arc", "Canvas"],
  ["mousemove", "交互"],
  ["侧栏", "布局"],
  ["UI效果", "CSS"],
  ["蛇形", "布局"],
  ["缓存", "Vue"],
  ["数据大屏", "图形"],
  ["Vue 片段", "Vue"],
  ["树形结构", "Vue"],
  ["折叠展开", "交互"],
  ["按钮", "CSS"],
  ["loading", "CSS"],
  ["纯 CSS", "CSS"],
  ["刮奖", "Canvas"],
  ["节流", "JavaScript"],
  ["节流", "JavaScript"],
]);

const ALLOWED = new Set([
  "jsrun",
  "legacy",
  "精选",
  "实验",
  "Vue",
  "React",
  "JavaScript",
  "CSS",
  "Canvas",
  "SVG",
  "jQuery",
  "ECharts",
  "D3",
  "axios",
  "图形",
  "交互",
  "布局",
  "动画",
  "表单",
  "工具",
  "游戏",
  "算法",
  "测试",
]);

function canonicalizeTag(tag) {
  if (TAG_ALIAS.has(tag)) {
    const v = TAG_ALIAS.get(tag);
    return v && ALLOWED.has(v) ? v : v === null ? null : ALLOWED.has(v) ? v : null;
  }
  if (ALLOWED.has(tag)) return tag;
  // Title-case tech libs already allowed
  return null;
}

function normalizeTagList(tags, { curated = false } = {}) {
  const out = [];
  const seen = new Set();
  const push = (t) => {
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  push("jsrun");
  push("legacy");
  if (curated) push("精选");
  for (const raw of tags || []) {
    const c = canonicalizeTag(raw);
    if (c && c !== "jsrun" && c !== "legacy" && c !== "精选") push(c);
  }
  return out;
}

function normalizeCategory(cat, tags) {
  if (!cat || cat === "JSRUN" || cat === "jsrun") {
    // Prefer a tech tag as category when present
    for (const t of ["Vue", "React", "CSS", "图形", "交互", "表单", "算法", "游戏", "工具"]) {
      if (tags.includes(t)) return t;
    }
    return "实验";
  }
  if (cat === "JSRUN") return "实验";
  return cat;
}

function rewriteMd(mdPath) {
  let md = fs.readFileSync(mdPath, "utf8");
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return false;
  const slug = path.basename(mdPath, ".md");
  const curated = /badge:\s*"精选"/.test(fm[1]) || /"精选"/.test(fm[1]);
  const tagsLine = fm[1].match(/^tags:\s*\[(.*)]$/m)?.[1] || "";
  const rawTags = [...tagsLine.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const tags = normalizeTagList(rawTags, { curated });
  const catRaw = fm[1].match(/^category:\s*"?(.*?)"?\s*$/m)?.[1]?.replace(/^"|"$/g, "");
  const category = normalizeCategory(catRaw, tags);

  let nextFm = fm[1]
    .replace(/^category:\s*.*$/m, `category: "${category}"`)
    .replace(/^tags:\s*\[.*]$/m, `tags: [${tags.map((t) => `"${t}"`).join(", ")}]`);

  // ensure unique tags already handled
  const next = md.replace(fm[0], `---\n${nextFm}\n---`);
  if (next === md) return false;
  if (!dry) fs.writeFileSync(mdPath, next);
  return true;
}

function main() {
  const files = fs.readdirSync(MD_DIR).filter((f) => f.startsWith("jsrun-") && f.endsWith(".md"));
  let changed = 0;
  for (const f of files) {
    if (rewriteMd(path.join(MD_DIR, f))) changed++;
  }

  // Also normalize enrichment source tags for future re-apply
  if (fs.existsSync(ENRICH)) {
    const items = JSON.parse(fs.readFileSync(ENRICH, "utf8"));
    for (const item of items) {
      item.tags = normalizeTagList(item.tags, { curated: true }).filter(
        (t) => !["jsrun", "legacy", "精选"].includes(t),
      );
    }
    if (!dry) fs.writeFileSync(ENRICH, JSON.stringify(items, null, 2) + "\n");
  }

  console.log(
    `${dry ? "Would change" : "Changed"} ${changed}/${files.length} jsrun markdown files (tags/category normalized)`,
  );
}

main();
