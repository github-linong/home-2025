// scripts/gen-config.mjs
// 把拼拼卡的数值规划生成可校验的 JSON：difficulty / probabilities / cards / levels / signin / tasks / gacha（纯 IAA，无 shop）。
// 运行：node scripts/gen-config.mjs
// 输出：cloud/model/config/*.json （云函数 require 用） 与 config/*.json （可读副本）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_CLOUD = path.join(ROOT, 'cloud/model/config');
const OUT_REF = path.join(ROOT, 'config');
fs.mkdirSync(OUT_CLOUD, { recursive: true });
fs.mkdirSync(OUT_REF, { recursive: true });

const RARITY_LABEL = { N: '普通', R: '稀有', SR: '超稀有', SSR: '传说', HIDDEN: '隐藏' };
const BASE_SCORE = { N: 10, R: 30, SR: 80, SSR: 200, HIDDEN: 300 };

// ---------- 卡牌名称池（按系列） ----------
const NAMES = {
  flower: ['玫瑰', '郁金香', '百合', '向日葵', '樱花', '薰衣草', '牡丹', '雏菊', '风信子', '茉莉', '鸢尾', '芙蓉', '紫罗兰'],
  pet: ['柴犬', '布偶猫', '柯基', '金毛', '仓鼠', '垂耳兔', '鹦鹉', '刺猬', '龙猫', '橘猫', '萨摩耶', '豚鼠', '水獭', '狐狸', '企鹅', '羊驼', '熊猫', '考拉'],
  food: ['拉面', '寿司', '蛋糕', '奶茶', '火锅', '烧烤', '披萨', '冰淇淋', '包子', '煎饼', '牛排', '甜甜圈', '咖喱', '麻薯', '可丽饼', '关东煮', '章鱼烧', '布丁'],
  landscape: ['长城', '西湖', '黄山', '故宫', '漓江', '张家界', '鼓浪屿', '洱海', '泰山', '九寨沟', '布达拉宫', '壶口瀑布', '喀纳斯'],
  star: ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼', '北极星', '织女星'],
};
const SERIES_NAME = { flower: '花语集', pet: '萌宠志', food: '食光记', landscape: '山河卷', star: '星辰谱' };
// 每个系列的稀有度数量（PRD 5.2）。隐藏卡不计入总数，额外 1 张/系列。
const RARITY_COUNT = {
  flower: { N: 5, R: 4, SR: 2, SSR: 1 },
  pet: { N: 7, R: 5, SR: 3, SSR: 1 },
  food: { N: 7, R: 5, SR: 3, SSR: 1 },
  landscape: { N: 4, R: 4, SR: 3, SSR: 1 },
  star: { N: 4, R: 4, SR: 3, SSR: 1 },
};

function buildCards() {
  const cards = [];
  for (const seriesId of Object.keys(RARITY_COUNT)) {
    const counts = RARITY_COUNT[seriesId];
    const names = NAMES[seriesId];
    const seriesName = SERIES_NAME[seriesId];
    let ni = 0;
    let seq = 1;
    for (const rarity of ['N', 'R', 'SR', 'SSR']) {
      for (let i = 0; i < counts[rarity]; i++) {
        const name = names[ni++];
        const id = `${seriesId}_${String(seq++).padStart(3, '0')}`;
        cards.push({
          id,
          seriesId,
          seriesName,
          name: `${name}`,
          rarity,
          baseScore: BASE_SCORE[rarity],
          hidden: false,
          description: `${name} · ${RARITY_LABEL[rarity]}`,
          image: `images/cards/${id}.png`,
        });
      }
    }
    // 隐藏卡（不计入总数，1 张/系列）
    const hid = `${seriesId}_H01`;
    cards.push({
      id: hid,
      seriesId,
      seriesName,
      name: `${seriesName}·秘`,
      rarity: 'HIDDEN',
      baseScore: BASE_SCORE.HIDDEN,
      hidden: true,
      description: '隐藏卡，仅特殊条件获得',
      image: `images/cards/${hid}.png`,
    });
  }
  return cards;
}

// ---------- 难度参数（PRD 3.3） ----------
const PIECE = { 1: 4, 2: 9, 3: 16, 4: 25, 5: 36, 6: 49, 7: 64, 8: 81, 9: 100, 10: 144 };
const STD_TIME = { 1: 30, 2: 60, 3: 90, 4: 120, 5: 150, 6: 200, 7: 260, 8: 330, 9: 410, 10: 600 };
const SHAPE = { 1: 'rect', 2: 'rect', 3: 'rounded', 4: 'rounded', 5: 'rounded', 6: 'irregular', 7: 'irregular', 8: 'irregular', 9: 'irregular', 10: 'irregular' };
const REF_MODE = { 1: 'always', 2: 'first5s', 3: 'first5s', 4: 'none', 5: 'none', 6: 'none', 7: 'none', 8: 'none', 9: 'none', 10: 'none' };
const TIME_LIMIT = { 1: 0, 2: 0, 3: 0, 4: 180, 5: 150, 6: 120, 7: 120, 8: 100, 9: 90, 10: 90 };
const DISTRACTORS = { 1: 0, 2: 0, 3: 1, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 6 };
const ROTATABLE = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false, 9: true, 10: true };

