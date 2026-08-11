// cloud/model/gacha.js
// 抽卡 / 卡包（PRD M17 / 18.2）。保底：普通10连必SR、高级5连必SSR、限定3必SSR。
// 与 cardDrop 不同，卡包为跨系列抽取。
const config = require('./config');

const RARITIES = ['N', 'R', 'SR', 'SSR'];

function pickAny(rarity, ownedCardIds, rng) {
  const pool = config.cards().filter((c) => c.rarity === rarity && !c.hidden);
  if (!pool.length) return null;
  const unowned = pool.filter((c) => !ownedCardIds.includes(c.id));
  const choose = unowned.length ? unowned : pool;
  return choose[Math.floor(rng() * choose.length)].id;
}

function rollOne(prob, rng) {
  const r = rng();
  let acc = 0;
  for (const rarity of RARITIES) {
    acc += prob[rarity] || 0;
    if (r * 100 < acc) return rarity;
  }
  return 'N';
}

// packType: 'normal' | 'premium' | 'limited'
// opts: { count, consecutiveWithoutGuarantee }
function drawPack(packType, ownedCardIds, opts = {}, rng = Math.random) {
  const pack = config.gacha().cardPacks[packType];
  if (!pack) throw new Error('unknown pack ' + packType);
  const n = opts.count || 1;
  let miss = opts.consecutiveWithoutGuarantee || 0;
  const results = [];

  for (let i = 0; i < n; i++) {
    miss += 1;
    let rarity;
    if (packType === 'limited') {
      // 限定卡包：SR 为基础，20% 升级为 SSR（PRD 限定SR:100% 限定SSR:20% 的合理解读）
      rarity = rng() < 0.2 ? 'SSR' : 'SR';
    } else {
      rarity = rollOne(pack.prob, rng);
    }
    if (miss >= pack.pity.count) rarity = pack.pity.guarantee;
    const cardId = pickAny(rarity, ownedCardIds, rng);
    const isDuplicate = cardId ? ownedCardIds.includes(cardId) : false;
    const shards = isDuplicate ? (config.probabilities().shards.duplicateToShards[rarity] || 0) : 0;
    if (rarity === pack.pity.guarantee) miss = 0;
    results.push({ rarity, cardId, isDuplicate, shards, isNew: !isDuplicate });
  }
  return { results, nextConsecutiveWithoutGuarantee: miss };
}

module.exports = { drawPack, pickAny };
