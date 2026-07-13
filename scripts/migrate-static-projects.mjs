/**
 * Migrate home-2023 static/project/* into the personal site.
 *
 * - Copies assets → apps/web/public/demos/project/<name>/
 * - Optionally copies static/pdf samples used by pdf.js demos
 * - Writes demos content entries (markdown) for the projects gallery
 *
 * Usage:
 *   node scripts/migrate-static-projects.mjs
 *   node scripts/migrate-static-projects.mjs --dry-run
 *   PROJECT_SRC=/path/to/static/project node scripts/migrate-static-projects.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PROJECT_SRC =
  process.env.PROJECT_SRC ||
  '/tmp/home-2023-inspect/123.56.16.33/lilnong/static/project';
const PDF_SRC =
  process.env.PDF_SRC ||
  '/tmp/home-2023-inspect/123.56.16.33/lilnong/static/pdf';

const PROJECT_DEST = path.join(ROOT, 'apps/web/public/demos/project');
const PDF_DEST = path.join(ROOT, 'apps/web/public/demos/pdf');
const DEMOS_DIR = path.join(ROOT, 'apps/web/src/content/demos');

/** @typedef {{ title: string, description: string, category: string, tags: string[], entry: string, relatedPosts?: string[], skip?: boolean }} ProjectMeta */

