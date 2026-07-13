#!/usr/bin/env node
/**
 * Migrate theme-only HTML demos (present in lilnong/theme but not static/html)
 * into apps/web/public/demos/theme/ + content/demos/*.md
 *
 * Large media (>5MB) is skipped in the local copy; pass --upload-media to push
 * those files to OSS under static/theme/ and rewrite HTML references.
 *
 * Usage:
 *   node scripts/migrate-theme-demos.mjs
 *   node scripts/migrate-theme-demos.mjs --dry-run
 *   node scripts/migrate-theme-demos.mjs --upload-media
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_SOURCE =
  process.env.THEME_SOURCE ??
  '/tmp/home-2023-inspect/123.56.16.33/lilnong/theme';
const STATIC_HTML =
  process.env.STATIC_HTML_SOURCE ??
  '/tmp/home-2023-inspect/123.56.16.33/lilnong/static/html';

const TARGET_DIR = path.join(ROOT, 'apps/web/public/demos/theme');
const DEMOS_MD_DIR = path.join(ROOT, 'apps/web/src/content/demos');
const MANIFEST_PATH = path.join(ROOT, 'apps/web/src/data/theme-demos.json');

const LARGE_BYTES = 5 * 1024 * 1024;
const LARGE_MEDIA_RE = /\.(mp4|mka|mp3|mov|webm)$/i;

function parseArgs(argv) {
  const args = { dryRun: false, uploadMedia: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--upload-media') args.uploadMedia = true;
  }
  return args;
}

function yamlQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function slugFromFile(file) {
  return file
    .replace(/\.html$/i, '')
    .replace(/\s+/g, '-')
    .replace(/\+/g, 'plus')
    .replace(/[^\w\u4e00-\u9fff._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractTitle(html, file) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (m?.[1]?.trim()) {
    return m[1].trim().replace(/\s*-\s*www\.lilnong\.top\s*$/i, '');
  }
  return slugFromFile(file).replace(/-/g, ' ');
}

function listHtmlBasenames(dir) {
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.html'))
      .map((f) => f),
  );
}

function copyDirFiltered(src, dest, { dryRun, skipLarge }) {
  const skippedLarge = [];
  function walk(rel = '') {
    const from = path.join(src, rel);
    const entries = fs.readdirSync(from, { withFileTypes: true });
    for (const ent of entries) {
      const childRel = path.join(rel, ent.name);
      const childFrom = path.join(src, childRel);
      const childTo = path.join(dest, childRel);
      if (ent.isDirectory()) {
        if (!dryRun) fs.mkdirSync(childTo, { recursive: true });
        walk(childRel);
        continue;
      }
      const stat = fs.statSync(childFrom);
      const isLarge =
        skipLarge && (stat.size > LARGE_BYTES || LARGE_MEDIA_RE.test(ent.name));
      if (isLarge && stat.size > LARGE_BYTES) {
        skippedLarge.push({ rel: childRel, size: stat.size });
        continue;
      }
      if (!dryRun) {
        fs.mkdirSync(path.dirname(childTo), { recursive: true });
        fs.copyFileSync(childFrom, childTo);
      }
    }
  }
  if (!dryRun) fs.mkdirSync(dest, { recursive: true });
  walk('');
  return skippedLarge;
}

function rewriteLargeMediaRefs(html, largeNames) {
  let out = html;
  for (const name of largeNames) {
    const base = path.basename(name);
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // src="./v1705221.mp4" or src="v1705221.mp4" → /static/theme/...
    const re = new RegExp(`(src|href)=(["'])(?:\\.\\/)?${esc}\\2`, 'gi');
    out = out.replace(re, `$1=$2/static/theme/${base}$2`);
  }
  return out;
}

function uploadLargeMedia(skippedLarge, sourceRoot) {
  const ossutil =
    process.env.OSSUTIL ||
    '/tmp/ossutil-bin/ossutil-v1.7.18-mac-arm64/ossutilmac64';
  const endpoint = process.env.OSS_ENDPOINT || 'oss-cn-beijing.aliyuncs.com';
  const bucket = process.env.OSS_BUCKET || 'hone-2023';
  const id = process.env.OSS_ACCESS_KEY_ID;
  const secret = process.env.OSS_ACCESS_KEY_SECRET;
  if (!id || !secret) {
    throw new Error('OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET required for --upload-media');
  }
  if (!fs.existsSync(ossutil)) {
    throw new Error(`ossutil not found: ${ossutil}`);
  }

  const config = path.join('/tmp', `ossutil-theme-${process.pid}.conf`);
  fs.writeFileSync(
    config,
    `[Credentials]\nlanguage=CH\nendpoint=https://${endpoint}\naccessKeyID=${id}\naccessKeySecret=${secret}\n`,
  );
  try {
    for (const item of skippedLarge) {
      const local = path.join(sourceRoot, item.rel);
      const remote = `oss://${bucket}/static/theme/${path.basename(item.rel)}`;
      console.log(`  upload ${item.rel} → ${remote}`);
      const r = spawnSync(
        ossutil,
        ['-c', config, 'cp', local, remote, '--force', '--meta', 'x-oss-object-acl:public-read'],
        { encoding: 'utf8' },
      );
      if (r.status !== 0) {
        console.error(r.stderr || r.stdout);
        throw new Error(`ossutil failed for ${item.rel}`);
      }
    }
  } finally {
    fs.unlinkSync(config);
  }
}

function inferCategory(file) {
  const f = file.toLowerCase();
  if (/video|jplayer|flv|audio|media/.test(f)) return '音视频';
  if (/ios|iphone|mobile|wx_|h5_/.test(f)) return '移动端';
  if (/font|inflate/.test(f)) return '图形';
  if (/pdf|markdown|summernote|echarts/.test(f)) return '工具';
  if (/input|autofocus|select|autocomplete/.test(f)) return '表单';
  return '实验';
}

function buildMarkdown({ file, slug, title, demoUrl }) {
  const category = inferCategory(file);
  const description = `早期 theme 目录实验页：${title}。自 home-2023 lilnong/theme 迁入。`;
  return [
    '---',
    `title: ${yamlQuote(title)}`,
    `description: ${yamlQuote(description)}`,
    'pubDate: "2018-06-01"',
    'type: web',
    `demoUrl: ${yamlQuote(demoUrl)}`,
    `legacyUrl: ${yamlQuote(`/theme/${file}`)}`,
    `category: ${yamlQuote(category)}`,
    'badge: "theme 补全"',
    `tags: ["legacy", "theme", ${yamlQuote(category)}]`,
    '---',
    '',
    '## 简介',
    '',
    description,
    '',
    '## 如何测试验证',
    '',
    '1. 打开演示页，确认页面可访问。',
    '2. 若依赖同目录脚本/样式，确认相对路径资源 200。',
    '3. 大媒体文件（mp4 等）走 `/static/theme/`（OSS）。',
    '',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(DEFAULT_SOURCE)) {
    console.error(`Theme source not found: ${DEFAULT_SOURCE}`);
    process.exit(1);
  }

  const staticHtml = listHtmlBasenames(STATIC_HTML);
  const themeHtml = fs
    .readdirSync(DEFAULT_SOURCE)
    .filter((f) => f.endsWith('.html'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  const themeOnly = themeHtml.filter((f) => !staticHtml.has(f));
  console.log(`theme html: ${themeHtml.length}, already in static/html: ${themeHtml.length - themeOnly.length}, to migrate: ${themeOnly.length}`);

  // Copy whole theme tree (minus large media) so relative assets resolve
  const skippedLarge = copyDirFiltered(DEFAULT_SOURCE, TARGET_DIR, {
    dryRun: args.dryRun,
    skipLarge: true,
  });
  console.log(`copied theme tree → ${TARGET_DIR} (skipped ${skippedLarge.length} large media)`);
  for (const s of skippedLarge) {
    console.log(`  skip ${(s.size / 1024 / 1024).toFixed(1)}MB ${s.rel}`);
  }

  if (args.uploadMedia && skippedLarge.length && !args.dryRun) {
    console.log('Uploading large media to OSS static/theme/ ...');
    uploadLargeMedia(skippedLarge, DEFAULT_SOURCE);
  }

  const largeNames = skippedLarge.map((s) => path.basename(s.rel));
  const demos = [];

  for (const file of themeOnly) {
    const src = path.join(DEFAULT_SOURCE, file);
    const dest = path.join(TARGET_DIR, file);
    let html = fs.readFileSync(src, 'utf8');
    if (largeNames.length) {
      html = rewriteLargeMediaRefs(html, largeNames);
    }
    const title = extractTitle(html, file);
    const slug = slugFromFile(file);
    // Avoid overwriting existing demos from static/html migration
    const mdPath = path.join(DEMOS_MD_DIR, `${slug}.md`);
    if (fs.existsSync(mdPath) && !fs.readFileSync(mdPath, 'utf8').includes('theme 补全')) {
      console.warn(`skip md (exists): ${slug}.md`);
      continue;
    }
    const demoUrl = `/demos/theme/${file}`;

    if (!args.dryRun) {
      fs.mkdirSync(TARGET_DIR, { recursive: true });
      fs.writeFileSync(dest, html);
      fs.mkdirSync(DEMOS_MD_DIR, { recursive: true });
      fs.writeFileSync(
        mdPath,
        buildMarkdown({ file, slug, title, demoUrl }),
      );
    }

    demos.push({
      file,
      slug,
      title,
      url: `/demos/theme/${file}`,
      legacyUrl: `/theme/${file}`,
      size: fs.statSync(src).size,
    });
    console.log(`[md] ${slug} ← ${file}`);
  }

  if (!args.dryRun) {
    fs.writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(
        {
          version: 1,
          source: 'lilnong/theme',
          migratedAt: new Date().toISOString(),
          largeMediaOnOss: largeNames,
          demos,
        },
        null,
        2,
      ) + '\n',
    );
  }

  console.log(`\nDone: ${demos.length} theme-only demos`);
  if (skippedLarge.length && !args.uploadMedia) {
    console.log('Tip: re-run with --upload-media to push large media to OSS static/theme/');
  }
}

main();
