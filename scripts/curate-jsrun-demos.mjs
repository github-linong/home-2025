#!/usr/bin/env node
/**
 * Score JSRUN-imported demos and pick curated / discard lists.
 *
 * Usage:
 *   node scripts/curate-jsrun-demos.mjs              # write reports under scripts/data/jsrun/
 *   node scripts/curate-jsrun-demos.mjs --apply       # update badges + curated-demos.ts section
 *   node scripts/curate-jsrun-demos.mjs --apply --prune  # also remove low-value md/html from site
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HTML_DIR = path.join(ROOT, "apps/web/public/demos/jsrun");
const MD_DIR = path.join(ROOT, "apps/web/src/content/demos");
const OUT_DIR = path.join(ROOT, "scripts/data/jsrun");
const CURATED_TS = path.join(ROOT, "apps/web/src/data/curated-demos.ts");

const args = {
  apply: process.argv.includes("--apply"),
  prune: process.argv.includes("--prune"),
  top: Number(process.argv.find((a, i) => process.argv[i - 1] === "--top") ?? 80),
};

const HANDPICKED_PATH = path.join(OUT_DIR, "curated-handpicked.json");

const JUNK_TITLE =
  /怕是个傻子|迷之设计|cesces|^a+$|ｘｓｓ|红包红包|抖音为爱而歌|1216174327|删除测试DEMO|删除测试replace|测试新的编辑器|aaa ssss|^http:\/\/renren|^http:\/\/c\.m\.163|^http:\/\/7xlzf0|^\.\.\.　　　超级VIP|我猜你打不开控制台|不系之舟/i;

const WEAK_TITLE =
  /^(测试|test|demo|transtion|transition|select|bootstrap|loading|prompt|hover测试|float测试|svg测试|hover|scroll测试|flex测试|table|input|svg圆|ng判断)/i;

const VALUE_TITLE =
  /刮奖|瀑布流|拖[拽拖]|排序|BFC|sticky|弹幕|轮播|大转盘|马赛克|水印|虚拟[化滚]|virtual|canvas|svg|echarts|three|地图|树[状形]|手风琴|穿梭|复制|clipboard|防抖|节流|throttle|debounce|flex|grid|动画|parallax|视差|扫雷|2048|进度条|二维码|qrcode|upload|上传|预览|cropper|截图|html2canvas|markdown|editor|拼图|红包|蝴蝶结|刘海|shape-outside|masonry|暗水印|AES|加密|rxjs|Provide|inject|keep-alive|递归|决策树|榜单|引导|intro\.js|driver\.js|聚焦|手表|时间轮盘|3[dD]|饼图|八卦|翻书|圆环|心生成|贫富差距|photo.*心|局部光照|局部翻译|quill|ckeditor|panzoom|陀螺仪|phaser|暗[水纹]|opencv|FABRIC|fabric|马赛克|exif|piexif|watermark|clipboard|FileReader|拖放|resizable|snake|蛇皮|雷达|gauge/i;

const SF_OR_ARTICLE = /segmentfault\.com|juejin\.(im|cn)|zhangxinxu\.com|cnblogs\.com|github\.com|developer\.mozilla|iviewui|element\.(eleme|me)|leafletjs|chartjs/i;

function substance(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const script = (html.match(/<script>([\s\S]*?)<\/script>/gi) || [])
    .join("\n")
    .replace(/<\/?script>/gi, "");
  const style = (html.match(/<style>([\s\S]*?)<\/style>/gi) || [])
    .join("\n")
    .replace(/<\/?style>/gi, "");
  return {
    bodyLen: body.length,
    scriptLen: script.length,
    styleLen: style.length,
    total: body.length + script.length + style.length,
    hasCanvas: /canvas|getContext\s*\(/i.test(html),
    hasVue: /new\s+Vue|createApp|vue\.js|vue\.min/i.test(html),
    hasInterestingApi:
      /requestAnimationFrame|IntersectionObserver|MutationObserver|FileReader|getUserMedia|localStorage|drag|DataTransfer|WebSocket|Worker|clipboard|MediaRecorder|deviceorientation|devicemotion/i.test(
        html,
      ),
  };
}

function scoreDemo({ title, html, dirName }) {
  const s = substance(html);
  let score = 0;
  const reasons = [];

  // Size / substance
  if (s.total >= 2500) {
    score += 35;
    reasons.push("substantial");
  } else if (s.total >= 1200) {
    score += 25;
    reasons.push("medium");
  } else if (s.total >= 500) {
    score += 12;
  } else if (s.total >= 200) {
    score += 4;
  } else {
    score -= 25;
    reasons.push("too-thin");
  }

  if (s.scriptLen >= 400) {
    score += 10;
    reasons.push("has-js");
  }
  if (s.styleLen >= 200) score += 4;
  if (s.hasCanvas) {
    score += 8;
    reasons.push("canvas");
  }
  if (s.hasVue) {
    score += 5;
    reasons.push("vue");
  }
  if (s.hasInterestingApi) {
    score += 10;
    reasons.push("modern-api");
  }

  // Title quality
  if (JUNK_TITLE.test(title)) {
    score -= 40;
    reasons.push("junk-title");
  }
  if (WEAK_TITLE.test(title) && s.total < 800) {
    score -= 12;
    reasons.push("weak-title");
  }
  if (VALUE_TITLE.test(title)) {
    score += 18;
    reasons.push("value-title");
  }
  if (SF_OR_ARTICLE.test(title)) {
    if (s.total >= 400) {
      score += 10;
      reasons.push("linked-article");
    } else {
      score -= 8;
      reasons.push("url-only");
    }
  }
  // Pure URL or empty-ish title
  if (/^https?:\/\//i.test(title) && title.length < 80 && s.total < 600) {
    score -= 15;
    reasons.push("bare-url");
  }
  if (/elementUI 覆盖|ng判断|Vue reder|vue watch测试|DOM刷新测试/i.test(title) && s.total < 900) {
    score -= 10;
  }

  // Prefer complete interactive toys / teaching demos over one-off bug pads
  if (/demo|详解|实现|指南|练习|游戏|小程序|组件/i.test(title) && s.total >= 600) {
    score += 6;
  }

  return { score, reasons, ...s };
}

function readTitle(mdPath, fallback) {
  if (!fs.existsSync(mdPath)) return fallback;
  const m = fs.readFileSync(mdPath, "utf8").match(/^title:\s*"([^"]+)"/m);
  return m?.[1] ?? fallback;
}

function main() {
  const files = fs.readdirSync(HTML_DIR).filter((f) => f.endsWith(".html")).sort();
  const rows = [];

  for (const file of files) {
    const dirName = file.replace(/\.html$/, "");
    const contentSlug = `jsrun-${dirName}`;
    const html = fs.readFileSync(path.join(HTML_DIR, file), "utf8");
    const title = readTitle(path.join(MD_DIR, `${contentSlug}.md`), dirName);
    const scored = scoreDemo({ title, html, dirName });
    rows.push({
      file,
      dirName,
      contentSlug,
      title,
      demoUrl: `/demos/jsrun/${file}`,
      ...scored,
    });
  }

  rows.sort((a, b) => b.score - a.score || b.total - a.total);
  const bySlug = new Map(rows.map((r) => [r.contentSlug, r]));

  /** Prefer explicit hand-picked list (deduped, reviewable). Fall back to scoring. */
  let curated = [];
  if (fs.existsSync(HANDPICKED_PATH)) {
    const hand = JSON.parse(fs.readFileSync(HANDPICKED_PATH, "utf8"));
    for (const slug of hand) {
      const hit = bySlug.get(slug);
      if (hit) curated.push(hit);
      else console.warn(`handpicked missing: ${slug}`);
    }
    console.log(`Using handpicked list: ${curated.length}/${hand.length}`);
  } else {
    const seenBuckets = new Map();
    const bucketOf = (r) => {
      const t = r.title.toLowerCase();
      if (/刮奖|scratch/i.test(t)) return "scratch";
      if (/弹幕|barrage/i.test(t)) return "barrage";
      if (/瀑布|masonry|column/i.test(t)) return "waterfall";
      if (/拖|sort|draggable|sortable/i.test(t)) return "dnd";
      if (/canvas|马赛克|截图|cropper|watermark|水印/i.test(t)) return "canvas";
      if (/echarts|chart|three|3d|地图|树/i.test(t)) return "viz";
      if (/flex|grid|bfc|sticky|布局/i.test(t)) return "layout";
      if (/vue|element|keep-alive/i.test(t)) return "vue";
      if (/动画|animation|transition|parallax|倒计时|进度/i.test(t)) return "motion";
      if (/upload|file|clipboard|copy|防抖|节流/i.test(t)) return "util";
      if (/game|转盘|扫雷|2048|拼图/i.test(t)) return "game";
      return "other";
    };

    for (const r of rows) {
      if (r.score < 28) continue;
      if (r.reasons.includes("junk-title")) continue;
      if (r.total < 350) continue;
      const b = bucketOf(r);
      const n = seenBuckets.get(b) ?? 0;
      const cap = b === "other" ? 25 : b === "vue" ? 10 : 6;
      if (n >= cap) continue;
      seenBuckets.set(b, n + 1);
      curated.push(r);
      if (curated.length >= args.top) break;
    }
  }
  curated = [...curated].sort((a, b) => b.score - a.score);

  const curatedSlugs = new Set(curated.map((c) => c.contentSlug));
  const prune = rows.filter(
    (r) =>
      !curatedSlugs.has(r.contentSlug) &&
      (r.score < 18 || r.reasons.includes("junk-title") || r.total < 200),
  );
  const archiveKeep = rows.filter(
    (r) => !curatedSlugs.has(r.contentSlug) && !prune.some((p) => p.contentSlug === r.contentSlug),
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      all: rows.length,
      curated: curated.length,
      archiveKeep: archiveKeep.length,
      prune: prune.length,
    },
    curated: curated.map((r) => ({
      contentSlug: r.contentSlug,
      title: r.title,
      score: r.score,
      total: r.total,
      demoUrl: r.demoUrl,
      reasons: r.reasons,
    })),
    pruneSample: prune.slice(0, 40).map((r) => ({
      contentSlug: r.contentSlug,
      title: r.title,
      score: r.score,
      total: r.total,
    })),
  };
  fs.writeFileSync(path.join(OUT_DIR, "curation-report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(OUT_DIR, "curated-slugs.json"),
    JSON.stringify(
      curated.map((c) => c.contentSlug),
      null,
      2,
    ),
  );

  console.log(
    `all=${rows.length} curated=${curated.length} archiveKeep=${archiveKeep.length} prune=${prune.length}`,
  );
  console.log("Top curated:");
  for (const r of curated.slice(0, 25)) {
    console.log(`  ${r.score}\t${r.contentSlug}\t${r.title.slice(0, 50)}`);
  }

  if (!args.apply) {
    console.log("\nDry report only. Re-run with --apply to update site curated list.");
    return;
  }

  // Update MD badges for curated
  for (const r of curated) {
    const mdPath = path.join(MD_DIR, `${r.contentSlug}.md`);
    if (!fs.existsSync(mdPath)) continue;
    let md = fs.readFileSync(mdPath, "utf8");
    md = md.replace(/badge: "JSRUN"/, 'badge: "精选"');
    // ensure curated-friendly tags
    if (!md.includes('"精选"') && md.includes("tags:")) {
      md = md.replace(/tags: \[/, 'tags: ["精选", ');
    }
    // Add 精选 tag if missing
    if (!/"精选"/.test(md.match(/^tags:.*$/m)?.[0] ?? "")) {
      md = md.replace(/^tags: \[(.*)\]$/m, (m0, inner) => {
        if (inner.includes('"精选"')) return m0;
        return `tags: ["精选", ${inner}]`;
      });
    }
    fs.writeFileSync(mdPath, md);
  }

  // Patch curated-demos.ts — replace or insert jsrun section
  let ts = fs.readFileSync(CURATED_TS, "utf8");
  const section = `  {
    id: "jsrun",
    title: "JSRUN 精选实验",
    description: "从历史 JSRUN 片段中筛出的可演示、可学习样例：交互、Canvas、布局与小工具。",
    slugs: [
${curated.map((c) => `      "${c.contentSlug}",`).join("\n")}
    ],
  },
`;

  if (ts.includes('id: "jsrun"')) {
    ts = ts.replace(
      /\n  \{\n    id: "jsrun",[\s\S]*?\n  \},/,
      `\n${section}`,
    );
  } else {
    // Insert before closing of CURATED_DEMO_SECTIONS array (before whole-site or at end before ];)
    ts = ts.replace(
      /\n  \{\n    id: "whole-site",/,
      `\n${section}  {\n    id: "whole-site",`,
    );
    if (!ts.includes('id: "jsrun"')) {
      ts = ts.replace(
        /export const CURATED_DEMO_SECTIONS: CuratedSection\[\] = \[\n/,
        `export const CURATED_DEMO_SECTIONS: CuratedSection[] = [\n${section}`,
      );
    }
  }
  fs.writeFileSync(CURATED_TS, ts);

  if (args.prune) {
    let removed = 0;
    for (const r of prune) {
      const mdPath = path.join(MD_DIR, `${r.contentSlug}.md`);
      const htmlPath = path.join(HTML_DIR, r.file);
      if (fs.existsSync(mdPath)) {
        fs.unlinkSync(mdPath);
        removed++;
      }
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
    }
    console.log(`Pruned ${removed} low-value entries from site (raw remain in scripts/data/jsrun/snippets).`);
  }

  console.log(`Applied: curated ${curated.length} → curated-demos.ts + badges`);
}

main();
