#!/usr/bin/env node
/**
 * Content-personalized hero images.
 *
 * - Blog: keyword scenes + title/description/tags rendered via Puppeteer
 * - Demo: live screenshot of local demo HTML when possible; scene fallback otherwise
 *
 * Usage:
 *   node scripts/generate-hero-images.mjs --write
 *   node scripts/generate-hero-images.mjs --write --force
 *   node scripts/generate-hero-images.mjs --write --only=blog
 *   node scripts/generate-hero-images.mjs --write --only=demo --limit=20
 *   node scripts/generate-hero-images.mjs --write --concurrency=4
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { once } from "node:events";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webRoot = path.join(root, "apps/web");
const blogDir = path.join(webRoot, "src/content/blog");
const demosDir = path.join(webRoot, "src/content/demos");
const publicDir = path.join(webRoot, "public");
const heroRoot = path.join(publicDir, "heroes");

const write = process.argv.includes("--write");
const force = process.argv.includes("--force");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : 0;
const offsetArg = process.argv.find((a) => a.startsWith("--offset="));
const offset = offsetArg ? Number(offsetArg.slice(9)) : 0;
const slugFilterArg = process.argv.find((a) => a.startsWith("--slugs-file="));
const slugFilter = slugFilterArg
  ? new Set(
      fs
        .readFileSync(slugFilterArg.slice(13), "utf8")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;
const wantScreenshots = process.argv.includes("--screenshots");
const concurrency = Math.max(
  1,
  Number(process.argv.find((a) => a.startsWith("--concurrency="))?.slice(14) || 4),
);

const require = createRequire(path.join(webRoot, "package.json"));
const sharp = require("sharp");
const puppeteer = require(path.join(root, "node_modules/puppeteer"));

const W = 1200;
const H = 675;

function hash(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function hashInt(s, mod = 1e9) {
  return parseInt(hash(s).slice(0, 8), 16) % mod;
}
function safeFileStem(slug) {
  if (/^[\w.-]+$/u.test(slug)) return slug;
  return `h-${hash(slug).slice(0, 16)}`;
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeCss(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function splitFrontmatter(raw) {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  return {
    fm: raw.slice(4, end),
    body: raw.slice(end + 4).replace(/^\r?\n/, ""),
  };
}
function parseField(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}
function parseScalarList(fm, key) {
  const block = fm.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.*\\n?)+)`, "m"));
  if (block) {
    return block[1]
      .split("\n")
      .map((l) => l.match(/^\s+-\s+(.*)$/)?.[1]?.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  const inline = fm.match(new RegExp(`^${key}:\\s*\\[(.*)\\]\\s*$`, "m"));
  if (inline) {
    return inline[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [];
}
function upsertHeroImage(fm, heroPath) {
  if (/^heroImage:/m.test(fm)) {
    return fm.replace(/^heroImage:\s*.*$/m, `heroImage: "${heroPath}"`);
  }
  if (/^title:/m.test(fm)) {
    return fm.replace(/^(title:\s*.*$)/m, `$1\nheroImage: "${heroPath}"`);
  }
  return `heroImage: "${heroPath}"\n${fm}`;
}
function listMd(dir) {
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".md"))
    .map((n) => path.join(dir, n));
}

/** @typedef {{ id: string, label: string, match: (ctx: any) => number }} SceneDef */

