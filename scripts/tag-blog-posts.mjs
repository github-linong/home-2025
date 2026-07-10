#!/usr/bin/env node
/**
 * Review blog posts and add/supplement tags based on title + content.
 * Usage: node scripts/tag-blog-posts.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.join(__dirname, "../apps/web/src/content/blog");
const DRY_RUN = process.argv.includes("--dry-run");

/** @type {Array<{ match: RegExp | string, tags: string[] }>} */
const TITLE_RULES = [
  { match: /前端培训/i, tags: ["前端培训"] },
  { match: /前端\s*BUG\s*录|前端bug录/i, tags: ["前端BUG录", "调试"] },
  { match: /前端答疑/i, tags: ["前端答疑"] },
  { match: /面试题|\[面试官系列\]/i, tags: ["面试题"] },
  { match: /leetcode/i, tags: ["LeetCode", "算法"] },
  { match: /设计模式/i, tags: ["设计模式"] },
  { match: /年终总结|年度总结|2019总结|2020总结/i, tags: ["年终总结"] },
  { match: /Web 页面优化|Lighthouse|性能分数|加载速度优化|体积优化/i, tags: ["性能优化"] },
  { match: /XSS|xss|CSP|内容安全|web网络攻击/i, tags: ["安全", "XSS"] },
  { match: /爬虫|爬数据|IP 代理|数据抓取/i, tags: ["爬虫", "数据采集"] },
  { match: /微信|wx-open|二次分享|微信授权/i, tags: ["微信"] },
  { match: /PWA|Service Workers?/i, tags: ["PWA"] },
  { match: /Node\.?js|nodejs|koa|express|pm2|MongoDB|noSQL/i, tags: ["Node.js"] },
  { match: /Vue|vue-router|vuex|vuedraggable|vue-cli/i, tags: ["Vue"] },
  { match: /React|RSC|Server Components/i, tags: ["React"] },
  { match: /Next\.js/i, tags: ["Next.js"] },
  { match: /jQuery/i, tags: ["jQuery"] },
  { match: /Canvas|刮刮卡|碰撞检测|摇一摇|弹幕|瀑布流/i, tags: ["动画与交互"] },
  { match: /AJAX|Fetch|xhr|Blob|FormData|ArrayBuffer/i, tags: ["AJAX"] },
  { match: /HTML5|contenteditable|拖动排序|拖拽API/i, tags: ["HTML5"] },
  { match: /基于 Flex|吸顶效果|瀑布流布局|隐藏页面元素|两端对齐垂直|固定在容器底部/i, tags: ["CSS"] },
  { match: /PDF|PDFJS/i, tags: ["PDF"] },
  { match: /AST|组件库替换/i, tags: ["AST", "工程化"] },
  { match: /Ant Design|elementUI|element-ui/i, tags: ["UI组件库"] },
  { match: /Cursor|AI|LLM|大模型/i, tags: ["AI"] },
  { match: /开源|Demo 全流程/i, tags: ["开源"] },
  { match: /Nginx/i, tags: ["Nginx"] },
  { match: /axios/i, tags: ["Axios"] },
  { match: /Chrome 开发者工具|chrome开发者工具/i, tags: ["DevTools"] },
  { match: /文件上传|download|预览文件/i, tags: ["文件处理"] },
  { match: /节流|防抖|debounce|throttle/i, tags: ["JavaScript"] },
  { match: /Promise|async|ES6|ECMAScript|Class |generator|proxy|reflect/i, tags: ["JavaScript"] },
  { match: /Cookie|session|localStorage|sessionStorage|stroage/i, tags: ["浏览器存储"] },
  { match: /HTTP|同源|跨域|CORS/i, tags: ["HTTP"] },
  { match: /WebSocket|socket/i, tags: ["WebSocket"] },
  { match: /Web Workers?/i, tags: ["Web Workers"] },
  { match: /Unicode|UTF/i, tags: ["字符编码"] },
  { match: /正则表达式/i, tags: ["正则表达式"] },
  { match: /input|textarea/i, tags: ["表单"] },
  { match: /海报|二维码/i, tags: ["Canvas"] },
  { match: /上线事故|5Why|Bug 排查|BUG排查/i, tags: ["工程实践", "调试"] },
  { match: /招聘|面试记录|准备面试/i, tags: ["职业发展"] },
  { match: /程序员必备|vscode 插件|开发工具|Uses/i, tags: ["工具"] },
  { match: /TailwindCSS/i, tags: ["TailwindCSS", "CSS"] },
  { match: /健康计划|体检/i, tags: ["生活", "健康"] },
  { match: /写作|技术博客/i, tags: ["写作"] },
  { match: /趋势|技术雷达/i, tags: ["前端", "趋势"] },
  { match: /静态导出/i, tags: ["Next.js", "静态站点"] },
  { match: /SegmentFault|思否.*周年/i, tags: ["社区"] },
  { match: /第一份编程工作|探索编码/i, tags: ["职业发展", "随笔"] },
  { match: /新人引导|聚焦效果|升级提示/i, tags: ["用户体验"] },
  { match: /生成海报|python/i, tags: ["Python"] },
  { match: /横竖屏|orientation|matchMedia|移动端适配|rem|vw/i, tags: ["移动端"] },
  { match: /自定义字体/i, tags: ["CSS", "字体"] },
  { match: /exif|图片旋转/i, tags: ["图片处理", "JavaScript"] },
  { match: /JavaScript 函数片段|工作中常用.*函数/i, tags: ["JavaScript", "工具函数"] },
  { match: /云毕业照|毕业照/i, tags: ["Canvas", "创意"] },
  { match: /response.*头信息|Content-Type/i, tags: ["HTTP", "JavaScript"] },
  { match: /0\.1 \+ 0\.2|浮点数/i, tags: ["JavaScript", "面试题"] },
  { match: /JavaScript|javascript|\bJS\b/i, tags: ["JavaScript"] },
  { match: /数组|forEach|map|filter|reduce|伪数组/i, tags: ["JavaScript"] },
  { match: /事件|event|冒泡|捕获/i, tags: ["JavaScript", "DOM"] },
  { match: /DOM|BOM/i, tags: ["DOM"] },
  { match: /单例模式/i, tags: ["设计模式", "JavaScript"] },
  { match: /前后端交互/i, tags: ["AJAX", "前后端"] },
];

