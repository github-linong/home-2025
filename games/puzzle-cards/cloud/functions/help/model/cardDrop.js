// cloud/model/cardDrop.js
// 掉卡引擎（服务端权威，对应 PRD M04 / 5.4 / 5.5 / 5.6）。
// 概率与保底必须放服务端，否则可被客户端篡改（对照 M23 反作弊）。
// rng 可注入，便于单测复现。

const config = require('./config');

const RARITIES = ['N', 'R', 'SR', 'SSR'];

// 把概率表向上游移 boostPct（整数百分比），保持总和 100、各档非负。
function shiftUp(prob, boostPct) {
  const p = { ...prob };
  let remaining = boostPct;
  for (let i = 0; i < RARITIES.length; i++) {
    const lo = RARITIES[i];
    if (remaining <= 0) break;
    const move = Math.min(p[lo] || 0, remaining);
    if (move > 0) {
      p[lo] -= move;
      const hi = RARITIES[i + 1];
      if (hi) p[hi] = (p[hi] || 0) + move;
      remaining -= move;
    }
  }
  return p;
}

function normalize(prob) {
  const sum = RARITIES.reduce((s, r) => s + (prob[r] || 0), 0);
  if (sum === 0) return prob;
  const out = {};
  RARITIES.forEach((r) => { out[r] = ((prob[r] || 0) / sum) * 100; });
  return out;
}

function sampleRarity(prob, rng) {
  const r = rng();
  let acc = 0;
  for (const rarity of RARITIES) {
    acc += prob[rarity] || 0;
    if (r * 100 < acc) return rarity;
  }
  return 'N';
}

// 计算本抽稀有度（含星级加成 / 首通 / Boss 保底 / 连续保底）
function rollRarity(ctx, rng) {
  const P = config.probabilities();
  const key = ctx.isHiddenLevel ? 'hidden' : String(ctx.difficultyStars);
  let prob = { ...P.baseByStars[key] };

  if (ctx.starRating && P.starBonusPct[ctx.starRating]) prob = shiftUp(prob, P.starBonusPct[ctx.starRating]);
  if (ctx.isFirstClear) prob = shiftUp(prob, P.firstClearBonusPct);
  prob = normalize(prob);

  const maxRarity = P.maxRarityByStars[key];
  const forced = P.pity.forceMaxRarity && (ctx.pityMiss || 0) >= P.pity.threshold;
  let rarity = forced ? maxRarity : sampleRarity(prob, rng);

  if (ctx.isBoss && RARITIES.indexOf(rarity) < RARITIES.indexOf(P.bossMinRarity)) rarity = P.bossMinRarity;
  if (ctx.starRating === 3 && RARITIES.indexOf(rarity) < RARITIES.indexOf('R')) rarity = 'R';

  const nextPityMiss = rarity === maxRarity ? 0 : (ctx.pityMiss || 0) + 1;
  return { rarity, nextPityMiss };
}

// 系列内挑卡：优先未收集的该稀有度卡
function pickCard(seriesId, rarity, ownedCardIds, rng) {
  const pool = config.cardsByRarity(seriesId, rarity);
  if (!pool.length) return null;
  const unowned = pool.filter((c) => !ownedCardIds.includes(c.id));
  const choose = unowned.length ? unowned : pool;
  return choose[Math.floor(rng() * choose.length)].id;
}

// 主入口：掉卡 1 次。
// ctx: { seriesId, difficultyStars, starRating, isFirstClear, isBoss, isHiddenLevel, ownedCardIds, pityMiss }
function rollCard(ctx, rng = Math.random) {
  const P = config.probabilities();
  let rarity = null;
  let nextPityMiss = 0;
  let cardId = null;
  let isHidden = false;

  if (ctx.isHiddenLevel && rng() < P.hiddenChance) {
    const hid = config.cardsByRarity(ctx.seriesId, 'HIDDEN');
    if (hid.length) {
      isHidden = true;
      rarity = 'HIDDEN';
      cardId = hid[0].id;
      nextPityMiss = 0;
    }
  }

  if (!isHidden) {
    const res = rollRarity(ctx, rng);
    rarity = res.rarity;
    nextPityMiss = res.nextPityMiss;
    cardId = pickCard(ctx.seriesId, rarity, ctx.ownedCardIds || [], rng);
  }

  const isDuplicate = !isHidden && cardId ? (ctx.ownedCardIds || []).includes(cardId) : false;
  const shards = isDuplicate ? (P.shards.duplicateToShards[rarity] || 0) : 0;

  return { rarity, cardId, isHidden, isDuplicate, shards, isNew: !isDuplicate, nextPityMiss };
}

module.exports = { rollCard, rollRarity, pickCard, shiftUp, normalize };