const SCENES = [
  {
    id: "ai-network",
    label: "AI",
    match: (c) => scoreText(c, ["AI", "LLM", "Copilot", "Cursor", "专家", "智能"]) * 2,
  },
  {
    id: "code-editor",
    label: "Code",
    match: (c) =>
      scoreText(c, ["JavaScript", "TypeScript", "JS", "代码", "编程", "函数", "Array", "async"]),
  },
  {
    id: "vue",
    label: "Vue",
    match: (c) => scoreText(c, ["Vue", "vue2", "vue3", "Element"]),
  },
  {
    id: "react",
    label: "React",
    match: (c) => scoreText(c, ["React", "RSC", "Next.js", "Next"]),
  },
  {
    id: "css-layout",
    label: "CSS",
    match: (c) => scoreText(c, ["CSS", "Flex", "Grid", "布局", "样式", "Tailwind"]),
  },
  {
    id: "canvas",
    label: "Canvas",
    match: (c) =>
      scoreText(c, [
        "Canvas",
        "签名",
        "绘图",
        "图形",
        "迷宫",
        "FOV",
        "Rot",
        "架构图",
        "编辑器",
        "diagram",
        "拖拽",
      ]),
  },
  {
    id: "http",
    label: "HTTP",
    match: (c) => scoreText(c, ["HTTP", "CORS", "跨域", "请求", "接口", "API", "代理"]),
  },
  {
    id: "bug",
    label: "Debug",
    match: (c) => scoreText(c, ["Bug", "BUG", "调试", "踩坑", "报错", "复现", "坑"]),
  },
  {
    id: "qa",
    label: "问答",
    match: (c) => (c.kind === "answer" ? 12 : 0) + scoreText(c, ["问答", "Q ", "解答"]),
  },
  {
    id: "mobile",
    label: "Mobile",
    match: (c) => scoreText(c, ["移动端", "iOS", "Android", "PWA", "触控", "viewport"]),
  },
  {
    id: "form",
    label: "表单",
    match: (c) => scoreText(c, ["表单", "input", "校验", "上传", "Upload"]),
  },
  {
    id: "media",
    label: "媒体",
    match: (c) => scoreText(c, ["音视频", "Video", "Audio", "录屏", "摄像头", "Media"]),
  },
  {
    id: "files",
    label: "文件",
    match: (c) => scoreText(c, ["文件", "IO", "PDF", "目录", "管理器", "tree"]),
  },
  {
    id: "deploy",
    label: "上线",
    match: (c) => scoreText(c, ["上线", "部署", "开源", "发布", "静态导出", "Export"]),
  },
  {
    id: "health",
    label: "健康",
    match: (c) => scoreText(c, ["健康", "运动", "作息"]),
  },
  {
    id: "radar",
    label: "趋势",
    match: (c) => scoreText(c, ["趋势", "雷达", "Uses", "工具栈"]),
  },
  {
    id: "websocket",
    label: "Realtime",
    match: (c) => scoreText(c, ["WebSocket", "实时", "弹幕"]),
  },
  {
    id: "lab",
    label: "实验",
    match: (c) => scoreText(c, ["实验", "Demo", "测试", "对比"]),
  },
];

function scoreText(ctx, words) {
  const blob = `${ctx.title} ${ctx.description} ${(ctx.tags || []).join(" ")} ${ctx.category || ""} ${ctx.badge || ""}`;
  let score = 0;
  for (const w of words) {
    if (blob.toLowerCase().includes(String(w).toLowerCase())) score += 3;
  }
  return score;
}

function pickScene(ctx) {
  let best = SCENES[SCENES.length - 1];
  let bestScore = -1;
  for (const scene of SCENES) {
    let s = scene.match(ctx);
    // Prefer an exact first-tag hit so AI/健康/问答 don't get drowned by React/JS tags.
    const first = (ctx.tags || [])[0];
    if (first && scene.label.toLowerCase() === String(first).toLowerCase()) s += 10;
    if (first && scoreText({ ...ctx, title: first, description: "", tags: [] }, [first]) && scene.id.includes(first.toLowerCase())) {
      s += 8;
    }
    if (ctx.kind === "answer" && scene.id === "qa") s += 20;
    if (ctx.category && scene.match({ ...ctx, title: ctx.category, description: "", tags: [] }) >= 3) {
      s += 6;
    }
    s += hashInt(`${ctx.slug}:${scene.id}`, 2);
    if (s > bestScore) {
      bestScore = s;
      best = scene;
    }
  }
  return best;
}

function paletteFor(sceneId, seed) {
  const table = {
    "ai-network": ["#07141f", "#123047", "#5eead4"],
    "code-editor": ["#0b1220", "#1e293b", "#fbbf24"],
    vue: ["#071a12", "#14532d", "#86efac"],
    react: ["#071825", "#0c4a6e", "#7dd3fc"],
    "css-layout": ["#0f172a", "#334155", "#38bdf8"],
    canvas: ["#1a1008", "#9a3412", "#fdba74"],
    http: ["#0b1324", "#1e3a5f", "#93c5fd"],
    bug: ["#1a0b0b", "#7f1d1d", "#fb7185"],
    qa: ["#111827", "#374151", "#fcd34d"],
    mobile: ["#0c1222", "#1e3a8a", "#a5b4fc"],
    form: ["#14110e", "#44403c", "#fde68a"],
    media: ["#0f1419", "#1f2937", "#fb923c"],
    files: ["#0c1a14", "#115e59", "#5eead4"],
    deploy: ["#0b1628", "#1d4ed8", "#93c5fd"],
    health: ["#0f1a14", "#166534", "#86efac"],
    radar: ["#0b1220", "#0f766e", "#67e8f9"],
    websocket: ["#0c1020", "#312e81", "#c7d2fe"],
    lab: ["#0a1628", "#155e75", "#67e8f9"],
  };
  const base = table[sceneId] || ["#0b1220", "#1e293b", "#94a3b8"];
  // slight seed tint shift via swapping stop order sometimes
  return hashInt(seed, 2) === 0 ? base : [base[1], base[0], base[2]];
}

