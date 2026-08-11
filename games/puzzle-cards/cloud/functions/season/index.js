// cloud/functions/season/index.js
// M18 赛季积分榜（服务端权威，30 天赛季，无通行证）。
// action: 'current' | 'addPoints' | 'claim' | 'rank'
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');
const seasonModel = require('./model/season');
const { applyDrop } = require('./model/applyDrop');
const gacha = require('./model/gacha');

// 赛季纪元（固定），30 天一赛季（拼拼卡决策）
const EPOCH = Date.UTC(2024, 0, 1); // 2024-01-01 UTC
const SEASON_LEN = 30 * 24 * 3600 * 1000;
const DAILY_EXP_CAP = 100; // 赛季每日经验上限（通行证已移除）

function currentSeasonId(now) {
  return Math.floor((now - EPOCH) / SEASON_LEN);
}

// 通用奖励发放（coins/shards/diamonds/decoration/card/cardPack）
async function grantReward(openid, reward) {
  if (!reward) return;
  const db = dbm.getDB();
  const cur = {};
  if (reward.coins) cur.coins = db.command.inc(reward.coins);
  if (reward.shards) cur.shards = db.command.inc(reward.shards);
  if (reward.diamonds) cur.diamonds = db.command.inc(reward.diamonds);
  if (Object.keys(cur).length) {
    cur.updatedAt = Date.now();
    await dbm.collection('user_currency').where({ _openid: openid }).update({ data: cur });
  }
  if (reward.decoration) {
    await dbm.collection('decorations').add({ data: { _openid: openid, decorationId: reward.decoration, source: 'season', ts: Date.now() } });
  }
  if (reward.card) {
    const def = config.cards().find((c) => c.id === reward.card);
    if (def) await applyDrop(openid, def.seriesId, { isNew: true, cardId: reward.card, rarity: def.rarity, shards: 0, isDuplicate: false, isHidden: false });
  }
  if (reward.cardPack) {
    const owned = (await dbm.collection('cards_owned').where({ _openid: openid }).get()).data.map((c) => c.cardId);
    const pack = gacha.drawPack(reward.cardPack, owned, { count: 1 }, Math.random);
    for (const r of pack.results) {
      if (r.cardId) {
        const def = config.cards().find((c) => c.id === r.cardId);
        await applyDrop(openid, def ? def.seriesId : null, r);
      } else if (r.shards > 0) {
        await dbm.collection('user_currency').where({ _openid: openid }).update({ data: { shards: db.command.inc(r.shards), updatedAt: Date.now() } });
      }
    }
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action, events, level } = event;
  const db = dbm.getDB();
  const users = dbm.collection('users');
  const seasons = dbm.collection('seasons');

  if (action === 'current' || !action) {
    const now = Date.now();
    const seasonId = currentSeasonId(now);
    const startAt = EPOCH + seasonId * SEASON_LEN;
    return resp.ok({ seasonId, startAt, endAt: startAt + SEASON_LEN });
  }

  if (action === 'addPoints') {
    if (!Array.isArray(events)) return resp.fail(resp.E.PARAM, 'events required');
    const pts = seasonModel.addPoints(events);
    const seasonId = currentSeasonId(Date.now());

    // 每日经验上限（PRD 季票日上限 100），追踪 users.seasonExpDate
    const user = (await users.where({ _openid: OPENID }).get()).data[0];
    if (!user) return resp.fail(resp.E.NOT_FOUND, 'user');
    const today = new Date().toISOString().slice(0, 10);
    const todayExp = user.seasonExpDate === today ? (user.seasonExpToday || 0) : 0;
    const remaining = Math.max(0, DAILY_EXP_CAP - todayExp);
    const expAdd = Math.min(pts, remaining);
    const newTodayExp = todayExp + expAdd;
    await users.doc(user._id).update({ data: { seasonExpDate: today, seasonExpToday: newTodayExp } });

    const cur = (await seasons.where({ _openid: OPENID, seasonId }).get()).data[0];
    if (cur) {
      const newPoints = (cur.points || 0) + pts;
      const newLevel = Math.floor(newPoints / 100);
      await seasons.doc(cur._id).update({
        data: { points: db.command.inc(pts), exp: db.command.inc(expAdd), level: newLevel, seasonId, updatedAt: Date.now() },
      });
      return resp.ok({ seasonId, points: newPoints, exp: (cur.exp || 0) + expAdd, level: newLevel, expAdd, capped: expAdd < pts });
    }
    const lvl = Math.floor(pts / 100);
    await seasons.add({ data: { _openid: OPENID, seasonId, points: pts, exp: expAdd, level: lvl, claimedLevels: [], updatedAt: Date.now() } });
    return resp.ok({ seasonId, points: pts, exp: expAdd, level: lvl, expAdd, capped: false });
  }

  // 拼拼卡决策：无通行证（seasonPass 已移除），claim 动作一期不提供。

  // 全服赛季榜：拼拼卡决策列为二期，一期仅提供个人赛季进度（current / addPoints）。
  if (action === 'rank') {
    return resp.ok({ available: false, message: '全服赛季榜将于二期开放' });
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};
