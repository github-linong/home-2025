// cloud/functions/tutorial/index.js
// M06 新手引导：步骤记录 + 完成发放引导奖励（1张R卡 + 200金币 + 2次拼图次数，PRD 7.2）。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');
const { applyDrop } = require('./model/applyDrop');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action, step } = event;
  const users = dbm.collection('users');
  const user = (await users.where({ _openid: OPENID }).get()).data[0];
  if (!user) return resp.fail(resp.E.NOT_FOUND, 'user');

  if (action === 'step') {
    await users.doc(user._id).update({ data: { tutorialStep: step || 0 } });
    return resp.ok({ tutorialStep: step || 0 });
  }
  if (action === 'complete') {
    if (user.tutorialDone) return resp.ok({ alreadyDone: true });
    const rCard = config.cardsByRarity('flower', 'R')[0];
    const db = dbm.getDB();
    if (rCard) {
      await applyDrop(OPENID, 'flower', { isNew: true, cardId: rCard.id, rarity: 'R', shards: 0, isDuplicate: false, isHidden: false });
    }
    await dbm.collection('user_currency').where({ _openid: OPENID }).update({
      data: { coins: db.command.inc(200), puzzleChances: db.command.inc(2), updatedAt: Date.now() },
    });
    await users.doc(user._id).update({ data: { tutorialDone: true, tutorialStep: 8 } });
    return resp.ok({ reward: { cardId: rCard && rCard.id, coins: 200, puzzleChances: 2 } });
  }
  return resp.fail(resp.E.PARAM, 'unknown action');
};