function sceneMarkup(sceneId, accent) {
  switch (sceneId) {
    case "ai-network":
      return `
        <div class="scene ai">
          ${[0, 1, 2, 3, 4, 5, 6, 7]
            .map((i) => {
              const ang = (Math.PI * 2 * i) / 8;
              const x = 50 + Math.cos(ang) * 32;
              const y = 48 + Math.sin(ang) * 28;
              return `<span class="node" style="left:${x}%;top:${y}%;"><b>E${i + 1}</b></span>`;
            })
            .join("")}
          <span class="core">AI</span>
          <svg class="wires" viewBox="0 0 100 100" preserveAspectRatio="none">
            ${[0, 1, 2, 3, 4, 5, 6, 7]
              .map((i) => {
                const ang = (Math.PI * 2 * i) / 8;
                const x = 50 + Math.cos(ang) * 32;
                const y = 48 + Math.sin(ang) * 28;
                return `<line x1="50" y1="48" x2="${x}" y2="${y}" stroke="${accent}" stroke-width="0.7" opacity="0.55"/>`;
              })
              .join("")}
          </svg>
        </div>`;
    case "code-editor":
      return `
        <div class="scene editor">
          <div class="chrome"><i></i><i></i><i></i><b>main.ts</b></div>
          <pre><span class="k">async function</span> <span class="f">run</span>() {
  <span class="k">const</span> data = <span class="k">await</span> fetch(url)
  <span class="k">return</span> data.json()
}</pre>
        </div>`;
    case "vue":
      return `
        <div class="scene brandvue">
          <div class="vlogo">V</div>
          <div class="card">{{ message }}</div>
          <div class="card faint">&lt;template&gt;</div>
        </div>`;
    case "react":
      return `
        <div class="scene react">
          <div class="orbit"><span></span><span></span><span></span></div>
          <div class="chip">&lt;ServerComponent /&gt;</div>
        </div>`;
    case "css-layout":
      return `
        <div class="scene cssgrid">
          <div></div><div></div><div></div>
          <div class="wide"></div><div></div>
        </div>`;
    case "canvas":
      return `
        <div class="scene canvas">
          <svg viewBox="0 0 240 180">
            <rect x="8" y="8" width="224" height="164" rx="8" fill="none" stroke="${accent}" stroke-width="3" opacity=".5"/>
            <path d="M30 130 C70 40, 120 160, 210 50" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
            <circle cx="210" cy="50" r="8" fill="${accent}"/>
          </svg>
        </div>`;
    case "http":
      return `
        <div class="scene http">
          <div class="pkt req">GET /api</div>
          <div class="arrow">⟶</div>
          <div class="pkt res">200 OK</div>
        </div>`;
    case "bug":
      return `
        <div class="scene bug">
          <div class="lens"></div>
          <div class="bugmark">🐛</div>
          <div class="stack">TypeError<br/>at line 42</div>
        </div>`;
    case "qa":
      return `
        <div class="scene qa">
          <div class="bubble q">Q</div>
          <div class="bubble a">A</div>
        </div>`;
    case "mobile":
      return `
        <div class="scene phone">
          <div class="bezel"><div class="notch"></div><div class="screen"></div></div>
        </div>`;
    case "form":
      return `
        <div class="scene form">
          <div class="field"></div>
          <div class="field short"></div>
          <div class="btn">Submit</div>
        </div>`;
    case "media":
      return `
        <div class="scene media">
          <div class="player"><span class="play">▶</span></div>
          <div class="wave"></div>
        </div>`;
    case "files":
      return `
        <div class="scene files">
          <div class="folder">📁 src</div>
          <div class="file">📄 app.ts</div>
          <div class="file">📄 utils.ts</div>
        </div>`;
    case "deploy":
      return `
        <div class="scene deploy">
          <div class="rocket">🚀</div>
          <div class="trail"></div>
        </div>`;
    case "health":
      return `
        <div class="scene health">
          <svg viewBox="0 0 200 80">
            <polyline points="0,40 30,40 40,20 55,60 70,35 90,40 200,40" fill="none" stroke="${accent}" stroke-width="4"/>
          </svg>
        </div>`;
    case "radar":
      return `
        <div class="scene radar">
          <div class="ring"></div><div class="ring r2"></div><div class="ring r3"></div>
          <div class="sweep"></div>
        </div>`;
    case "websocket":
      return `
        <div class="scene ws">
          <div class="pipe"></div>
          <span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
        </div>`;
    default:
      return `
        <div class="scene lab">
          <div class="beaker">⚗</div>
          <div class="dots"><i></i><i></i><i></i></div>
        </div>`;
  }
}