/** @type {Array<{ keywords: RegExp, tag: string }>} */
const CONTENT_KEYWORDS = [
  { keywords: /javascript|\bjs\b/i, tag: "JavaScript" },
  { keywords: /\bvue\b|vue-router|vuex|vuedraggable/i, tag: "Vue" },
  { keywords: /react|server component/i, tag: "React" },
  { keywords: /next\.js/i, tag: "Next.js" },
  { keywords: /jquery/i, tag: "jQuery" },
  { keywords: /typescript|\.tsx?\b/i, tag: "TypeScript" },
  { keywords: /mongodb|mongoose/i, tag: "MongoDB" },
  { keywords: /express\.js|\bexpress\b/i, tag: "Express" },
  { keywords: /koa2?|koa-body/i, tag: "Koa" },
  { keywords: /puppeteer|selenium|playwright/i, tag: "自动化测试" },
  { keywords: /webpack|vite|rollup/i, tag: "构建工具" },
  { keywords: /tailwind/i, tag: "TailwindCSS" },
  { keywords: /lighthouse/i, tag: "Lighthouse" },
  { keywords: /lodash/i, tag: "Lodash" },
  { keywords: /better-scroll/i, tag: "滚动" },
  { keywords: /pdfjs|pdf\.js/i, tag: "PDF" },
  { keywords: /element-ui|elementui/i, tag: "Element UI" },
  { keywords: /ant design|antd/i, tag: "Ant Design" },
  { keywords: /websocket/i, tag: "WebSocket" },
  { keywords: /service worker/i, tag: "PWA" },
  { keywords: /canvas/i, tag: "Canvas" },
  { keywords: /nginx/i, tag: "Nginx" },
  { keywords: /docker|pm2/i, tag: "运维" },
];

const TRAINING_TOPIC_RULES = [
  { match: /ECMAScript|Promise|ES6|Class |generator|proxy|reflect|set、map/i, tags: ["JavaScript"] },
  { match: /jQuery/i, tags: ["jQuery"] },
  { match: /Vue|vue-router|vuex|vue-cli/i, tags: ["Vue"] },
  { match: /node|MongoDB|Express|CommonJS|NPM|noSQL/i, tags: ["Node.js"] },
  { match: /HTTP|同源|跨域|fetch|xhr|Ajax/i, tags: ["HTTP"] },
  { match: /DOM|BOM|事件/i, tags: ["DOM"] },
  { match: /Canvas|多媒体|地理定位|拖拽|文件API|FileReader/i, tags: ["HTML5"] },
  { match: /localStorage|sessionStorage|cookie|数据存储/i, tags: ["浏览器存储"] },
  { match: /Web Workers?|WebSocket|Service Workers?|Manifest|PWA/i, tags: ["PWA"] },
  { match: /xss|网络攻击|CSP/i, tags: ["安全"] },
  { match: /正则表达式/i, tags: ["正则表达式"] },
  { match: /Unicode|UTF/i, tags: ["字符编码"] },
  { match: /场景实战|聊天|下载|防抖|Nginx|移动端/i, tags: ["实战"] },
];

