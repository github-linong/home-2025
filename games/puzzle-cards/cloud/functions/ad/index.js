// cloud/functions/ad/index.js
// M11 广告（服务端权威，PRD 12.2 / 12.3）。
// action: 'show' { adType }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const adControl = require('./model/adControl');
const cardDrop = require('./model/cardDrop');
const { applyDrop } = require('./model/applyDrop');

const AD_TYPES = ['extraChance', 'revive', 'hint', 'doubleCoin', 'freePack', 'shardDiscount'];
const SHARD_DISCOUNT_MS = 24 * 3600 * 1000;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action, adType } = event;
  if (action !== 'show') return resp.fail(resp.E.PARAM, 'unknown action');
  if (!AD_TYPES.includes(adType)) return resp.fail(resp.E.PARAM, 'unknown adType');

  const users = dbm.collection('users');
  const user = (await users.where({ _openid: OPENID }).get()).data[0];
  if (!user) return resp.fail(resp.E.NOT_FOUND, 'user');

  // 新用户前 3 关保护（PRD 12.3）
  if (adControl.inNewUserProtect(user.levelsCleared || 0)) {
    return resp.fail(resp.E.LIMIT, 'new user protect');
  }

  const today = todayStr();
  const adLog = (await dbm.collection('ads_log').where({ _openid: OPENID, date: today }).get()).data[0];
  const todayCount = (adLog && adLog.count) || 0;

  const now = Date.now();
  const check = adControl.canShow({
    todayCount, lastAdTs: user.lastAdTs || 0, userRemoveAds: user.removedAds || false, now,
  });
  if (!check.ok) return resp.fail(resp.E.LIMIT, check.reason);

  // 发放奖励（PRD 12.2）
  const granted = { adType };
  const db = dbm.getDB();
  const userUpdate = { lastAdTs: now, updatedAt: now };

  switch (adType) {
    case 'extraChance':
      userUpdate.puzzleChances = db.command.inc(2);
      granted.puzzleChances = 2;
      break;
    case 'revive':
      userUpdate.revives = db.command.inc(1);
      granted.revives = 1;
      break;
    case 'hint':
      userUpdate.hintChances = db.command.inc(1);
      granted.hintChances = 1;
      break;
    case 'doubleCoin':
      userUpdate.lastDoubleCoinEligible = now;
      granted.doubleCoin = true;
      break;
    case 'freePack': {
      const owned = (await dbm.collection('cards_owned').where({ _openid: OPENID }).get()).data.map((c) => c.cardId);
      const roll = cardDrop.rollCard({
        seriesId: 'flower', difficultyStars: 1, starRating: 3, isFirstClear: false,
        isBoss: false, isHiddenLevel: false, ownedCardIds: owned, pityMiss: 0,
      }, Math.random);
      await applyDrop(OPENID, 'flower', roll);
      granted.card = { cardId: roll.cardId, rarity: roll.rarity };
      break;
    }
    case 'shardDiscount':
      userUpdate.shardDiscountUntil = now + SHARD_DISCOUNT_MS;
      granted.shardDiscountUntil = userUpdate.shardDiscountUntil;
      break;
  }

  await users.doc(user._id).update({ data: userUpdate });

  // ads_log 计数（upsert）
  if (adLog) {
    await dbm.collection('ads_log').doc(adLog._id).update({
      data: { count: db.command.inc(1), records: db.command.push({ adType, ts: now }), updatedAt: now },
    });
  } else {
    await dbm.collection('ads_log').add({
      data: { _openid: OPENID, date: today, count: 1, records: [{ adType, ts: now }], createdAt: now, updatedAt: now },
    });
  }

  return resp.ok(granted);
};
