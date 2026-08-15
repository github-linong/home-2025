#!/usr/bin/env node
/**
 * scripts/gen-textures.mjs
 * 拼拼卡 · AI 美术生产流水线（DashScope 通义万相，异步任务 + 轮询）
 *
 * 读取 config/cards.json（73 张），按「系列风格 + 稀有度点缀」构建提示词，
 * 直连 DashScope 文生图，输出到 assets/resources/textures/series/{seriesId}/{cardId}.png
 * （与 assets/Script/Core/Theme.ts 的 assetPath.seriesArt 契约一致）。
 *
 * 用法：
 *   node scripts/gen-textures.mjs --dry-run            # 预览全部提示词，不发请求
 *   node scripts/gen-textures.mjs --limit=5            # 试跑 5 张（已存在自动跳过）
 *   node scripts/gen-textures.mjs --series=flower      # 只跑某个系列
 *   node scripts/gen-textures.mjs --force              # 覆盖重新生成
 *   node scripts/gen-textures.mjs --ui                 # 生成 UI 图（board_bg / splash）
 *   node scripts/gen-textures.mjs --model=wanx-v1      # 换模型（默认 wanx2.1-t2i-turbo）
 *   node scripts/gen-textures.mjs --key=sk-xxx         # 显式传 Key（否则读环境/.env）
 *
 * API Key 读取优先级：--key > 环境变量 DASHSCOPE_API_KEY > 根目录 .env > games/puzzle-cards/.env
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');

const OUT_BASE = path.join(ROOT, 'assets', 'resources', 'textures');
const MANIFEST_PATH = path.join(OUT_BASE, 'manifest.json');

const ENDPOINT_T2I = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
const TASK_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/tasks';
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 180_000;

// ---------- CLI ----------
function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--ui') args.ui = true;
    else if (a.startsWith('--limit=')) args.limit = Number(a.slice(8));
    else if (a.startsWith('--series=')) args.series = a.slice(9);
    else if (a.startsWith('--model=')) args.model = a.slice(8);
    else if (a.startsWith('--size=')) args.size = a.slice(7);
    else if (a.startsWith('--key=')) args.key = a.slice(6);
    else if (a.startsWith('--concurrency=')) args.concurrency = Number(a.slice(14));
    else if (a.startsWith('--style=')) args.style = a.slice(8);
    else if (a.startsWith('--out=')) args.out = a.slice(6);
  }
  return args;
}

// ---------- 环境 / Key ----------
function parseEnvFile(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function resolveApiKey(cliKey) {
  if (cliKey) return cliKey;
  if (process.env.DASHSCOPE_API_KEY) return process.env.DASHSCOPE_API_KEY;
  for (const p of [path.join(REPO_ROOT, '.env'), path.join(ROOT, '.env')]) {
    const v = parseEnvFile(p).DASHSCOPE_API_KEY;
    if (v) return v;
  }
  return '';
}

// ---------- 提示词（拼拼卡 · AI 手绘暖色糖果风） ----------
// 风格预设：--style=candy（默认，现有卡面）/ --style=watercolor（v2 候选：水彩绘本风）
const STYLE_PRESETS = {
  candy:
    '暖色糖果风儿童绘本插画，柔和圆润造型，奶油白与暖橘色(#FF9A6C)主色调，浅粉与暖黄点缀，' +
    '软萌可爱，画面干净明亮，方形卡片构图，主体居中特写，柔和高斯光晕背景，' +
    '无文字，无水印，无边框，无logo',
  watercolor:
    '水彩绘本风插画，柔和透明水彩晕染，细腻纸张纹理质感，淡雅温柔的奶油色与浅橘、浅粉配色，' +
    '笔触轻盈通透，边缘柔和不锐利，儿童绘本插画气质，方形卡片构图，主体居中特写，' +
    '画面干净治愈，无文字，无水印，无边框，无logo',
};

const STYLE_PREFIX = STYLE_PRESETS.candy;

const SERIES_STYLE = {
  flower: '主题：一株盛开的花朵。花瓣圆润饱满，点缀柔和的叶子与晨露，清新治愈。',
  pet: '主题：一只可爱的小动物。Q版圆润身材，大眼睛，毛茸茸质感，憨态可掬。',
  food: '主题：一份诱人的美食。拟人化可爱的表情，热气腾腾，温馨治愈。',
  landscape: '主题：一处美丽的风景。简化可爱的几何山峦与云朵，童话质感。',
  star: '主题：星座与星空。可爱的星星与星座连线，闪烁光点，梦幻夜空。',
};

const RARITY_FLOURISH = {
  N: '构图简洁清爽。',
  R: '背景点缀少量星星与光点。',
  SR: '背景有柔和光晕与闪粉，细节精致。',
  SSR: '金色光辉环绕，彩带与光斑点缀，华丽但不喧宾夺主。',
  HIDDEN: '神秘彩虹光晕，若隐若现的星光，梦幻神秘。',
};

function buildCardPrompt(card, stylePrefix) {
  const series = SERIES_STYLE[card.seriesId] || '';
  const flourish = RARITY_FLOURISH[card.rarity] || '';
  const subject = card.name || card.id;
  return `${stylePrefix || STYLE_PREFIX}。${series}主体是「${subject}」。${flourish}`;
}

// ---------- UI 图任务 ----------
const UI_TASKS = [
  {
    id: 'board_bg',
    out: path.join(OUT_BASE, 'pieces', 'board_bg.png'),
    prompt:
      '拼图游戏底板背景，暖色糖果风，奶油白与暖橘色(#FF9A6C)柔和渐变，圆角木纹质感边框，' +
      '角落点缀小花朵与小星星，中央大面积留白，柔和温馨，无文字，无水印，无边框，无logo。',
  },
  {
    id: 'splash',
    out: path.join(OUT_BASE, 'brand', 'splash.png'),
    prompt:
      '微信小游戏启动闪屏背景，暖色糖果风，暖橘(#FF9A6C)与奶油白主色调，可爱的拼图碎片与星星' +
      '散落四周，中央留出大面积空白区域（不要任何文字），喜庆温馨，无文字，无水印，无logo。',
  },
];

// ---------- DashScope 异步任务 ----------
async function submitTask(prompt, { model, size, apiKey, workspaceId }) {
  const headers = {
    'content-type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-DashScope-Async': 'enable',
  };
  if (workspaceId) headers['X-DashScope-WorkSpace'] = workspaceId;
  const res = await fetch(ENDPOINT_T2I, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      input: { prompt },
      parameters: { size, prompt_extend: true },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new Error(`提交失败 HTTP ${res.status}: ${detail}`);
  }
  const body = await res.json();
  const taskId = body?.output?.task_id;
  if (!taskId) throw new Error(`提交成功但无 task_id: ${JSON.stringify(body).slice(0, 300)}`);
  return taskId;
}

async function pollTask(taskId, { apiKey, workspaceId }) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (workspaceId) headers['X-DashScope-WorkSpace'] = workspaceId;
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_MS) {
    const res = await fetch(`${TASK_ENDPOINT}/${taskId}`, { headers });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      throw new Error(`轮询失败 HTTP ${res.status}: ${detail}`);
    }
    const body = await res.json();
    const status = body?.output?.task_status;
    if (status === 'SUCCEEDED') {
      const url = body?.output?.results?.[0]?.url;
      if (!url) throw new Error(`任务成功但无图片 URL: ${JSON.stringify(body).slice(0, 300)}`);
      return url;
    }
    if (status === 'FAILED') {
      throw new Error(`任务失败: ${body?.output?.message || '未知错误'}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`任务 ${taskId} 轮询超时（${MAX_POLL_MS / 1000}s）`);
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- 生成单图（带 2 次重试） ----------
async function generateOne(label, prompt, outPath, opts, api) {
  if (!opts.force && fs.existsSync(outPath)) return { status: 'skipped' };
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const taskId = await submitTask(prompt, api);
      const url = await pollTask(taskId, api);
      const buf = await download(url);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buf);
      return { status: 'ok', bytes: buf.length };
    } catch (err) {
      lastErr = err;
      if (attempt === 1) {
        console.warn(`  ${label} 第 1 次失败，重试中…（${err.message}）`);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }
  return { status: 'failed', error: lastErr?.message || String(lastErr) };
}

// ---------- 并发池 ----------
async function runPool(tasks, concurrency, label, fn) {
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (idx < tasks.length) {
      const i = idx++;
      const t = tasks[i];
      const r = await fn(t);
      results.push({ ...t, result: r });
      if (r.status === 'ok') console.log(`✅ ${label} ${t.id}`);
      else if (r.status === 'skipped') console.log(`⏭️  ${label} ${t.id} 已存在`);
      else console.error(`❌ ${label} ${t.id}: ${r.error}`);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------- 主流程 ----------
async function main() {
  const args = parseArgs();
  const apiKey = resolveApiKey(args.key);
  const model = args.model || process.env.DASHSCOPE_IMAGE_MODEL || 'wanx2.1-t2i-turbo';
  const size = args.size || '1024*1024';
  const concurrency = args.concurrency || 2;
  const style = args.style || 'candy';
  const stylePrefix = STYLE_PRESETS[style] || STYLE_PRESETS.candy;
  const outBase = args.out ? path.join(ROOT, args.out) : OUT_BASE;
  if (!STYLE_PRESETS[style]) console.warn(`⚠️ 未知风格 ${style}，使用默认 candy`);

  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'cards.json'), 'utf8'));
  const selected = (args.series ? cards.filter((c) => c.seriesId === args.series) : cards)
    .slice(0, args.limit || undefined);

  const tasks = selected.map((card) => ({
    id: card.id,
    prompt: buildCardPrompt(card, stylePrefix),
    out: path.join(outBase, 'series', card.seriesId, `${card.id}.png`),
  }));

  if (args.ui) {
    for (const t of UI_TASKS) tasks.push({ id: `ui:${t.id}`, prompt: t.prompt, out: path.join(outBase, 'pieces', `${t.id}.png`) });
  }

  if (!tasks.length) {
    console.error('没有任务：检查 --series / --limit / 卡牌配置');
    process.exit(1);
  }

  console.log(
    `${args.dryRun ? 'DRY-RUN' : 'GEN'} model=${model} size=${size} concurrency=${concurrency} 任务=${tasks.length}${args.force ? ' (--force 覆盖)' : ''}`,
  );

  if (args.dryRun) {
    for (const t of tasks) {
      console.log(`\n--- ${t.id} ---\n${t.prompt}\n→ ${path.relative(ROOT, t.out)}`);
    }
    console.log(`\n共 ${tasks.length} 个任务（dry-run 未调用 API）`);
    return;
  }

  if (!apiKey) {
    console.error(
      '未找到 DASHSCOPE_API_KEY：请用 --key=... 传入，或在根目录 .env / 本目录 .env 配置（参考 .env.example）。',
    );
    process.exit(1);
  }

  const api = { apiKey, model, size, workspaceId: '' };
  const results = await runPool(tasks, concurrency, '生成', async (t) =>
    generateOne(t.id, t.prompt, t.out, args, api),
  );

  const ok = results.filter((r) => r.result.status === 'ok').length;
  const skipped = results.filter((r) => r.result.status === 'skipped').length;
  const failed = results.filter((r) => r.result.status === 'failed');

  fs.mkdirSync(outBase, { recursive: true });
  const manifestPath = path.join(outBase, 'manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model,
        size,
        style,
        total: tasks.length,
        ok,
        skipped,
        failed: failed.map((f) => ({ id: f.id, error: f.result.error })),
      },
      null,
      2,
    ),
  );

  console.log(`\n完成：成功 ${ok}，跳过 ${skipped}，失败 ${failed.length}`);
  if (failed.length) {
    console.error('失败清单：');
    for (const f of failed) console.error(`  - ${f.id}: ${f.result.error}`);
    console.error('可单独重跑：node scripts/gen-textures.mjs --series=... --limit=...');
  }
  console.log(`manifest → ${path.relative(ROOT, manifestPath)}`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
