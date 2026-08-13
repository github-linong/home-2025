// cocos/assets/Script/Core/LocalGacha.ts
// 无服务端版本的本地抽卡：按稀有度权重掉落，本地保底与每日上限，结果写入 LocalProfile。
import { getDefaultConfig } from './Config';
import { getProfile, ownCard, addShards, incGachaCount, getGachaCountToday, getPity, resetPity } from './LocalProfile';

export interface GachaResult {
  cardId: string;
  rarity: string;
  isNew: boolean;
  isDuplicate: boolean;
  shards: number;
}

const FREE_DAILY_CAP = 2;
const PITY_THRESHOLD = 30;

// 普通卡包权重（隐藏卡不在常规池）。
const WEIGHTS: Record<string, number> = {
  N: 700,
  R: 200,
  SR: 80,
  SSR: 20,
};

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function weightedDraw(pool: any[]): any | null {
  const total = pool.reduce((s, c) => s + (WEIGHTS[c.rarity] || 0), 0);
  if (total <= 0) return null;
  let roll = randomInt(total);
  for (const c of pool) {
    const w = WEIGHTS[c.rarity] || 0;
    if (roll < w) return c;
    roll -= w;
  }
  return pool[pool.length - 1];
}

export function canFreeDrawToday(): boolean {
  return getGachaCountToday() < FREE_DAILY_CAP;
}

export function freeDrawLeft(): number {
  return Math.max(0, FREE_DAILY_CAP - getGachaCountToday());
}

export function performFreeDraw(): { results: GachaResult[]; cost: number; pity: number } {
  if (!canFreeDrawToday()) {
    return { results: [], cost: 0, pity: getPity() };
  }

  const catalog = getDefaultConfig().cards || [];
  const pool = catalog.filter((c: any) => !c.hidden);

  let card: any;
  if (getPity() + 1 >= PITY_THRESHOLD) {
    const ssrPool = pool.filter((c: any) => c.rarity === 'SSR');
    card = ssrPool[randomInt(ssrPool.length)] || weightedDraw(pool);
  } else {
    card = weightedDraw(pool);
  }

  incGachaCount();

  if (!card) {
    return { results: [], cost: 0, pity: getPity() };
  }

  if (card.rarity === 'SSR') resetPity();

  const isNew = ownCard(card.id, 'gacha_free');
  const shards = isNew ? 0 : (card.baseScore || 10);
  if (!isNew) addShards(shards);

  const result: GachaResult = {
    cardId: card.id,
    rarity: card.rarity,
    isNew,
    isDuplicate: !isNew,
    shards,
  };

  return { results: [result], cost: 0, pity: getPity() };
}