function buildIllustrationHtml(ctx) {
  const scene = pickScene(ctx);
  const [c0, c1, accent] = paletteFor(scene.id, ctx.slug);
  const tags = (ctx.tags || []).slice(0, 4);
  const desc = (ctx.description || "").replace(/\s+/g, " ").slice(0, 90);
  const kindLabel =
    ctx.collection === "demo"
      ? ctx.badge || ctx.category || scene.label
      : ctx.kind === "answer"
        ? "问答"
        : scene.label || tags[0] || "博客";
  const layout = hashInt(`${ctx.slug}:layout`, 3); // 0 classic, 1 overlay, 2 stacked

  const titleHtml = `<h1>${escapeHtml(ctx.title || ctx.slug)}</h1>`;
  const descHtml = desc
    ? `<p class="desc">${escapeHtml(desc)}${desc.length >= 90 ? "…" : ""}</p>`
    : "";
  const tagsHtml = tags.length
    ? `<div class="tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  const badgeHtml = `<div class="badge">${escapeHtml(kindLabel)}</div>`;
  const artHtml = `<div class="art">${sceneMarkup(scene.id, accent)}</div>`;

  let bodyInner = "";
  if (layout === 1) {
    bodyInner = `
      <div class="overlay-layout">
        ${artHtml}
        <div class="overlay-text">
          ${badgeHtml}
          ${titleHtml}
          ${descHtml}
          ${tagsHtml}
        </div>
      </div>`;
  } else if (layout === 2) {
    bodyInner = `
      <div class="stack-layout">
        <div class="stack-art">${artHtml}</div>
        <div class="stack-text">
          ${badgeHtml}
          ${titleHtml}
          ${descHtml}
          ${tagsHtml}
        </div>
      </div>`;
  } else {
    bodyInner = `
      <div class="frame">
        <div>
          ${badgeHtml}
          ${titleHtml}
          ${descHtml}
          ${tagsHtml}
        </div>
        ${artHtml}
      </div>`;
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${W}px; height: ${H}px; overflow: hidden;
    font-family: "PingFang SC", "Noto Sans SC", ui-sans-serif, system-ui, sans-serif;
    color: #f8fafc;
    background: linear-gradient(135deg, ${c0}, ${c1});
    position: relative;
  }
  .noise {
    position:absolute; inset:0; opacity:.08; pointer-events:none;
    background-image: radial-gradient(#fff 0.6px, transparent 0.6px);
    background-size: 4px 4px;
  }
  .frame {
    position: relative; z-index: 1;
    display: grid; grid-template-columns: 1.15fr 0.85fr;
    height: 100%; padding: 48px 52px;
    gap: 28px;
  }
  .overlay-layout { position:relative; z-index:1; height:100%; }
  .overlay-layout .art { position:absolute; inset:24px; }
  .overlay-text {
    position:absolute; left:48px; right:48px; bottom:40px; z-index:2;
    padding: 22px 24px; border-radius: 20px;
    background: linear-gradient(180deg, rgba(2,6,23,.2), rgba(2,6,23,.82));
    backdrop-filter: blur(2px);
  }
  .stack-layout {
    position:relative; z-index:1; height:100%; display:grid;
    grid-template-rows: 1.05fr 0.95fr; gap: 0;
  }
  .stack-art { padding: 28px 28px 0; }
  .stack-art .art { height: 100%; min-height: 280px; }
  .stack-text { padding: 18px 52px 40px; }
  .badge {
    display:inline-flex; align-items:center; gap:8px;
    padding: 8px 14px; border-radius: 999px;
    border: 1px solid ${accent}; color: ${accent};
    background: color-mix(in srgb, ${accent} 16%, transparent);
    font-weight: 700; font-size: 18px; letter-spacing: .02em;
  }
  h1 {
    margin-top: 18px; font-size: 40px; line-height: 1.25; font-weight: 800;
    letter-spacing: -0.02em;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .overlay-text h1, .stack-text h1 { font-size: 36px; }
  .desc {
    margin-top: 14px; font-size: 17px; line-height: 1.5; color: #cbd5e1;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .tags { margin-top: 18px; display:flex; flex-wrap:wrap; gap:8px; }
  .tag {
    font-size: 14px; padding: 6px 10px; border-radius: 8px;
    background: rgba(255,255,255,.06); color:#e2e8f0; border:1px solid rgba(255,255,255,.08);
  }
  .foot { position:absolute; left:52px; bottom:22px; color:#94a3b8; font-size:15px; z-index:3; }
  .art {
    position: relative; border-radius: 28px;
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.08);
    overflow: hidden; min-height: 100%;
    box-shadow: inset 0 0 80px color-mix(in srgb, ${accent} 18%, transparent);
  }
  .scene { position:absolute; inset:0; }
  .ai .node {
    position:absolute; width:34px; height:34px; border-radius:50%;
    background:${accent}; box-shadow:0 0 18px ${accent}; opacity:.92;
    display:grid; place-items:center; transform: translate(-50%, -50%);
    font-size:11px; font-weight:800; color:#042f2e;
  }
  .ai .core {
    position:absolute; left:50%; top:48%; transform:translate(-50%,-50%);
    width:54px; height:54px; border-radius:50%; display:grid; place-items:center;
    background:#042f2e; border:2px solid ${accent}; color:${accent}; font-weight:800; font-size:16px;
    box-shadow:0 0 28px color-mix(in srgb, ${accent} 55%, transparent);
  }
  .ai .wires { position:absolute; inset:0; width:100%; height:100%; }
  .editor { padding: 18px; }
  .chrome { display:flex; gap:8px; align-items:center; margin-bottom:14px; color:#94a3b8; font-size:13px; }
  .chrome i { width:10px; height:10px; border-radius:50%; background:#64748b; display:inline-block; }
  .chrome i:nth-child(1){background:#f87171} .chrome i:nth-child(2){background:#fbbf24} .chrome i:nth-child(3){background:#4ade80}
  .chrome b { margin-left:8px; font-weight:600; }
  .editor pre {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 15px; line-height: 1.55; color:#e2e8f0; white-space: pre-wrap;
  }
  .editor .k { color:${accent}; } .editor .f { color:#fde68a; }
  .brandvue, .react, .cssgrid, .canvas, .http, .bug, .qa, .phone, .form, .media, .files, .deploy, .health, .radar, .ws, .lab {
    display:grid; place-items:center; height:100%;
  }
  .vlogo {
    width:120px; height:120px; clip-path: polygon(50% 0%, 100% 88%, 0% 88%);
    background: linear-gradient(180deg, #42b883, #35495e); display:grid; place-items:center;
    font-size:54px; font-weight:900;
  }
  .card {
    margin-top:18px; padding:12px 18px; border-radius:12px; background:rgba(0,0,0,.25);
    border:1px solid rgba(255,255,255,.1); font-family: ui-monospace, monospace; font-size:16px;
  }
  .card.faint { opacity:.55; margin-top:10px; }
  .orbit {
    width:160px; height:160px; border-radius:50%; border:2px solid color-mix(in srgb, ${accent} 50%, transparent);
    position:relative; display:grid; place-items:center;
  }
  .orbit::after { content:""; width:28px; height:28px; border-radius:50%; background:${accent}; box-shadow:0 0 30px ${accent}; }
  .orbit span { position:absolute; width:14px; height:14px; border-radius:50%; background:${accent}; }
  .orbit span:nth-child(1){ top:-7px; left:50%; }
  .orbit span:nth-child(2){ bottom:18px; left:8px; }
  .orbit span:nth-child(3){ bottom:18px; right:8px; }
  .chip { margin-top:22px; padding:10px 14px; border-radius:10px; background:rgba(0,0,0,.28); font-family:ui-monospace,monospace; color:${accent}; }
  .cssgrid {
    grid-template-columns: repeat(3, 70px); grid-template-rows: repeat(2, 70px); gap:12px; padding:24px;
  }
  .cssgrid div { border-radius:14px; background: color-mix(in srgb, ${accent} 45%, #0f172a); border:1px solid color-mix(in srgb, ${accent} 70%, transparent); }
  .cssgrid .wide { grid-column: span 2; }
  .canvas svg { width: 82%; height: auto; }
  .http { gap: 16px; }
  .pkt { padding:16px 20px; border-radius:14px; background:rgba(0,0,0,.28); border:1px solid rgba(255,255,255,.1); font-family:ui-monospace,monospace; }
  .pkt.req { color:#fde68a; } .pkt.res { color:${accent}; }
  .arrow { font-size:28px; color:#94a3b8; }
  .lens {
    width:140px; height:140px; border-radius:50%; border:8px solid ${accent};
    box-shadow: 28px 28px 0 rgba(0,0,0,.2); position:relative;
  }
  .bugmark { position:absolute; font-size:48px; transform: translate(18px, -10px); }
  .stack {
    position:absolute; bottom:70px; left:70px; right:40px; padding:12px 14px;
    border-radius:12px; background:rgba(0,0,0,.35); font-family:ui-monospace,monospace; font-size:14px; color:#fecaca;
  }
  .bubble {
    width:100px; height:100px; border-radius:24px; display:grid; place-items:center;
    font-size:42px; font-weight:800; margin: 10px;
  }
  .bubble.q { background:#1f2937; border:2px solid #fcd34d; color:#fcd34d; transform: translate(-28px, -20px); }
  .bubble.a { background: color-mix(in srgb, ${accent} 25%, #0f172a); border:2px solid ${accent}; color:${accent}; transform: translate(28px, 20px); }
  .bezel {
    width:132px; height:240px; border-radius:28px; border:4px solid #cbd5e1; background:#020617;
    padding:12px; position:relative;
  }
  .notch { width:48px; height:8px; border-radius:8px; background:#334155; margin: 0 auto 10px; }
  .screen { height: calc(100% - 18px); border-radius:16px; background: linear-gradient(180deg, color-mix(in srgb, ${accent} 35%, #0f172a), #0f172a); }
  .form { width:70%; gap:14px; align-content:center; }
  .field { height:36px; border-radius:10px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); }
  .field.short { width:60%; }
  .btn { margin-top:6px; height:40px; border-radius:12px; display:grid; place-items:center; background:${accent}; color:#0f172a; font-weight:700; }
  .player {
    width:180px; height:120px; border-radius:18px; background:rgba(0,0,0,.35);
    border:1px solid rgba(255,255,255,.12); display:grid; place-items:center;
  }
  .play { font-size:36px; color:${accent}; }
  .wave { width:180px; height:18px; margin-top:16px; border-radius:999px; background: linear-gradient(90deg, transparent, ${accent}, transparent); opacity:.7; }
  .files { align-content:center; justify-items:start; padding:40px; gap:12px; }
  .folder, .file { padding:12px 16px; border-radius:12px; background:rgba(0,0,0,.28); border:1px solid rgba(255,255,255,.1); font-size:18px; }
  .file { margin-left:24px; opacity:.85; }
  .rocket { font-size:72px; filter: drop-shadow(0 12px 24px rgba(0,0,0,.35)); }
  .trail { width:8px; height:90px; margin-top:8px; border-radius:8px; background: linear-gradient(${accent}, transparent); }
  .health svg { width: 80%; }
  .radar { position:relative; width:200px; height:200px; }
  .ring { position:absolute; inset:0; border-radius:50%; border:2px solid color-mix(in srgb, ${accent} 45%, transparent); }
  .ring.r2 { inset:22px; } .ring.r3 { inset:44px; }
  .sweep {
    position:absolute; inset:10px; border-radius:50%;
    background: conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, ${accent} 55%, transparent) 50deg, transparent 70deg);
    opacity:.7;
  }
  .ws { width:70%; }
  .pipe { width:100%; height:10px; border-radius:999px; background:rgba(255,255,255,.12); position:relative; }
  .dot { position:absolute; width:16px; height:16px; border-radius:50%; background:${accent}; top:50%; transform:translateY(-50%); }
  .d1{ left:12%; } .d2{ left:48%; } .d3{ left:78%; }
  .lab { gap: 12px; }
  .beaker { font-size:72px; }
  .dots i { display:inline-block; width:12px; height:12px; margin:0 5px; border-radius:50%; background:${accent}; opacity:.8; }
</style>
</head>
<body>
  <div class="noise"></div>
  ${bodyInner}
  <div class="foot">lilnong.top · ${escapeHtml(ctx.collection === "demo" ? "项目" : "博客")}</div>
</body>
</html>`;
}

