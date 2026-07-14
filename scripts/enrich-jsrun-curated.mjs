#!/usr/bin/env node
/**
 * Apply curated JSRUN enrichment (title/description/tags/body) to demo markdown.
 *
 *   node scripts/enrich-jsrun-curated.mjs
 *   node scripts/enrich-jsrun-curated.mjs --dry
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MD_DIR = path.join(ROOT, "apps/web/src/content/demos");
const ENRICH = path.join(ROOT, "scripts/data/jsrun/curated-enrichment.json");
const dry = process.argv.includes("--dry");

function yamlEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildBody(item) {
  const steps = (item.steps || []).map((s, i) => `${i + 1}. ${s}`).join("\n");
  const docs = (item.docs || [])
    .map((d) => `- [${d.label}](${d.url})`)
    .join("\n");
  const notes = item.notes
    ? `\n## 注意\n\n${item.notes}\n`
    : "";
  return `## 简介

${item.intro}

## 如何测试验证

${steps}
${docs ? `\n## 相关规范与文档\n\n${docs}\n` : ""}${notes}`;
}

function rebuildFrontmatter(existing, item) {
  const get = (key) => {
    const m = existing.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    return m?.[1];
  };
  const pubDate = get("pubDate")?.replace(/^"|"$/g, "") || "2019-01-01";
  const demoUrl = get("demoUrl")?.replace(/^"|"$/g, "");
  const legacyUrl = get("legacyUrl")?.replace(/^"|"$/g, "");
  const type = get("type")?.replace(/^"|"$/g, "") || "web";

  const baseTags = ["精选", "jsrun", "legacy"];
  // Prefer site-standard tags only (enrichment JSON should already be normalized)
  const ALLOWED = new Set([
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
    "实验",
  ]);
  const extra = (item.tags || []).filter((t) => ALLOWED.has(t) && !baseTags.includes(t));
  const tags = [...baseTags, ...extra];
  const tagLine = tags.map((t) => `"${yamlEscape(t)}"`).join(", ");

  // Avoid category=JSRUN (splits search tag cloud with lowercase jsrun)
  let category = get("category")?.replace(/^"|"$/g, "") || "实验";
  if (category === "JSRUN" || category === "jsrun") {
    category =
      extra.find((t) =>
        ["Vue", "React", "CSS", "图形", "交互", "表单", "算法", "游戏", "工具"].includes(t),
      ) || "实验";
  }

  return `---
title: "${yamlEscape(item.title)}"
description: "${yamlEscape(item.description)}"
pubDate: "${pubDate}"
type: ${type}
demoUrl: "${demoUrl}"
legacyUrl: "${legacyUrl}"
category: "${category}"
badge: "精选"
tags: [${tagLine}]
---

`;
}

function main() {
  const items = JSON.parse(fs.readFileSync(ENRICH, "utf8"));
  let updated = 0;
  for (const item of items) {
    const mdPath = path.join(MD_DIR, `${item.slug}.md`);
    if (!fs.existsSync(mdPath)) {
      console.warn("missing md", item.slug);
      continue;
    }
    const existing = fs.readFileSync(mdPath, "utf8");
    const next = rebuildFrontmatter(existing, item) + buildBody(item).trimEnd() + "\n";
    if (dry) {
      console.log(`[dry] ${item.slug} → ${item.title}`);
    } else {
      fs.writeFileSync(mdPath, next);
    }
    updated++;
  }
  console.log(`${dry ? "Would update" : "Updated"} ${updated}/${items.length} curated demos`);
}

main();
