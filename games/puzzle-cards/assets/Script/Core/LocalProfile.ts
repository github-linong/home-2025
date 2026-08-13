// cocos/assets/Script/Core/LocalProfile.ts
// 无服务端版本的本地存档：关卡进度、星级、集卡、碎片、抽卡频控。
// 在微信小游戏环境下持久化到 wx.storage；在编辑器/浏览器预览则内存运行，不阻断测试。
import { Storage } from './Storage';

const KEY = 'ppk_profile_v1';

export interface LevelRecord {
  star: number;
  bestTimeSec: number;
  completedAt: number;
}

export interface CardRecord {
  obtainedAt: number;
  source: string;
}

export interface Profile {
  version: number;
  installAt: number;
  levels: Record<string, LevelRecord>;
  cards: Record<string, CardRecord>;
  currency: { shards: number };
  gacha: { date: string; count: number; pity: number };
  stats: { totalPlaySec: number; totalCompleted: number };
}

let cache: Profile | null = null;

export function emptyProfile(): Profile {
  return {
    version: 1,
    installAt: Date.now(),
    levels: {},
    cards: {},
    currency: { shards: 0 },
    gacha: { date: todayStr(), count: 0, pity: 0 },
    stats: { totalPlaySec: 0, totalCompleted: 0 },
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): Profile {
  if (cache) return cache;
  const saved = Storage.get<Profile | null>(KEY, null);
  if (saved && saved.version) {
    cache = saved;
    return cache;
  }
  cache = emptyProfile();
  save(cache);
  return cache;
}

function save(p: Profile): void {
  cache = p;
  Storage.set(KEY, p);
}

export function getProfile(): Profile {
  return load();
}

export function resetProfile(): Profile {
  const fresh = emptyProfile();
  save(fresh);
  return fresh;
}

// 关卡
export function getLevelRecord(levelId: string): LevelRecord | null {
  return load().levels[levelId] || null;
}

export function isLevelUnlocked(levelId: string, allLevelIds: string[]): boolean {
  const idx = allLevelIds.indexOf(levelId);
  if (idx <= 0) return true;
  return !!load().levels[allLevelIds[idx - 1]];
}

export function getTotalStars(allLevelIds: string[]): number {
  const p = load();
  let sum = 0;
  allLevelIds.forEach((id) => {
    const r = p.levels[id];
    if (r) sum += r.star;
  });
  return sum;
}

export function setLevelResult(levelId: string, star: number, timeSec: number): void {
  const p = load();
  const prev = p.levels[levelId];
  p.levels[levelId] = {
    star: Math.max(prev ? prev.star : 0, Math.min(3, star)),
    bestTimeSec: prev ? Math.min(prev.bestTimeSec, timeSec) : timeSec,
    completedAt: Date.now(),
  };
  p.stats.totalCompleted += 1;
  save(p);
}

// 卡牌
export function ownCard(cardId: string, source: string): boolean {
  const p = load();
  if (p.cards[cardId]) return false;
  p.cards[cardId] = { obtainedAt: Date.now(), source };
  save(p);
  return true;
}

export function hasCard(cardId: string): boolean {
  return !!load().cards[cardId];
}

export function getOwnedCardIds(): string[] {
  return Object.keys(load().cards);
}

export function getTotalCards(): number {
  return getOwnedCardIds().length;
}

// 碎片/货币
export function getShards(): number {
  return load().currency.shards;
}

export function addShards(n: number): void {
  const p = load();
  p.currency.shards = Math.max(0, (p.currency.shards || 0) + n);
  save(p);
}

// 抽卡频控
export function getGachaCountToday(): number {
  const p = load();
  if (p.gacha.date !== todayStr()) {
    p.gacha.date = todayStr();
    p.gacha.count = 0;
    save(p);
    return 0;
  }
  return p.gacha.count || 0;
}

export function incGachaCount(): void {
  const p = load();
  if (p.gacha.date !== todayStr()) {
    p.gacha.date = todayStr();
    p.gacha.count = 0;
  }
  p.gacha.count += 1;
  p.gacha.pity += 1;
  save(p);
}

export function getPity(): number {
  return load().gacha.pity || 0;
}

export function resetPity(): void {
  const p = load();
  p.gacha.pity = 0;
  save(p);
}

// 把本地档案转成 Session.getMe 需要的 me 对象，保持与云端 me 同构。
export function toMeObject(): any {
  const p = load();
  return {
    openid: 'local-player',
    stats: {
      totalCards: getTotalCards(),
      totalStars: 0,
      totalCompleted: p.stats.totalCompleted,
      totalPlaySec: p.stats.totalPlaySec,
    },
    currency: { shards: getShards() },
    gacha: { ...p.gacha },
  };
}