async function startStaticServer(dir) {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let filePath = path.join(dir, urlPath.replace(/^\//, ""));
      if (filePath.endsWith("/")) filePath = path.join(filePath, "index.html");
      if (!filePath.startsWith(dir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".gif": "image/gif",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
      };
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function mapPool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function renderIllustration(page, ctx, outPath) {
  const html = buildIllustrationHtml(ctx);
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  const buf = await page.screenshot({ type: "png" });
  await sharp(buf).webp({ quality: 82 }).toFile(`${outPath}.tmp`);
  fs.renameSync(`${outPath}.tmp`, outPath);
}

async function isInterestingScreenshot(pngBuf) {
  const stats = await sharp(pngBuf).stats();
  const channels = stats.channels || [];
  if (!channels.length) return false;
  const mean =
    channels.slice(0, 3).reduce((s, c) => s + (c.mean || 0), 0) / Math.min(3, channels.length);
  const stdev =
    channels.slice(0, 3).reduce((s, c) => s + (c.stdev || 0), 0) / Math.min(3, channels.length);
  // Too blank/white or too uniform → fall back to illustration.
  if (mean > 245 && stdev < 12) return false;
  if (stdev < 8) return false;
  if (mean > 235 && stdev < 22) return false;
  return true;
}

async function renderDemoScreenshot(page, origin, demoUrl, outPath, ctx) {
  const url = `${origin}${demoUrl.startsWith("/") ? demoUrl : `/${demoUrl}`}`;
  await page.setViewport({
    width: W,
    height: H,
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  });

  // Do not close the page on timeout — that wedges Chromium CDP. Outer caller relaunches.
  const hardLimitMs = 6000;
  let timer;
  try {
    await Promise.race([
      (async () => {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 3000 });
        } catch {
          throw new Error("goto failed");
        }
        await page
          .addStyleTag({
            content: `
              #__vconsole, .vc-switch, .vc-mask, .vc-panel { display:none !important; }
              body { overflow:hidden !important; }
            `,
          })
          .catch(() => {});
        await new Promise((r) => setTimeout(r, 80));
        const shot = await page.screenshot({ type: "png", captureBeyondViewport: false });
        if (!(await isInterestingScreenshot(shot))) {
          throw new Error("screenshot too blank/uniform");
        }

        const title = escapeHtml((ctx.title || ctx.slug).slice(0, 36));
        const label = escapeHtml(ctx.badge || ctx.category || "Demo");
        const overlay = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="52%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.78"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="36" y="${H - 118}" width="${Math.min(240, 44 + [...label].length * 28)}" height="36" rx="10" fill="#0f766e" fill-opacity="0.9"/>
  <text x="50" y="${H - 93}" font-family="PingFang SC, sans-serif" font-size="18" font-weight="700" fill="#ecfeff">${label}</text>
  <text x="36" y="${H - 48}" font-family="PingFang SC, sans-serif" font-size="28" font-weight="750" fill="#f8fafc">${title}</text>
</svg>`);

        await sharp(shot)
          .composite([{ input: await sharp(overlay).png().toBuffer(), top: 0, left: 0 }])
          .webp({ quality: 80 })
          .toFile(`${outPath}.tmp`);
        fs.renameSync(`${outPath}.tmp`, outPath);
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("screenshot hard-timeout")), hardLimitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function resolveDemoPublicPath(demoUrl) {
  if (!demoUrl || /^https?:\/\//i.test(demoUrl)) return null;
  const rel = decodeURIComponent(demoUrl.replace(/^\//, ""));
  const full = path.join(publicDir, rel);
  return fs.existsSync(full) ? full : null;
}

async function processAll() {
  console.log(write ? "WRITE mode" : "DRY-RUN (pass --write to apply)");
  if (!write) {
    console.log("This mode will plan work only.");
  }

  const jobs = [];
  if (!only || only === "blog") {
    for (const file of listMd(blogDir)) {
      const slug = path.basename(file, ".md");
      const raw = fs.readFileSync(file, "utf8");
      const parts = splitFrontmatter(raw);
      if (!parts) continue;
      const fm = parts.fm;
      jobs.push({
        collection: "blog",
        file,
        slug,
        fm,
        body: parts.body,
        title: parseField(fm, "title") || slug,
        description: parseField(fm, "description"),
        kind: parseField(fm, "kind") || "article",
        tags: parseScalarList(fm, "tags"),
        badge: parseField(fm, "badge"),
        category: "",
        demoUrl: "",
      });
    }
  }
  if (!only || only === "demo") {
    for (const file of listMd(demosDir)) {
      const slug = path.basename(file, ".md");
      const raw = fs.readFileSync(file, "utf8");
      const parts = splitFrontmatter(raw);
      if (!parts) continue;
      const fm = parts.fm;
      jobs.push({
        collection: "demo",
        file,
        slug,
        fm,
        body: parts.body,
        title: parseField(fm, "title") || slug,
        description: parseField(fm, "description"),
        kind: "demo",
        tags: parseScalarList(fm, "tags"),
        badge: parseField(fm, "badge"),
        category: parseField(fm, "category"),
        demoUrl: parseField(fm, "demoUrl"),
      });
    }
  }

  if (slugFilter) {
    for (let i = jobs.length - 1; i >= 0; i--) {
      if (!slugFilter.has(jobs[i].slug)) jobs.splice(i, 1);
    }
  }

  const sliced = offset > 0 ? jobs.slice(offset) : jobs;
  const selected = limit > 0 ? sliced.slice(0, limit) : sliced;
  console.log(
    `jobs=${selected.length} offset=${offset} concurrency=${concurrency} screenshots=${wantScreenshots} slugFilter=${slugFilter ? slugFilter.size : 0}`,
  );

  if (!write) {
    const demoShot = selected.filter(
      (j) => j.collection === "demo" && resolveDemoPublicPath(j.demoUrl),
    ).length;
    const illus = selected.length - demoShot;
    console.log(`would screenshot demos≈${demoShot}, illustrate≈${illus}`);
    return;
  }

  fs.mkdirSync(path.join(heroRoot, "blog"), { recursive: true });
  fs.mkdirSync(path.join(heroRoot, "demo"), { recursive: true });

  const staticServer = await startStaticServer(publicDir);
  // Chrome 148 "new" headless hangs on Page.captureScreenshot; shell headless works.
  const launchOpts = {
    headless: "shell",
    protocolTimeout: 20000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--hide-scrollbars"],
  };
  let browser = await puppeteer.launch(launchOpts);

  let done = 0;
  let shotOk = 0;
  let illusOk = 0;
  let mdUpdated = 0;
  let failed = 0;

  async function relaunchBrowser() {
    await browser.close().catch(() => {});
    browser = await puppeteer.launch(launchOpts);
  }

  async function freshPage() {
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      page.setDefaultNavigationTimeout(5000);
      return page;
    } catch {
      await relaunchBrowser();
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      page.setDefaultNavigationTimeout(5000);
      return page;
    }
  }

  try {
    await mapPool(selected, concurrency, async (job) => {
      let page = await freshPage();
      const stem = safeFileStem(job.slug);
      const folder = job.collection === "blog" ? "blog" : "demo";
      const relPath = `/heroes/${folder}/${stem}.webp`;
      const absPath = path.join(heroRoot, folder, `${stem}.webp`);

      try {
        if (force || !fs.existsSync(absPath)) {
          const canShot =
            wantScreenshots &&
            job.collection === "demo" &&
            resolveDemoPublicPath(job.demoUrl);
          let made = false;
          if (canShot) {
            try {
              await renderDemoScreenshot(page, staticServer.origin, job.demoUrl, absPath, job);
              shotOk++;
              made = true;
            } catch {
              // CDP timeouts leave Chromium unhealthy — full relaunch before fallback.
              await page.close().catch(() => {});
              await relaunchBrowser();
              page = await freshPage();
            }
          }
          if (!made) {
            try {
              await renderIllustration(page, job, absPath);
              illusOk++;
            } catch {
              await page.close().catch(() => {});
              await relaunchBrowser();
              page = await freshPage();
              await renderIllustration(page, job, absPath);
              illusOk++;
            }
          }
        }

        const current = parseField(job.fm, "heroImage");
        if (current !== relPath) {
          const nextFm = upsertHeroImage(job.fm, relPath);
          fs.writeFileSync(
            job.file,
            `---\n${nextFm}\n---\n${job.body.startsWith("\n") ? job.body : `\n${job.body}`}`,
          );
          mdUpdated++;
        }
      } catch (err) {
        failed++;
        console.error(`\nfail ${job.slug}:`, err.message || err);
      } finally {
        await page.close().catch(() => {});
        done++;
        if (done % 25 === 0 || done === selected.length) {
          process.stdout.write(
            `\rprogress ${done}/${selected.length} shot=${shotOk} illus=${illusOk} md=${mdUpdated} fail=${failed}`,
          );
        }
      }
    });
    process.stdout.write("\n");
  } finally {
    await browser.close().catch(() => {});
    await staticServer.close();
  }

  console.log(
    JSON.stringify({ total: selected.length, shotOk, illusOk, mdUpdated, failed }, null, 2),
  );
}

processAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
