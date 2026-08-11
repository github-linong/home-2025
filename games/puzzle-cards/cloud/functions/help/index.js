// cloud/functions/help/index.js
// M09 缺卡求助/助力（服务端权威，PRD 10.2）。
// 规则：每日被助力上限 3；每日助力他人上限 5；同一好友同卡只能助力 1 次；
//      新用户需完成 3 关才能助力他人(levelsCleared>=3)。助力者奖励 +1 拼图机会(H-005)。
// 求助者：若未拥有该卡则直接补发（applyDrop isNew），已拥有则折算碎片。补卡概率窗口(24h)记录在请求上。
// action: 'request' | 'respond'
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');
const { applyDrop } = require('./model/applyDrop');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action, cardId, seriesId, requestId } = event;

  // 发起求助
  if (action === 'request') {
    if (!cardId || !seriesId) return resp.fail(resp.E.PARAM, 'missing cardId/seriesId');
    const db = dbm.getDB();
    const today = todayStr();
    // 每日被助力上限 3：统计本人今日 open/responded 请求数
    const myReqs = await dbm.collection('help_requests').where({ fromOpenid: OPENID, date: today }).get();
    if (myReqs.data.length >= 3) return resp.fail(resp.E.LIMIT, 'daily help-received cap reached');
    const now = Date.now();
    await dbm.collection('help_requests').add({
      data: {
        fromOpenid: OPENID,
        cardId,
        seriesId,
        status: 'open',
        createdAt: now,
        date: today,
        helpers: [],
        boostedUntil: now + 24 * 3600 * 1000, // 定向抽取概率提升窗口
      },
    });
    return resp.ok({ requested: cardId });
  }

  // 助力响应
  if (action === 'respond') {
    if (!requestId) return resp.fail(resp.E.PARAM, 'missing requestId');
    const db = dbm.getDB();
    const today = todayStr();
    const req = (await dbm.collection('help_requests').doc(requestId).get()).data;
    if (!req) return resp.fail(resp.E.NOT_FOUND, 'request not found');
    if (req.status === 'done') return resp.fail(resp.E.CONFLICT, 'already done');
    if (OPENID === req.fromOpenid) return resp.fail(resp.E.PARAM, 'cannot help self');

    // 新用户需完成 3 关（levelsCleared>=3）才能助力他人
    const user = (await dbm.collection('users').where({ _openid: OPENID }).get()).data[0] || {};
    if ((user.levelsCleared || 0) < 3) {
      return resp.fail(resp.E.LIMIT, 'new user cannot help (need >=3 levels)');
    }
    // 同一好友同卡只能助力 1 次（helpers 数组命中即视为已助力）
    if ((req.helpers || []).includes(OPENID)) return resp.fail(resp.E.CONFLICT, 'already helped this request');

    // 每日助力他人上限 5
    const helped = await dbm.collection('help_requests')
      .where({ helpers: OPENID, date: today, status: 'done' })
      .get();
    if (helped.data.length >= 5) return resp.fail(resp.E.LIMIT, 'daily help-others cap reached');

    // 助力者 +1 拼图机会（H-005）
    await dbm.collection('user_currency').where({ _openid: OPENID }).update({
      data: { puzzleChances: db.command.inc(1), updatedAt: Date.now() },
    });

    // 求助者：未拥有则直接补卡，已拥有则折算碎片
    const cardDef = config.cards().find((c) => c.id === req.cardId);
    const rarity = cardDef ? cardDef.rarity : 'N';
    const owned = await dbm.collection('cards_owned')
      .where({ _openid: req.fromOpenid, cardId: req.cardId })
      .get();
    let grantedShards = 0;
    let cardGranted = false;
    if (!owned.data.length) {
      await applyDrop(req.fromOpenid, req.seriesId, {
        isNew: true,
        cardId: req.cardId,
        rarity,
        shards: 0,
        isDuplicate: false,
        isHidden: false,
      });
      cardGranted = true;
    } else {
      const P = config.probabilities();
      grantedShards = ((P.shards && P.shards.duplicateToShards && P.shards.duplicateToShards[rarity]) || 1);
      await dbm.collection('user_currency').where({ _openid: req.fromOpenid }).update({
        data: { shards: db.command.inc(grantedShards), updatedAt: Date.now() },
      });
    }

    // 标记完成 + 记录助力者 + 保留补卡窗口
    await dbm.collection('help_requests').doc(requestId).update({
      data: { status: 'done', helpers: db.command.push(OPENID), boostedUntil: req.boostedUntil },
    });
    return resp.ok({ cardId: req.cardId, cardGranted, grantedShards });
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};
