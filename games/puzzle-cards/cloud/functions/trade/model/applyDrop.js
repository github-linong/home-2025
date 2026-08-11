// cloud/model/applyDrop.js
// 把一次掉卡结果持久化到云数据库（cards_owned / collection / user_currency）。
// 仅服务端云函数调用，单测不覆盖（依赖 db）。
const dbm = require('./db');

async function applyDrop(openid, seriesId, roll) {
  const db = dbm.getDB();
  const cmd = db.command;
  if (roll.isNew && roll.cardId) {
    await db.collection('cards_owned').add({
      data: { _openid: openid, cardId: roll.cardId, seriesId, count: 1, firstGotAt: Date.now() },
    });
    await db.collection('collection').where({ _openid: openid }).update({
      data: { totalCollected: cmd.inc(1), updatedAt: Date.now() },
    });
    await updateSeriesProgress(openid, seriesId);
  } else if (roll.shards > 0) {
    await db.collection('user_currency').where({ _openid: openid }).update({
      data: { shards: cmd.inc(roll.shards), updatedAt: Date.now() },
    });
  }
  return roll;
}

// 重新计算某系列收集进度（仅普通卡计入）
async function updateSeriesProgress(openid, seriesId) {
  const db = dbm.getDB();
  const config = require('./config');
  const seriesCards = config.cardsBySeries(seriesId).filter((c) => !c.hidden).map((c) => c.id);
  const owned = await db.collection('cards_owned')
    .where({ _openid: openid, cardId: db.command.in(seriesCards) })
    .get();
  const collected = owned.data.length;
  const total = seriesCards.length;
  await db.collection('collection').where({ _openid: openid }).update({
    data: {
      [`seriesProgress.${seriesId}`]: { collected, total, pct: total ? Math.round((collected / total) * 100) : 0 },
      updatedAt: Date.now(),
    },
  });
}

module.exports = { applyDrop, updateSeriesProgress };
