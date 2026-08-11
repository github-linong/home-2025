// cloud/functions/collection/index.js
// M05 图鉴收集：进度查询 + 碎片兑换指定卡（服务端权威）。
// action: 'get' | 'exchange'；exchange 需 { rarity, cardId }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');
const shard = require('./model/shardExchange');
const { applyDrop } = require('./model/applyDrop');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action, rarity, cardId } = event;

  const cur = (await dbm.collection('user_currency').where({ _openid: OPENID }).get()).data[0];
  const owned = (await dbm.collection('cards_owned').where({ _openid: OPENID }).get()).data;
  const ownedIds = owned.map((c) => c.cardId);

  if (action === 'get' || !action) {
    const series = config.seriesMeta();
    const progress = {};
    for (const sid of Object.keys(series)) {
      const all = series[sid].cards.filter((c) => !c.hidden);
      const collected = all.filter((c) => ownedIds.includes(c.id)).length;
      progress[sid] = { name: series[sid].name, collected, total: all.length, pct: all.length ? Math.round((collected / all.length) * 100) : 0 };
    }
    const totalScore = owned.reduce((s, c) => {
      const def = config.cards().find((x) => x.id === c.cardId);
      return s + (def ? def.baseScore : 0);
    }, 0);
    return resp.ok({ progress, totalCollected: ownedIds.length, totalScore, currency: cur, owned: ownedIds });
  }

  if (action === 'exchange') {
    if (!rarity || !cardId) return resp.fail(resp.E.PARAM, 'missing rarity/cardId');
    if (!shard.isExchangeable(rarity)) return resp.fail(resp.E.PARAM, 'not exchangeable');
    const cardDef = config.cards().find((c) => c.id === cardId);
    if (!cardDef || cardDef.rarity !== rarity) return resp.fail(resp.E.PARAM, 'card mismatch');
    if (ownedIds.includes(cardId)) return resp.fail(resp.E.CONFLICT, 'already owned');
    const cost = shard.exchangeCost(rarity);
    if ((cur.shards || 0) < cost) return resp.fail(resp.E.LIMIT, 'not enough shards');
    const db = dbm.getDB();
    await dbm.collection('user_currency').where({ _openid: OPENID }).update({ data: { shards: db.command.inc(-cost), updatedAt: Date.now() } });
    await applyDrop(OPENID, cardDef.seriesId, { isNew: true, cardId, rarity, shards: 0, isDuplicate: false, isHidden: false });
    return resp.ok({ exchanged: cardId, cost });
  }
  return resp.fail(resp.E.PARAM, 'unknown action');
};
