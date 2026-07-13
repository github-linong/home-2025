/**
 * Rewrite demo md frontmatter + static-html-demos.json titles when they use
 * polluted HTML <title> or need series disambiguation via FILENAME_TITLES.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEMOS_DIR = path.join(ROOT, 'apps/web/src/content/demos');
const HTML_DIR = path.join(ROOT, 'apps/web/public/demos/html');
const MANIFEST_PATH = path.join(ROOT, 'apps/web/src/data/static-html-demos.json');

const genSrc = fs.readFileSync(path.join(__dirname, 'generate-legacy-demo-entries.mjs'), 'utf8');

function extractObjectLiteral(src, name) {
  const startRe = new RegExp(`const ${name} = \\{`);
  const m = startRe.exec(src);
  if (!m) throw new Error(`Cannot find ${name}`);
  let i = m.index + m[0].length - 1;
  let depth = 0;
  const start = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const lit = src.slice(start, i + 1);
        return new Function(`return (${lit})`)();
      }
    }
  }
  throw new Error(`Unclosed ${name}`);
}

function extractBadSet(src) {
  const m = /const BAD_TEMPLATE_TITLES = new Set\(\[([\s\S]*?)\]\);/.exec(src);
  if (!m) throw new Error('BAD_TEMPLATE_TITLES not found');
  return new Set(new Function(`return [${m[1]}]`)());
}

const FILENAME_TITLES = extractObjectLiteral(genSrc, 'FILENAME_TITLES');
const FILENAME_DESCRIPTIONS = extractObjectLiteral(genSrc, 'FILENAME_DESCRIPTIONS');
const BAD_TEMPLATE_TITLES = extractBadSet(genSrc);

function cleanTitle(raw) {
  if (!raw) return '';
  return raw
    .replace(/\s*-\s*www\.lilnong\.top\s*$/i, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBadTitle(title, file) {
  if (!title) return true;
  if (title === file || title === file.replace(/\.html$/i, '')) return true;
  if (/^\d{10,}\.html$/i.test(title)) return true;
  if (BAD_TEMPLATE_TITLES.has(title)) return true;
  if (title.length > 120) return true;
  return false;
}

function humanizeFilename(file) {
  if (FILENAME_TITLES[file]) return FILENAME_TITLES[file];
  let name = file.replace(/\.html$/i, '');
  name = name.replace(/^sf-a-\d+-/, '');
  name = name.replace(/^sf-q-\d+-/, '');
  name = name.replace(/^sf-article-\d+-/, '');
  name = name.replace(/^sf-article-/, '');
  name = name.replace(/^\d{10,}-?/, '');
  name = name.replace(/^test-/, '');
  name = name.replace(/-/g, ' ');
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return name.slice(0, 80);
}

function resolveTitle(file, htmlTitle) {
  if (FILENAME_TITLES[file]) return FILENAME_TITLES[file];
  const cleaned = cleanTitle(htmlTitle);
  if (!isBadTitle(cleaned, file)) return cleaned;
  return humanizeFilename(file);
}

function resolveDescription(file, title, category = '实验') {
  if (FILENAME_DESCRIPTIONS[file]) return FILENAME_DESCRIPTIONS[file];
  return `${category}交互示例：${title}。`;
}

function patchFrontmatter(md, title, description) {
  let out = md;
  out = out.replace(/^title:\s*.*$/m, `title: ${JSON.stringify(title)}`);
  out = out.replace(/^description:\s*.*$/m, `description: ${JSON.stringify(description)}`);
  return out;
}

function main() {
  const dry = process.argv.includes('--dry-run');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  let mdChanged = 0;
  let jsonChanged = 0;

  for (const demo of manifest.demos) {
    const { file } = demo;
    const slug = file.replace(/\.html$/i, '');
    const mdPath = path.join(DEMOS_DIR, `${slug}.md`);
    const htmlPath = path.join(HTML_DIR, file);
    const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
    const htmlTitleM = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const htmlTitle = htmlTitleM?.[1] ?? '';
    const newTitle = resolveTitle(file, htmlTitle);

    const shouldUpdate =
      Boolean(FILENAME_TITLES[file]) ||
      isBadTitle(cleanTitle(demo.title || ''), file) ||
      isBadTitle(cleanTitle(htmlTitle), file);

    if (!shouldUpdate) continue;

    const newDesc = FILENAME_DESCRIPTIONS[file] || `Legacy demo: ${newTitle}`;
    if (demo.title !== newTitle || demo.description !== newDesc) {
      demo.title = newTitle;
      demo.description = newDesc;
      jsonChanged++;
    }

    if (fs.existsSync(mdPath)) {
      const md = fs.readFileSync(mdPath, 'utf8');
      const catM = md.match(/^category:\s*(.*)$/m);
      let category = catM?.[1]?.trim() || '实验';
      if (
        (category.startsWith('"') && category.endsWith('"')) ||
        (category.startsWith("'") && category.endsWith("'"))
      ) {
        category = category.slice(1, -1);
      }
      const desc = resolveDescription(file, newTitle, category);
      const next = patchFrontmatter(md, newTitle, desc);
      if (next !== md) {
        if (!dry) fs.writeFileSync(mdPath, next);
        mdChanged++;
      }
    }
  }

  if (!dry) {
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(
    `${dry ? '[dry-run] ' : ''}updated md=${mdChanged} jsonEntries=${jsonChanged}`,
  );
}

main();
