// test/core.test.js
// 核心算法单测。运行：node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');

const cardDrop = require('../cloud/model/cardDrop');
const config = require('../cloud/model/config');
const { computeStar, dailyChallengeScore } = require('../cloud/model/scoring');
const shard = require('../cloud/model/shardExchange');
const ac = require('../cloud/model/antiCheat');
const gacha = require('../cloud/model/gacha');
const { addPoints } = require('../cloud/model/season');
const signin = require('../cloud/model/signin');
const dailyTask = require('../cloud/model/dailyTask');
const ad = require('../cloud/model/adControl');
const invite = require('../cloud/model/invite');

// ---- 配置计数 ----
test('config counts match PRD', () => {
  const cards = config.cards();
  assert.equal(cards.filter((c) => !c.hidden).length, 68);
  assert.equal(cards.filter((c) => c.hidden).length, 5);
  const levels = config.levels();
  assert.equal(levels.filter((l) => !l.isHiddenChapter).length, 60);
  assert.equal(levels.filter((l) => l.isHiddenChapter).length, 0);
});

// ---- 掉卡保底 ----
test('pity forces max rarity after threshold', () => {
  const alwaysLow = () => 0; // 永远抽最低档
  // 1星最高稀有度是 R；pityMiss=5 应强制 R
  const r = cardDrop.rollCard({ seriesId: 'flower', difficultyStars: 1, ownedCardIds: [], pityMiss: 5, isHiddenLevel: false }, alwaysLow);
  assert.equal(r.rarity, 'R');
  assert.equal(r.nextPityMiss, 0);
  // pityMiss=4 不强制，应抽到最低 N
  const r2 = cardDrop.rollCard({ seriesId: 'flower', difficultyStars: 1, ownedCardIds: [], pityMiss: 4, isHiddenLevel: false }, alwaysLow);
  assert.equal(r2.rarity, 'N');
  assert.equal(r2.nextPityMiss, 5);
});

test('boss guarantees >= SR', () => {
  const alwaysLow = () => 0;
  const r = cardDrop.rollCard({ seriesId: 'flower', difficultyStars: 3, isBoss: true, ownedCardIds: [], pityMiss: 0 }, alwaysLow);
  assert.ok(['SR', 'SSR'].includes(r.rarity));
});

test('3-star guarantees >= R', () => {
  const alwaysLow = () => 0;
  const r = cardDrop.rollCard({ seriesId: 'flower', difficultyStars: 1, starRating: 3, ownedCardIds: [], pityMiss: 0 }, alwaysLow);
  assert.ok(['R', 'SR', 'SSR'].includes(r.rarity));
});

test('duplicate converts to shards', () => {
  const allIds = config.cards().map((c) => c.id);
  const r = cardDrop.rollCard({ seriesId: 'flower', difficultyStars: 1, starRating: 2, ownedCardIds: allIds, pityMiss: 4, isHiddenLevel: false }, () => 0);
  // 抽到 N，且已拥有 → 重复
  assert.equal(r.rarity, 'N');
  assert.equal(r.isDuplicate, true);
  assert.equal(r.shards, shard.duplicateToShards('N'));
});

test('hidden level may drop hidden card', () => {
  let sawHidden = false;
  for (let i = 0; i < 200; i++) {
    const r = cardDrop.rollCard({ seriesId: 'flower', difficultyStars: 5, ownedCardIds: [], pityMiss: 0, isHiddenLevel: true }, Math.random);
    if (r.isHidden) { sawHidden = true; break; }
  }
  assert.ok(sawHidden, '200 次内应至少出现 1 次隐藏卡 (5% 概率)');
});

// ---- 评级 ----
test('star rating', () => {
  assert.equal(computeStar({ stdTimeSec: 60, usedTimeSec: 200, hintsUsed: 0 }), 1);
  assert.equal(computeStar({ stdTimeSec: 60, usedTimeSec: 80, hintsUsed: 3 }), 2);
  assert.equal(computeStar({ stdTimeSec: 60, usedTimeSec: 50, hintsUsed: 0 }), 3);
  assert.equal(computeStar({ stdTimeSec: 60, usedTimeSec: 90, hintsUsed: 0 }), 2); // 60*1.5=90 边界
});

// ---- 反作弊 ----
test('anti-cheat time validation', () => {
  // 5 星 36 片：理论最短 18s，下限 9s；8s 应判无效
  assert.equal(ac.validateTime({ usedTimeSec: 8, difficultyStars: 5 }).ok, false);
  assert.equal(ac.validateTime({ usedTimeSec: 20, difficultyStars: 5 }).ok, true);
  assert.equal(ac.validateFrequency(11).ok, false);
  assert.equal(ac.validateFrequency(9).ok, true);
});

// ---- 碎片兑换 ----
test('shard exchange rules', () => {
  assert.equal(shard.exchangeCost('HIDDEN'), -1);
  assert.equal(shard.isExchangeable('HIDDEN'), false);
  assert.equal(shard.canExchange(5, 'N'), false); // N 需 10
  assert.equal(shard.canExchange(10, 'N'), true);
});

// ---- 抽卡保底 ----
test('gacha normal pack 10-pull guarantees SR', () => {
  const owned = [];
  const { results } = gacha.drawPack('normal', owned, { count: 10 }, () => 0); // 全最低 N
  assert.equal(results.length, 10);
  assert.equal(results[9].rarity, 'SR'); // 第 10 抽必出保底
});

test('gacha limited pack every pull is SR/SSR', () => {
  const { results } = gacha.drawPack('limited', [], { count: 5 }, Math.random);
  for (const r of results) assert.ok(['SR', 'SSR'].includes(r.rarity));
});

// ---- 赛季积分 ----
test('season points', () => {
  const p = addPoints([{ type: 'levelClear', stars: 3, firstClear: true, threeStar: true }, { type: 'newCard', rarity: 'SSR' }]);
  // 3星: 30 *1.2 *1.5 = 54；SSR:200 → 254
  assert.equal(p, 254);
});

// ---- 签到 ----
test('signin week bonus', () => {
  const r7 = signin.getReward(7, true);
  assert.equal(r7.cardPack, 'premium', '首周第7天含限定卡包（替代外观奖励）');
  const r1 = signin.getReward(1, false);
  assert.equal(r1.coins, 100);
});

// ---- 每日任务 ----
test('daily task evaluate', () => {
  const tasks = dailyTask.evaluate({ levelClear: 3, newCard: 1, social: 0 });
  const t1 = tasks.find((t) => t.id === 'task_01');
  assert.equal(t1.done, true);
  const t3 = tasks.find((t) => t.id === 'task_03');
  assert.equal(t3.done, false);
});

// ---- 广告频控 ----
test('ad frequency cap', () => {
  assert.equal(ad.canShow({ todayCount: 15 }).ok, false);
  assert.equal(ad.canShow({ todayCount: 0, lastAdTs: Date.now(), now: Date.now() }).ok, false); // 间隔不足
  assert.equal(ad.canShow({ todayCount: 0, lastAdTs: 0, now: Date.now() }).ok, true);
  assert.equal(ad.canShow({ userRemoveAds: true }).ok, false);
});

// ---- 邀请里程碑 ----
test('invite milestones', () => {
  const crossed = invite.newlyCrossed(0, 3);
  assert.ok(crossed.some((m) => m.count === 1));
  assert.ok(crossed.some((m) => m.count === 3));
  assert.ok(!crossed.some((m) => m.count === 5));
});
