#!/usr/bin/env node
/**
 * Generate demo hero images via local DashScope image API, then crop to 1200x675 webp.
 *
 * Usage:
 *   node scripts/ai-demo-heroes.mjs --write --slugs=ai-image-gen,avatar-pointing
 *   node scripts/ai-demo-heroes.mjs --write --slugs-file=/tmp/slugs.txt --force
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webRoot = path.join(root, "apps/web");
const demosDir = path.join(webRoot, "src/content/demos");
const heroDir = path.join(webRoot, "public/heroes/demo");

const write = process.argv.includes("--write");
const force = process.argv.includes("--force");
const apiBase = (
  process.argv.find((a) => a.startsWith("--api="))?.slice(6) || "http://127.0.0.1:3002"
).replace(/\/+$/, "");
const model =
  process.argv.find((a) => a.startsWith("--model="))?.slice(8) || "z-image-turbo";
const size = process.argv.find((a) => a.startsWith("--size="))?.slice(7) || "1280*720";

const slugArg = process.argv.find((a) => a.startsWith("--slugs="))?.slice(8);
const slugFile = process.argv.find((a) => a.startsWith("--slugs-file="))?.slice(13);
const slugs = new Set(
  [
    ...(slugArg ? slugArg.split(",") : []),
    ...(slugFile
      ? fs.readFileSync(slugFile, "utf8").split(/\r?\n/)
      : []),
  ]
    .map((s) => s.trim())
    .filter(Boolean),
);

const require = createRequire(path.join(webRoot, "package.json"));
const sharp = require("sharp");

const PROMPTS = {
  "ai-image-gen":
    "Website product hero banner 16:9, modern AI image generation studio UI mockup, dark slate desk, glowing prompt panel and colorful generated art samples floating on a large monitor, soft neon cyan and amber accents, clean tech product photography, no readable text, no watermark, no logo",
  "avatar-pointing":
    "Website product hero banner 16:9, realistic 3D digital human avatar pointing toward a glowing target marker on a dark stage, soft studio lighting, cinematic tech demo look, subtle UI reticles, no readable text, no watermark",
  "livelihood-dashboard-guide":
    "Website product hero banner 16:9, futuristic civic data dashboard with translucent charts for population employment health education, a friendly 3D digital human presenter standing beside highlighted panels, dark blue teal glassmorphism, cinematic lighting, no readable text, no watermark",
};

function parseField(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?`, "m"));
  return m ? m[1].trim() : "";
}

function splitFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  return { fm: m[1], body: m[2] };
}

function upsertHeroImage(fm, relPath) {
  if (/^heroImage:/m.test(fm)) {
    return fm.replace(/^heroImage:.*$/m, `heroImage: "${relPath}"`);
  }
  const lines = fm.split("\n");
  const titleIdx = lines.findIndex((l) => /^title:/.test(l));
  const insertAt = titleIdx >= 0 ? titleIdx + 1 : 0;
  lines.splice(insertAt, 0, `heroImage: "${relPath}"`);
  return lines.join("\n");
}

async function generateImage(prompt) {
  const res = await fetch(`${apiBase}/api/demo/image`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt,
      model,
      size,
      prompt_extend: true,
    }),
  });
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 300) || `HTTP ${res.status}`);
  }
  // Local image API proxies PNG bytes directly.
  if (contentType.includes("image/")) {
    return { kind: "bytes", buf: Buffer.from(await res.arrayBuffer()) };
  }
  const data = await res.json().catch(() => ({}));
  if (data.ok === false) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  const url =
    data.images?.[0]?.url ||
    data.output?.results?.[0]?.url ||
    data.result?.url ||
    data.url;
  if (!url || typeof url !== "string") {
    throw new Error(`unexpected image response: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return { kind: "url", url };
}

async function downloadToWebp(source, outPath) {
  let buf;
  if (source.kind === "bytes") {
    buf = source.buf;
  } else {
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`download failed ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  await sharp(buf)
    .resize(1200, 675, { fit: "cover", position: "centre" })
    .webp({ quality: 84 })
    .toFile(`${outPath}.tmp`);
  fs.renameSync(`${outPath}.tmp`, outPath);
}

async function main() {
  if (!slugs.size) {
    console.error("Pass --slugs=a,b or --slugs-file=...");
    process.exit(1);
  }
  console.log(
    `${write ? "WRITE" : "DRY-RUN"} api=${apiBase} model=${model} size=${size} slugs=${[...slugs].join(",")}`,
  );
  fs.mkdirSync(heroDir, { recursive: true });

  for (const slug of slugs) {
    const mdPath = path.join(demosDir, `${slug}.md`);
    if (!fs.existsSync(mdPath)) {
      console.error(`skip missing md: ${slug}`);
      continue;
    }
    const raw = fs.readFileSync(mdPath, "utf8");
    const parts = splitFrontmatter(raw);
    if (!parts) {
      console.error(`skip bad frontmatter: ${slug}`);
      continue;
    }
    const title = parseField(parts.fm, "title") || slug;
    const description = parseField(parts.fm, "description");
    const prompt =
      PROMPTS[slug] ||
      `Website product hero banner 16:9 for a web demo titled "${title}". ${description}. Cinematic tech product shot, rich detail, no readable text, no watermark.`;
    const relPath = `/heroes/demo/${slug}.webp`;
    const absPath = path.join(heroDir, `${slug}.webp`);

    if (!force && fs.existsSync(absPath)) {
      console.log(`exists ${slug}`);
      continue;
    }
    if (!write) {
      console.log(`would generate ${slug}: ${prompt.slice(0, 120)}...`);
      continue;
    }

    try {
      console.log(`generating ${slug}...`);
      const source = await generateImage(prompt);
      await downloadToWebp(source, absPath);
      const nextFm = upsertHeroImage(parts.fm, relPath);
      fs.writeFileSync(
        mdPath,
        `---\n${nextFm}\n---\n${parts.body.startsWith("\n") ? parts.body : `\n${parts.body}`}`,
      );
      console.log(`ok ${slug}`);
    } catch (err) {
      console.error(`fail ${slug}:`, err.message || err);
    }
  }
}

main();
