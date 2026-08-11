// cloud/functions/levelComplete/index.js
// M02/M03 拼图结算（服务端权威）：反作弊校验 → 评级 → 奖励 → 掉卡 → 解锁进度。
// 入参：{ levelId, usedTimeSec, hintsUsed, pieceHash, abandon?, socialInvite? }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');
const { computeStar } = require('./model/scoring');
const cardDrop = require('./model/cardDrop');
const { applyDrop } = require('./model/applyDrop');
const ac = require('./model/antiCheat');

async function isCleared(openid, levelId) {
  const p = await dbm.collection('user_progress').where({ _openid: openid }).get();
  return p.data.length && (p.data[0].clearedLevels || []).includes(levelId);
}
function computeReward(star, level) {
  return { coins: star * 10 + level.difficultyStars * 5, shards: star >= 3 ? 2 : 0 };
}
async function grantReward(openid, reward) {
  const db = dbm.getDB();
  const data = { updatedAt: Date.now() };
  if (reward.coins) data.coins = db.command.inc(reward.coins);
  if (reward.shards) data.shards = db.command.inc(reward.shards);
  await dbm.collection('user_currency').where({ _openid: openid }).update({ data });
}
async function getPity(openid, levelId) {
  const p = await dbm.collection('pity_state').where({ _openid: openid }).get();
  return (p.data[0] && p.data[0].levelPity[levelId]) || 0;
}
async function setPity(openid, levelId, miss) {
  await dbm.collection('pity_state').where({ _openid: openid }).update({
    data: { [`levelPity.${levelId}`]: miss, updatedAt: Date.now() },
  });
}
// 解锁下一关：顺序解锁，maxUnlockedOrder = 已通关最大 order + 1；同时记录星级与最佳用时
async function unlockNext(openid, level, star, usedTimeSec) {
  const prog = (await dbm.collection('user_progress').where({ _openid: openid }).get()).data[0];
  if (!prog) return;
  const cleared = new Set(prog.clearedLevels || []);
  cleared.add(level.id);
  const stars = { ...(prog.stars || {}) };
  stars[level.id] = Math.max(stars[level.id] || 0, star);
  const bestTime = { ...(prog.bestTime || {}) };
  if (usedTimeSec != null) {
    const prev = bestTime[level.id];
    bestTime[level.id] = prev == null ? usedTimeSec : Math.min(prev, usedTimeSec);
  }
  const maxUnlockedOrder = Math.max(prog.maxUnlockedOrder || 0, level.order + 1);
  await dbm.collection('user_progress').doc(prog._id).update({
    data: { clearedLevels: Array.from(cleared), stars, bestTime, maxUnlockedOrder, updatedAt: Date.now() },
  });
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { levelId, usedTimeSec, hintsUsed, pieceHash, abandon } = event;
  const level = config.levelById(levelId);
  if (!level) return resp.fail(resp.E.NOT_FOUND, 'level not found');
  if (abandon) return resp.ok({ abandoned: true });

  // 反作弊：用时合理性
  const tCheck = ac.validateTime({ usedTimeSec, difficultyStars: level.difficultyStars });
  if (!tCheck.ok) return resp.fail(resp.E.CHEAT, tCheck.reason);

  // 重复提交拦截（同关卡 + 碎片hash，1 分钟内仅取第一次）
  const key = ac.submitKey(levelId, pieceHash);
  const dup = await dbm.collection('anti_cheat_logs').where({
    _openid: OPENID, type: 'submit', key,
    ts: dbm.getDB().command.gt(Date.now() - 60000),
  }).get();
  if (dup.data.length) return resp.fail(resp.E.CONFLICT, 'duplicate submit');
  await dbm.collection('anti_cheat_logs').add({ data: { _openid: OPENID, type: 'submit', key, ts: Date.now() } });

  const star = computeStar({ stdTimeSec: level.stdTimeSec, usedTimeSec, hintsUsed });
  const isFirstClear = !(await isCleared(OPENID, levelId));

  // 奖励
  const reward = computeReward(star, level);
  await grantReward(OPENID, reward);

  // 掉卡（服务端权威）
  const owned = (await dbm.collection('cards_owned').where({ _openid: OPENID }).get()).data.map((c) => c.cardId);
  const pity = await getPity(OPENID, levelId);
  const roll = cardDrop.rollCard({
    seriesId: level.seriesId,
    difficultyStars: level.difficultyStars,
    starRating: star,
    isFirstClear,
    isBoss: level.isBoss,
    isHiddenLevel: level.isHiddenChapter,
    ownedCardIds: owned,
    pityMiss: pity,
  }, Math.random);
  await applyDrop(OPENID, level.seriesId, roll);
  await setPity(OPENID, levelId, roll.nextPityMiss);

  // 进度 / 解锁
  await unlockNext(OPENID, level, star, usedTimeSec);

  // 每日任务进度（完成拼图 / 获得新卡）
  await bumpDaily(OPENID, { levelClear: 1, newCard: roll.isNew ? 1 : 0 });

  return resp.ok({
    star, isFirstClear, reward, card: roll, levelId,
    unlockedNext: level.order + 1,
  });
};

// 更新每日任务今日计数
async function bumpDaily(openid, metrics) {
  const db = dbm.getDB();
  const today = new Date().toISOString().slice(0, 10);
  const rec = (await dbm.collection('daily_tasks').where({ _openid: openid }).get()).data[0];
  if (!rec || rec.date !== today) {
    const data = { _openid: openid, date: today, metrics: { ...metrics }, claimed: {}, lastReset: Date.now() };
    if (rec) await dbm.collection('daily_tasks').doc(rec._id).update({ data });
    else await dbm.collection('daily_tasks').add({ data });
    return;
  }
  const m = { ...rec.metrics, levelClear: (rec.metrics.levelClear || 0) + (metrics.levelClear || 0), newCard: (rec.metrics.newCard || 0) + (metrics.newCard || 0) };
  await dbm.collection('daily_tasks').doc(rec._id).update({ data: { metrics: m, lastReset: Date.now() } });
}
