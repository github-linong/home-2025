#!/usr/bin/env node
/**
 * scripts/gen-lore.mjs
 * A2 图鉴知识卡：为 73 张卡生成 { fact, tip } 图鉴小知识。
 *
 * 双模式：
 *   node scripts/gen-lore.mjs             # 离线模板模式（无网络依赖，立即可用）
 *   node scripts/gen-lore.mjs --llm       # LLM 模式（qwen-flash，质量更高；需 DASHSCOPE_API_KEY）
 *   node scripts/gen-lore.mjs --llm --force   # 强制覆盖已生成内容
 *   node scripts/gen-lore.mjs --dry-run   # 只打印计划
 *
 * 输出：config/lore.json（可读源） + cloud/model/config/lore.json（云函数 require 用）
 * 结构：{ [cardId]: { fact: string, tip: string } }
 * 随后运行 node scripts/gen-config.mjs 会把 lore 合并进 cards.json（客户端经 config 云函数直接拿到）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_CLOUD = path.join(ROOT, 'cloud', 'model', 'config');
const OUT_REF = path.join(ROOT, 'config');

const LLM_ENDPOINT = process.env.DASHSCOPE_LLM_ENDPOINT || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const LLM_MODEL = process.env.DASHSCOPE_LLM_MODEL || 'qwen-flash';

// ---------- 系列知识模板（离线模式；LLM 模式仅作回退） ----------
const SERIES_FACTS = {
  flower: [
    '{name} 的花语是「{trait}」，适合送给喜欢的人。',
    '在古时候，人们用 {name} 来传递说不出口的心意。',
    '{name} 的花瓣颜色来自天然色素，就像画家的调色盘。',
    '蜜蜂最喜欢 {name} 的花蜜，采蜜时还能帮忙传粉。',
    '{name} 喜欢晒太阳，阳光越足，开得越灿烂。',
  ],
  pet: [
    '{name} 天生就是个开心果，看到它心情都会变好。',
    '{name} 的尾巴会说话，高兴时摇得飞快。',
    '{name} 睡觉的样子特别可爱，还会打小呼噜。',
    '{name} 很喜欢和人一起玩，是超棒的伙伴。',
    '{name} 的鼻子很灵，能闻到很远处好吃的味道。',
  ],
  food: [
    '{name} 是很多人心里暖暖的味道。',
    '做 {name} 的时候，香气能飘满一整条街。',
    '{name} 趁热吃最香，凉了就没那么好吃啦。',
    '不同的地方，{name} 的做法和口味也不一样。',
    '{name} 和好朋友分享，会变得更美味。',
  ],
  landscape: [
    '{name} 的美景，吸引着无数人前来打卡。',
    '古人看到 {name} 的美景，写下过很多诗篇。',
    '{name} 的四季各有不同的风景。',
    '保护 {name} 的环境，才能让美景一直延续下去。',
    '{name} 是祖国大地上一颗闪亮的明珠。',
  ],
  star: [
    '{name} 是夜空中的一颗亮星，指引着方向。',
    '古人把 {name} 编进了美丽的星座故事里。',
    '观察 {name} 需要晴朗的夜晚和耐心。',
    '{name} 的光要经过很久很久才能到达我们眼睛。',
    '每个星座背后，都藏着一个古老传说。',
  ],
};

const SERIES_TRAITS = {
  flower: ['美好', '温柔', '希望', '快乐', '友谊'],
  pet: ['机灵', '可爱', '活泼', '贴心', '温暖'],
  food: ['香甜', '暖胃', '经典', '地道', '治愈'],
  landscape: ['壮丽', '秀美', '辽阔', '宁静', '神秘'],
  star: ['闪耀', '明亮', '遥远', '神秘', '温柔'],
};

const SERIES_TIPS = {
  flower: '看到小花，记得轻轻闻一闻它的香味呀。',
  pet: '见到小动物，先温柔地和它打个招呼吧。',
  food: '吃美食前，先感谢做饭的人吧。',
  landscape: '出去玩的时候，把美景装进心里带回家。',
  star: '晚上抬头看看星星，它们一直在陪着你。',
};

// 隐藏卡专用
const HIDDEN_FACT = '这张神秘卡片，只有特别用心的拼图高手才能遇见。';
const HIDDEN_TIP = '多完成高难度的拼图，也许就能遇见它。';

// ---------- 离线模板模式 ----------
function buildTemplateLore(cards) {
  const lore = {};
  for (const c of cards) {
    if (c.rarity === 'HIDDEN') {
      lore[c.id] = { fact: HIDDEN_FACT, tip: HIDDEN_TIP };
      continue;
    }
    const facts = SERIES_FACTS[c.seriesId] || SERIES_FACTS.flower;
    const traits = SERIES_TRAITS[c.seriesId] || SERIES_TRAITS.flower;
    // 按 id 稳定取模，保证每次生成一致
    const h = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const fact = facts[h % facts.length].replace('{name}', c.name).replace('{trait}', traits[h % traits.length]);
    lore[c.id] = { fact, tip: SERIES_TIPS[c.seriesId] || SERIES_TIPS.flower };
  }
  return lore;
}

// ---------- LLM 模式 ----------
function resolveApiKey() {
  if (process.env.DASHSCOPE_API_KEY) return process.env.DASHSCOPE_API_KEY;
  for (const p of [path.join(ROOT, '..', '..', '.env'), path.join(ROOT, '.env'), path.join(ROOT, '..', '..', 'apps', 'api2', '.env')]) {
    try {
      const txt = fs.readFileSync(p, 'utf8');
      const m = txt.match(/^DASHSCOPE_API_KEY=(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* next */ }
  }
  return '';
}