const DEFAULT_TAG = "前端";

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return null;

  const firstNl = raw.indexOf("\n");
  if (firstNl === -1) return null;

  let closeIdx = -1;
  let bodyStart = -1;
  for (let i = firstNl + 1; i < raw.length; ) {
    const lineEnd = raw.indexOf("\n", i);
    const line = lineEnd === -1 ? raw.slice(i) : raw.slice(i, lineEnd);
    if (line.startsWith("---")) {
      closeIdx = i;
      if (line === "---") {
        bodyStart = lineEnd === -1 ? raw.length : lineEnd + 1;
      } else {
        bodyStart = i + 3;
      }
      break;
    }
    i = lineEnd === -1 ? raw.length : lineEnd + 1;
  }
  if (closeIdx === -1) return null;

  const fmText = raw.slice(firstNl + 1, closeIdx);
  const body = raw.slice(bodyStart);
  const fm = {};

  for (const line of fmText.split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (value === "") continue;
    if (value.startsWith("[")) {
      try {
        fm[key] = JSON.parse(value);
      } catch {
        fm[key] = value;
      }
      continue;
    }
    try {
      fm[key] = JSON.parse(value);
    } catch {
      fm[key] = value;
    }
  }

  return { fm, body, fmText };
}

function inferTags(title, description, bodyPreview) {
  const text = `${title}\n${description}\n${bodyPreview}`;
  const tags = new Set();

  for (const rule of TITLE_RULES) {
    const re = rule.match instanceof RegExp ? rule.match : new RegExp(rule.match, "i");
    if (re.test(title) || (re.test(description) && !/HTML\/CSS\/JS/i.test(description))) {
      rule.tags.forEach((t) => tags.add(t));
    }
  }

  const isTraining = tags.has("前端培训");
  const titleText = `${title}\n${description}`;

  if (isTraining) {
    for (const rule of TRAINING_TOPIC_RULES) {
      if (rule.match.test(title)) rule.tags.forEach((t) => tags.add(t));
    }
  }

  if (!isTraining || tags.size < 3) {
    for (const { keywords, tag } of CONTENT_KEYWORDS) {
      if (keywords.test(titleText) || (!isTraining && keywords.test(bodyPreview))) {
        tags.add(tag);
      }
    }
  }

  if (tags.size === 0) tags.add(DEFAULT_TAG);
  if (
    !isTraining &&
    ![...tags].some((t) =>
      ["前端", "JavaScript", "Vue", "Node.js", "CSS", "HTML5", "AJAX"].includes(t)
    )
  ) {
    if (/js|javascript|前端/i.test(title)) tags.add("JavaScript");
  }

  return [...tags].slice(0, 5);
}

function mergeTags(existing, inferred) {
  if (!existing?.length) return inferred;
  const merged = new Set(existing);
  for (const tag of inferred) {
    if (merged.size >= 5) break;
    merged.add(tag);
  }
  return [...merged].slice(0, 5);
}

function serializeFrontmatter(fm) {
  const lines = ["---"];
  const order = [
    "title",
    "description",
    "pubDate",
    "updatedDate",
    "heroImage",
    "tags",
    "badge",
    "source",
    "sourceUrl",
  ];

  const keys = [...order.filter((k) => k in fm), ...Object.keys(fm).filter((k) => !order.includes(k))];

  for (const key of keys) {
    const value = fm[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === "string") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function processFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parseFrontmatter(raw);
  if (!parsed) return { file: path.basename(filePath), skipped: true };

  const { fm, body } = parsed;
  const bodyPreview = body.slice(0, 2000);
  const inferred = inferTags(fm.title ?? "", fm.description ?? "", bodyPreview);
  const existing = fm.tags ?? [];
  const tags =
    existing.length === 0 || (existing.length === 1 && existing[0] === DEFAULT_TAG)
      ? inferred
      : mergeTags(existing, inferred);

  const changed = JSON.stringify(fm.tags ?? []) !== JSON.stringify(tags);
  if (changed) {
    fm.tags = tags;
    const next = serializeFrontmatter(fm) + body;
    if (!DRY_RUN) fs.writeFileSync(filePath, next);
  }

  return {
    file: path.basename(filePath),
    title: fm.title,
    tags,
    changed,
  };
}

const files = fs
  .readdirSync(BLOG_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => path.join(BLOG_DIR, f));

const results = files.map(processFile);
const updated = results.filter((r) => r.changed);

console.log(`${DRY_RUN ? "[dry-run] " : ""}Processed ${results.length} posts, updated ${updated.length}`);

if (updated.length) {
  console.log("\nSample updates:");
  for (const r of updated.slice(0, 15)) {
    console.log(`  ${r.file}: ${JSON.stringify(r.tags)}`);
  }
  if (updated.length > 15) console.log(`  ... and ${updated.length - 15} more`);
}

const tagCounts = new Map();
for (const r of results) {
  for (const t of r.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
}
console.log("\nTop tags:");
[...tagCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([t, n]) => console.log(`  ${t}: ${n}`));