const difficulty = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => ({
  stars: s,
  pieceCount: PIECE[s],
  shape: SHAPE[s],
  refMode: REF_MODE[s],
  stdTimeSec: STD_TIME[s],
  timeLimitSec: TIME_LIMIT[s],
  distractors: DISTRACTORS[s],
  rotatable: ROTATABLE[s],
}));

// ---------- 概率（PRD 5.4） ----------
const probabilities = {
  baseByStars: {
    '1': { N: 95, R: 5, SR: 0, SSR: 0 },
    '2': { N: 80, R: 18, SR: 2, SSR: 0 },
    '3': { N: 60, R: 35, SR: 5, SSR: 0 },
    '4': { N: 40, R: 50, SR: 9, SSR: 1 },
    '5': { N: 20, R: 60, SR: 18, SSR: 2 },
    '6': { N: 5, R: 45, SR: 45, SSR: 5 },
    '7': { N: 0, R: 30, SR: 55, SSR: 15 },
    '8': { N: 0, R: 15, SR: 60, SSR: 25 },
    '9': { N: 0, R: 5, SR: 55, SSR: 40 },
    '10': { N: 0, R: 0, SR: 40, SSR: 55 },
    hidden: { N: 0, R: 0, SR: 0, SSR: 95 },
  },
  maxRarityByStars: { '1': 'R', '2': 'SR', '3': 'SR', '4': 'SSR', '5': 'SSR', '6': 'SSR', '7': 'SSR', '8': 'SSR', '9': 'SSR', '10': 'SSR', hidden: 'SSR' },
  starBonusPct: { 2: 5, 3: 15 }, // 高档概率提升（向上游移）
  firstClearBonusPct: 10, // 首通额外提升
  bossMinRarity: 'SR', // Boss 关保底 SR 及以上
  hiddenChance: 0.05, // 隐藏关出隐藏卡概率
  pity: { threshold: 5, forceMaxRarity: true }, // 连续 5 次未出最高稀有度，第 6 次必出
  dailyLimit: { positionHint: 3, autoPlace: 2, refHint: 3 }, // 提示每日上限（P-010）
  shards: {
    duplicateToShards: { N: 2, R: 5, SR: 15, SSR: 50, HIDDEN: 0 },
    exchangeCost: { N: 10, R: 30, SR: 80, SSR: 200, HIDDEN: -1 }, // -1 = 不可兑换
  },
};

// ---------- 关卡（PRD 4.2） ----------
// 拼拼卡决策：60 关（5 章 × 12，对应 5 系列），无独立隐藏章节；隐藏卡仍由隐藏关逻辑/特殊条件产出。
const CHAPTERS = [
  { id: 'ch1', name: '花语集·春', seriesId: 'flower', count: 12, min: 1, max: 2, boss: 2 },
  { id: 'ch2', name: '萌宠志·萌', seriesId: 'pet', count: 12, min: 3, max: 4, boss: 4 },
  { id: 'ch3', name: '食光记·味', seriesId: 'food', count: 12, min: 5, max: 6, boss: 6 },
  { id: 'ch4', name: '山河卷·远', seriesId: 'landscape', count: 12, min: 7, max: 8, boss: 8 },
  { id: 'ch5', name: '星辰谱·幻', seriesId: 'star', count: 12, min: 9, max: 10, boss: 10 },
];

function buildLevels() {
  const levels = [];
  let order = 0;
  let prevId = null;
  const chapters = [...CHAPTERS];
  for (const ch of chapters) {
    for (let i = 0; i < ch.count; i++) {
      // 难度曲线：前 2 关热身（min），末关 Boss（max），其余线性铺开
      let stars;
      if (i === ch.count - 1) stars = ch.boss;
      else if (i < 2) stars = ch.min;
      else if (ch.count <= 2) stars = ch.max;
      else stars = Math.round(ch.min + (ch.max - ch.min) * (i / (ch.count - 1)));
      stars = Math.max(ch.min, Math.min(ch.boss, stars));
      const id = `${ch.id}_${String(i + 1).padStart(2, '0')}`;
      levels.push({
        id,
        order: order++,
        chapterId: ch.id,
        chapterName: ch.name,
        seriesId: ch.seriesId,
        indexInChapter: i + 1,
        difficultyStars: stars,
        pieceCount: PIECE[stars],
        stdTimeSec: STD_TIME[stars],
        shape: SHAPE[stars],
        refMode: REF_MODE[stars],
        timeLimitSec: TIME_LIMIT[stars],
        distractors: DISTRACTORS[stars],
        rotatable: ROTATABLE[stars],
        isBoss: i === ch.count - 1,
        isHiddenChapter: !!ch.hidden,
        prevLevelId: prevId,
        unlockBy: prevId ? 'clear' : 'initial',
      });
      prevId = id;
    }
  }
  return levels;
}