async function llmGenerateBatch(cards, apiKey) {
  const list = cards.map((c) => ({ id: c.id, name: c.name, seriesName: c.seriesName, rarity: c.rarity }));
  const prompt = `你是儿童益智拼图游戏《拼拼卡》的图鉴文案编辑。为以下卡牌各写一条图鉴小知识。
卡牌列表：${JSON.stringify(list)}
输出要求：严格输出 JSON 对象，键为卡牌 id，值为 {"fact": "一句20~40字的趣味知识", "tip": "一句15~25字的暖萌小提示"}。
要求：事实准确、语气温暖鼓励、面向6~12岁儿童可读、无负面词、不编造具体数字、不出现「失败」「你输了」。`;
  const res = await fetch(LLM_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content || '';
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('LLM 输出不是 JSON 对象');
  return parsed;
}

async function buildLlmLore(cards, apiKey, force, onProgress) {
  const lore = {};
  const BATCH = 12;
  let failed = 0;
  for (let i = 0; i < cards.length; i += BATCH) {
    const batch = cards.slice(i, i + BATCH);
    onProgress?.(`批次 ${i / BATCH + 1}/${Math.ceil(cards.length / BATCH)}（${batch.length} 张）`);
    try {
      const out = await llmGenerateBatch(batch, apiKey);
      let ok = 0;
      for (const c of batch) {
        const v = out[c.id];
        if (v && typeof v.fact === 'string' && v.fact.length > 0) {
          lore[c.id] = { fact: v.fact, tip: typeof v.tip === 'string' && v.tip ? v.tip : '' };
          ok++;
        }
      }
      onProgress?.(`  → 成功 ${ok}/${batch.length}`);
      if (ok < batch.length) failed += batch.length - ok;
    } catch (err) {
      onProgress?.(`  → 批次失败：${err.message}`);
      failed += batch.length;
    }
    // 批次间小延时，避免限流
    if (i + BATCH < cards.length) await new Promise((r) => setTimeout(r, 800));
  }
  return { lore, failed };
}

// ---------- 主流程 ----------
async function main() {
  const args = process.argv.slice(2);
  const useLlm = args.includes('--llm');
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');

  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'cards.json'), 'utf8'));
  if (!cards.length) {
    console.error('未找到卡牌配置，请先运行 node scripts/gen-config.mjs');
    process.exit(1);
  }

  // 已有内容保护（不 --force 时不覆盖）
  const prevPath = path.join(OUT_REF, 'lore.json');
  if (!force && fs.existsSync(prevPath)) {
    const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
    if (prev && Object.keys(prev).length >= cards.length) {
      console.log(`⏭️  lore.json 已存在（${Object.keys(prev).length} 张），--force 可覆盖`);
      return;
    }
  }

  if (dryRun) {
    console.log(`DRY-RUN mode=${useLlm ? 'llm' : 'template'} cards=${cards.length}`);
    return;
  }

  let lore;
  let meta;
  if (useLlm) {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      console.error('LLM 模式需要 DASHSCOPE_API_KEY（--key 或 .env）');
      process.exit(1);
    }
    console.log(`LLM 模式 model=${LLM_MODEL} cards=${cards.length}（失败自动回退模板）`);
    const { lore: llmLore, failed } = await buildLlmLore(cards, apiKey, force, (m) => console.log(m));
    const templateLore = buildTemplateLore(cards);
    for (const id of Object.keys(templateLore)) {
      if (!llmLore[id]) llmLore[id] = templateLore[id];
    }
    lore = llmLore;
    meta = { source: 'llm+qwen-flash', fallbackCount: failed, generatedAt: new Date().toISOString() };
  } else {
    lore = buildTemplateLore(cards);
    meta = { source: 'template', generatedAt: new Date().toISOString() };
  }

  const payload = { meta, cards: lore };
  fs.mkdirSync(OUT_CLOUD, { recursive: true });
  fs.mkdirSync(OUT_REF, { recursive: true });
  fs.writeFileSync(path.join(OUT_CLOUD, 'lore.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(OUT_REF, 'lore.json'), JSON.stringify(payload, null, 2));

  const sample = Object.entries(lore).slice(0, 3);
  console.log(`✅ lore 已生成：${Object.keys(lore).length} 张（${meta.source}）`);
  for (const [id, v] of sample) console.log(`  ${id}: ${v.fact}`);
  console.log('下一步：node scripts/gen-config.mjs 把 lore 合并进 cards.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