/** Curated metadata for whole-site demos. Keys = directory names under static/project. */
const PROJECT_META = /** @type {Record<string, ProjectMeta>} */ ({
  'pwa-20190625': {
    title: 'PWA 实验（2019）',
    description: 'Service Worker / 离线缓存与安装相关的 PWA 演示集合。',
    category: 'PWA',
    tags: ['project', 'PWA'],
    entry: 'index.5.html',
    relatedPosts: ['sf-1190000019581713'],
  },
  'pdfjs-es5-2.5.207': {
    title: 'PDF.js 阅读器（ES5）',
    description: '基于 PDF.js 的浏览器内 PDF 预览，默认可打开内置样例 PDF。',
    category: 'PDF',
    tags: ['project', 'PDF'],
    entry: 'web/viewer-1.html?file=compressed.tracemonkey-pldi-09.pdf',
    relatedPosts: ['sf-1190000040331855'],
  },
  'pdfjs-2.5.207': {
    title: 'PDF.js 阅读器',
    description: 'PDF.js 2.5 完整 viewer 构建。',
    category: 'PDF',
    tags: ['project', 'PDF'],
    entry: 'web/viewer.html?file=compressed.tracemonkey-pldi-09.pdf',
  },
  pdfjs: {
    title: 'PDF.js 示例包',
    description: '较早的 PDF.js 示例与 viewer snippet。',
    category: 'PDF',
    tags: ['project', 'PDF'],
    entry: 'web/viewer.html?file=compressed.tracemonkey-pldi-09.pdf',
  },
  'pdfh5-master': {
    title: 'pdfh5 移动端预览',
    description: '面向移动端的 PDF 翻页预览组件演示。',
    category: 'PDF',
    tags: ['project', 'PDF', '移动端'],
    entry: 'index.html',
  },
  dashboard: {
    title: '数据大屏 Dashboard',
    description: '多套可视化大屏静态页合集（015 等编号页面）。',
    category: '图形',
    tags: ['project', '图形', '数据可视化'],
    entry: '015/index.html',
  },
  'Emulatrix-master': {
    title: 'Emulatrix 模拟器',
    description: '浏览器端游戏机模拟器静态站。',
    category: '图形',
    tags: ['project', '图形'],
    entry: 'index.html',
  },
  'unlock-music-modern': {
    title: 'Unlock Music',
    description: '浏览器端音乐格式解锁 / 转换工具。',
    category: '音视频',
    tags: ['project', '音视频'],
    entry: 'index.html',
  },
  h5player: {
    title: 'H5 播放器',
    description: '基于 jPlayer 的 H5 音视频播放演示。',
    category: '音视频',
    tags: ['project', '音视频'],
    entry: 'demo.htm',
  },
  'cocos-vuecli-demo': {
    title: 'Cocos + Vue CLI Demo',
    description: 'Cocos 与 Vue CLI 结合的前端示例。',
    category: '图形',
    tags: ['project', '图形', 'Vue'],
    entry: 'index.html',
  },
  'cocos-physices-example': {
    title: 'Cocos 物理示例',
    description: 'Cocos 物理引擎示例工程构建产物。',
    category: '图形',
    tags: ['project', '图形'],
    entry: 'index.html',
  },
  'cocos-hellow-world': {
    title: 'Cocos Hello World',
    description: 'Cocos 入门 Hello World 构建产物。',
    category: '图形',
    tags: ['project', '图形'],
    entry: 'index.html',
  },
  'cocos-hello-world-2': {
    title: 'Cocos Hello World 2',
    description: 'Cocos Hello World 变体构建产物。',
    category: '图形',
    tags: ['project', '图形'],
    entry: 'index.html',
  },
  'cocos-hello-world-3': {
    title: 'Cocos Hello World 3',
    description: 'Cocos Hello World 变体构建产物。',
    category: '图形',
    tags: ['project', '图形'],
    entry: 'index.html',
  },
  'cocos-hello-world-4': {
    title: 'Cocos Hello World 4',
    description: 'Cocos Hello World 变体构建产物。',
    category: '图形',
    tags: ['project', '图形'],
    entry: 'index.html',
  },
  'PPTXjs-1.21.1': {
    title: 'PPTXjs 演示',
    description: '浏览器端 PPTX 预览库演示。',
    category: '文件 IO',
    tags: ['project', '文件 IO'],
    entry: 'index.html',
  },
  'vue-cli-build-axios': {
    title: 'Vue CLI + Axios Demo',
    description: 'Vue CLI 构建的 Axios 请求示例。',
    category: 'Vue',
    tags: ['project', 'Vue', 'HTTP'],
    entry: 'demo.html',
  },
  'sf-q-1010000019279951': {
    title: '思否问答配套项目',
    description: '思否问答相关静态演示工程。',
    category: 'SegmentFault',
    tags: ['project', 'SegmentFault', '博客配套'],
    entry: 'index.html',
  },
  'sf-q-1010000022530172': {
    title: '思否问答配套项目 2',
    description: '思否问答相关静态演示工程。',
    category: 'SegmentFault',
    tags: ['project', 'SegmentFault', '博客配套'],
    entry: 'index.html',
  },
  'phaser3-tutorial-src': {
    title: 'Phaser 3 Tutorial',
    description: 'Phaser 3 官方教程相关页面。',
    category: '图形',
    tags: ['project', '图形'],
    entry: 'part1.html',
  },
  'clip-image': {
    title: '图片裁剪上传',
    description: '图片裁剪 / 上传交互示例。',
    category: '文件 IO',
    tags: ['project', '文件 IO'],
    entry: 'upload_img.html',
  },
  'zhh-sign': {
    title: '签名板',
    description: 'Canvas 签名相关静态页。',
    category: '图形',
    tags: ['project', '图形'],
    entry: 'index.html',
  },
  // Client / dump folders — copy assets for legacy URLs, but skip gallery cards.
  'juejin-booklet': { title: '掘金小册抓取数据', description: '', category: '实验', tags: ['project'], entry: '', skip: true },
  'wyj-20190917': { title: 'wyj-20190917', description: '', category: '实验', tags: ['project'], entry: 'index.html', skip: true },
  'jgq-20220701': { title: 'jgq-20220701', description: '', category: '实验', tags: ['project'], entry: 'index.html', skip: true },
  'jgq-20220801': { title: 'jgq-20220801', description: '', category: '实验', tags: ['project'], entry: 'index.html', skip: true },
  'jgq-230107': { title: 'jgq-230107', description: '', category: '实验', tags: ['project'], entry: 'index.html', skip: true },
  'jgq-230107-0': { title: 'jgq-230107-0', description: '', category: '实验', tags: ['project'], entry: 'index.html', skip: true },
  'jgq-230107-1': { title: 'jgq-230107-1', description: '', category: '实验', tags: ['project'], entry: 'index.html', skip: true },
  'jgq-521000': { title: 'jgq-521000', description: '', category: '实验', tags: ['project'], entry: 'index.html', skip: true },
  'llu-20190615-dist': { title: 'llu-20190615', description: '', category: '实验', tags: ['project'], entry: 'index.html', skip: true },
  'lly-20190613': { title: 'lly-20190613', description: '', category: '实验', tags: ['project'], entry: 'wechat.html', skip: true },
  'lly-20190614': { title: 'lly-20190614', description: '', category: '实验', tags: ['project'], entry: '', skip: true },
  'ljp-20200520': { title: 'ljp-20200520', description: '', category: '实验', tags: ['project'], entry: '', skip: true },
  'xnn-20200520': { title: 'xnn-20200520', description: '', category: '实验', tags: ['project'], entry: '', skip: true },
  'www.jucloud.com': { title: 'jucloud 静态页', description: '', category: '实验', tags: ['project'], entry: 'init.html', skip: true },
});

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run'), assetsOnly: argv.includes('--assets-only'), metaOnly: argv.includes('--meta-only') };
}

function yamlQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function resolveEntry(dir, preferred) {
  const preferredPath = preferred ? preferred.split('?')[0] : '';
  if (preferredPath && fs.existsSync(path.join(dir, preferredPath))) return preferred;
  const candidates = [
    'index.html',
    'index.htm',
    'index.5.html',
    'demo.html',
    'demo.htm',
    'web/viewer-1.html',
    'web/viewer.html',
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(dir, c))) return c;
  }
  return '';
}

function buildMarkdown(entry) {
  const lines = [
    '---',
    `title: ${yamlQuote(entry.title)}`,
    `description: ${yamlQuote(entry.description)}`,
    `pubDate: ${yamlQuote(entry.pubDate)}`,
    'type: web',
    `demoUrl: ${yamlQuote(entry.demoUrl)}`,
    `legacyUrl: ${yamlQuote(entry.legacyUrl)}`,
    `category: ${yamlQuote(entry.category)}`,
    `badge: ${yamlQuote(entry.badge)}`,
    `tags: [${entry.tags.map(yamlQuote).join(', ')}]`,
  ];
  if (entry.relatedPosts?.length) {
    lines.push(`relatedPosts: [${entry.relatedPosts.map(yamlQuote).join(', ')}]`);
  }
  lines.push('---', '');
  lines.push('## 简介', '');
  lines.push(entry.description, '');
  lines.push('## 说明', '');
  lines.push(
    '这是从旧站 `static/project/` 迁入的整站级演示，静态资源位于 `/demos/project/`。旧路径 `/static/project/` 会重定向到新路径。',
    '',
  );
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(PROJECT_SRC)) {
    console.error(`Project source not found: ${PROJECT_SRC}`);
    process.exit(1);
  }

  const dirs = fs
    .readdirSync(PROJECT_SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  console.log(`Source: ${PROJECT_SRC}`);
  console.log(`Dest:   ${PROJECT_DEST}`);
  console.log(`Dirs:   ${dirs.length}`);

  if (!args.metaOnly) {
    if (!args.dryRun) fs.mkdirSync(PROJECT_DEST, { recursive: true });
    for (const name of dirs) {
      const src = path.join(PROJECT_SRC, name);
      const dest = path.join(PROJECT_DEST, name);
      console.log(`copy ${name}`);
      if (!args.dryRun) copyDir(src, dest);
    }

    if (fs.existsSync(PDF_SRC)) {
      console.log(`copy pdf samples → ${PDF_DEST}`);
      if (!args.dryRun) copyDir(PDF_SRC, PDF_DEST);
    } else {
      console.warn(`PDF source missing (skip): ${PDF_SRC}`);
    }
  }

  if (args.assetsOnly) {
    console.log('Assets only, skip markdown.');
    return;
  }

  if (!args.dryRun) fs.mkdirSync(DEMOS_DIR, { recursive: true });

  let written = 0;
  for (const name of dirs) {
    const meta = PROJECT_META[name];
    if (meta?.skip) {
      console.log(`skip gallery card: ${name}`);
      continue;
    }

    const destDir = path.join(PROJECT_DEST, name);
    const entryRel = resolveEntry(destDir, meta?.entry) || meta?.entry || '';
    if (!entryRel) {
      console.warn(`no entry HTML for ${name}, skip md`);
      continue;
    }

    const title = meta?.title || name;
    const description =
      meta?.description || `旧站整站级演示：${name}。`;
    const category = meta?.category || '实验';
    const tags = [...new Set([...(meta?.tags || ['project']), '精选'])];
    const relatedPosts = meta?.relatedPosts || [];
    const slug = `project-${name}`;
    const demoUrl = `/demos/project/${name}/${entryRel}`;
    const legacyUrl = `/static/project/${name}/${entryRel}`;

    const md = buildMarkdown({
      title,
      description,
      pubDate: '2019-06-01',
      demoUrl,
      legacyUrl,
      category,
      badge: relatedPosts.length ? '博客配套' : '整站',
      tags,
      relatedPosts,
    });

    const mdPath = path.join(DEMOS_DIR, `${slug}.md`);
    console.log(`md ${slug} → ${demoUrl}`);
    if (!args.dryRun) fs.writeFileSync(mdPath, md);
    written++;
  }

  console.log(`\nDone: copied ${dirs.length} project dirs, wrote ${written} demo entries.`);
}

main();