// ---------- 签到（PRD 11.2） ----------
const signin = {
  days: [
    { day: 1, reward: { coins: 100 } },
    { day: 2, reward: { puzzleChances: 1 } },
    { day: 3, reward: { shards: 2 } },
    { day: 4, reward: { coins: 200 } },
    { day: 5, reward: { puzzleChances: 1, shards: 1 } },
    { day: 6, reward: { coins: 300 } },
    { day: 7, reward: { cardPack: 'normal', shards: 5 } },
  ],
  weekBonus: { first: { cardPack: 'premium' }, repeat: { coins: 500 } },
};

// ---------- 每日任务（PRD 11.3） ----------
const tasks = {
  daily: [
    { id: 'task_01', name: '完成拼图', target: 3, metric: 'levelClear', reward: { coins: 200 } },
    { id: 'task_02', name: '获得卡牌', target: 2, metric: 'newCard', reward: { shards: 2 } },
    { id: 'task_03', name: '社交互动', target: 1, metric: 'social', reward: { puzzleChances: 1 } },
  ],
  allCompleteBonus: { coins: 100 },
};

// ---------- 纯 IAA（拼拼卡决策）：不含任何内购 ----------
// 决策文档明确：变现 = 纯 IAA（激励/插屏/Banner 广告），移除 IAP / 钻石 / 月卡 / 通行证 / 卡包购买。
// 因此 shop 配置置空；免费抽卡（卡包概率）独立到 gacha 配置，由看广告免费抽取，不售卖。
const shop = {};

// ---------- 免费抽卡卡包（一期·看广告免费抽取，不售卖） ----------
const gacha = {
  cardPacks: {
    normal: { id: 'pack_normal', prob: { N: 60, R: 30, SR: 9, SSR: 1 }, pity: { count: 10, guarantee: 'SR' } },
    premium: { id: 'pack_premium', prob: { N: 20, R: 40, SR: 30, SSR: 10 }, pity: { count: 5, guarantee: 'SSR' } },
    limited: { id: 'pack_limited', prob: { SR: 100, SSR: 20 }, limited: true, pity: { count: 3, guarantee: 'SSR' } },
  },
};

// ---------- 写出 + 校验 ----------
const cards = buildCards();
const levels = buildLevels();

const out = {
  difficulty,
  probabilities,
  cards,
  levels,
  signin,
  tasks,
  gacha,
  shop,
};
for (const [k, v] of Object.entries(out)) {
  fs.writeFileSync(path.join(OUT_CLOUD, `${k}.json`), JSON.stringify(v, null, 2));
  fs.writeFileSync(path.join(OUT_REF, `${k}.json`), JSON.stringify(v, null, 2));
}

const normalCards = cards.filter((c) => !c.hidden).length;
const hiddenCards = cards.filter((c) => c.hidden).length;
const normalLevels = levels.filter((l) => !l.isHiddenChapter).length;
const hiddenLevels = levels.filter((l) => l.isHiddenChapter).length;

// 断言
const assert = (cond, msg) => { if (!cond) { console.error('❌', msg); process.exitCode = 1; } };
const countByRarity = (s) => cards.filter((c) => c.seriesId === s && !c.hidden).reduce((a, c) => ((a[c.rarity] = (a[c.rarity] || 0) + 1), a), {});
assert(normalCards === 68, `普通卡应为 68，实际 ${normalCards}`);
assert(hiddenCards === 5, `隐藏卡应为 5，实际 ${hiddenCards}`);
assert(normalLevels === 60, `普通关应为 60，实际 ${normalLevels}`);
assert(hiddenLevels === 0, `隐藏关应为 0，实际 ${hiddenLevels}`);
for (const s of Object.keys(RARITY_COUNT)) {
  const c = countByRarity(s);
  const exp = RARITY_COUNT[s];
  assert(c.N === exp.N && c.R === exp.R && c.SR === exp.SR && c.SSR === exp.SSR, `${s} 稀有度分布不符: ${JSON.stringify(c)}`);
}

console.log('✅ 配置已生成');
console.log(`   卡牌: 普通 ${normalCards} + 隐藏 ${hiddenCards} = ${cards.length}`);
console.log(`   关卡: 普通 ${normalLevels} + 隐藏 ${hiddenLevels} = ${levels.length}`);
console.log('   稀有度分布:', Object.keys(RARITY_COUNT).map((s) => `${s}:${JSON.stringify(countByRarity(s))}`).join('  '));
