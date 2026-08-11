// cloud/functions/cardDrop/index.js
// M04 卡牌掉落（服务端权威）。可被 levelComplete 复用，也可用于缺卡求助的定向抽取。
// 入参：{ seriesId, difficultyStars, starRating, isFirstClear, isBoss, isHiddenLevel, forceRarity? }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');
const cardDrop = require('./model/cardDrop');
const { applyDrop } = require('./model/applyDrop');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { seriesId, difficultyStars, starRating, isFirstClear, isBoss, isHiddenLevel } = event;
  if (!seriesId || !difficultyStars) return resp.fail(resp.E.PARAM, 'missing seriesId/difficultyStars');

  const owned = (await dbm.collection('cards_owned').where({ _openid: OPENID }).get()).data.map((c) => c.cardId);
  const pity = (await dbm.collection('pity_state').where({ _openid: OPENID }).get()).data[0] || { levelPity: {} };
  // 定向抽取（缺卡求助）：该系列保底概率提升已在调用方通过 higher rarity 模拟，此处走正常掉卡
  const roll = cardDrop.rollCard({
    seriesId, difficultyStars, starRating, isFirstClear, isBoss, isHiddenLevel,
    ownedCardIds: owned,
    pityMiss: pity.levelPity[seriesId] || 0,
  }, Math.random);

  await applyDrop(OPENID, seriesId, roll);
  // 更新保底状态
  await dbm.collection('pity_state').where({ _openid: OPENID }).update({
    data: { [`levelPity.${seriesId}`]: roll.nextPityMiss, updatedAt: Date.now() },
  });
  return resp.ok(roll);
};
