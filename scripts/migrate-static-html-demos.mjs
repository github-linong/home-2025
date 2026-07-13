#!/usr/bin/env node
/**
 * Migrate legacy static/html demos into apps/web/public/demos/html/
 * and update the manifest at apps/web/src/data/static-html-demos.json
 *
 * Usage:
 *   node scripts/migrate-static-html-demos.mjs              # migrate all (alphabetical)
 *   node scripts/migrate-static-html-demos.mjs --limit 10   # next 10 pending
 *   node scripts/migrate-static-html-demos.mjs --file foo.html
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_SOURCE =
  process.env.STATIC_HTML_SOURCE ??
  '/tmp/home-2023-inspect/123.56.16.33/lilnong/static/html';

const TARGET_DIR = path.join(ROOT, 'apps/web/public/demos/html');
const MANIFEST_PATH = path.join(ROOT, 'apps/web/src/data/static-html-demos.json');
const INVENTORY_PATH = '/tmp/static-html-inventory.json';

function parseArgs(argv) {
  const args = { limit: Infinity, file: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i]);
    else if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

function loadInventory() {
  if (!fs.existsSync(INVENTORY_PATH)) return new Map();
  const rows = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  return new Map(rows.map((r) => [r.file, r]));
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (m?.[1]?.trim()) return m[1].trim().replace(/\s*-\s*www\.lilnong\.top\s*$/i, '');
  const h1 = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
  if (h1?.[1]?.trim()) return h1[1].trim();
  return '';
}

function extractDescription(html, inventoryRow) {
  if (inventoryRow?.desc) return inventoryRow.desc;
  if (inventoryRow?.snippet) return inventoryRow.snippet.slice(0, 160);
  const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  if (meta?.[1]?.trim()) return meta[1].trim();
  return '';
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { version: 1, migratedAt: null, demos: [] };
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function saveManifest(manifest) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  manifest.migratedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

function slugFromFile(file) {
  return file.replace(/\.html$/i, '');
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(DEFAULT_SOURCE)) {
    console.error(`Source not found: ${DEFAULT_SOURCE}`);
    console.error('Set STATIC_HTML_SOURCE or clone home-2023 to /tmp/home-2023-inspect');
    process.exit(1);
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });

  const inventory = loadInventory();
  const manifest = loadManifest();
  const migrated = new Set(manifest.demos.map((d) => d.file));

  let files = fs
    .readdirSync(DEFAULT_SOURCE)
    .filter((f) => f.endsWith('.html'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (args.file) {
    files = files.filter((f) => f === args.file);
    if (files.length === 0) {
      console.error(`File not found in source: ${args.file}`);
      process.exit(1);
    }
  } else {
    files = files.filter((f) => !migrated.has(f));
  }

  let count = 0;
  for (const file of files) {
    if (count >= args.limit) break;

    const src = path.join(DEFAULT_SOURCE, file);
    const dest = path.join(TARGET_DIR, file);
    const html = fs.readFileSync(src, 'utf8');
    const stat = fs.statSync(src);
    const inv = inventory.get(file);
    const title = extractTitle(html) || inv?.title || file;
    const description =
      extractDescription(html, inv) || `Legacy demo migrated from /static/html/${file}`;

    if (!args.dryRun) {
      fs.copyFileSync(src, dest);
      const entry = {
        file,
        slug: slugFromFile(file),
        title,
        description,
        url: `/demos/html/${file}`,
        size: stat.size,
        migratedAt: new Date().toISOString(),
      };
      const idx = manifest.demos.findIndex((d) => d.file === file);
      if (idx >= 0) manifest.demos[idx] = entry;
      else manifest.demos.push(entry);
      manifest.demos.sort((a, b) => a.file.localeCompare(b.file, 'en'));
    }

    console.log(`[${count + 1}] ${file} → /demos/html/${file}`);
    count++;
  }

  if (!args.dryRun && count > 0) saveManifest(manifest);

  const total = manifest.demos.length;
  const sourceTotal = fs
    .readdirSync(DEFAULT_SOURCE)
    .filter((f) => f.endsWith('.html')).length;

  console.log(`\nDone: ${count} this run, ${total}/${sourceTotal} total in manifest`);
}

main();
