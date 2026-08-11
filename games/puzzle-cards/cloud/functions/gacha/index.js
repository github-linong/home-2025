// cloud/functions/gacha/index.js
// M17 抽卡 / 卡包（服务端权威）：扣费校验 → 读保底 → 跨系列抽取 → 发货 / 碎片返还。
// action: 'draw' { packType, count?, currency? } | 'freeAd' { packType? }
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');
const { applyDrop } = require('./model/applyDrop');
const { drawPack } = require('./model/gacha');

// 读取 / 写入 用户的卡包保底（存于 users.gachaPity[packType]）
async function getPity(openid, packType) {
  const u = (await dbm.collection('users').where({ _openid: openid }).get()).data[0];
  return (u && u.gachaPity && u.gachaPity[packType]) || 0;
}
async function setPity(openid, packType, miss) {
  await dbm.collection('users').where({ _openid: openid }).update({
    data: { [`gachaPity.${packType}`]: miss, updatedAt: Date.now() },
  });
}

// 核心抽取 + 发货。free=true 时不扣费（看广告免费包）。
async function drawPacks(openid, packType, count, free) {
  const db = dbm.getDB();
  const pack = config.gacha().cardPacks[packType];
  if (!pack) return resp.fail(resp.E.PARAM, 'unknown packType');
  const n = count || 1;

  const curRec = (await dbm.collection('user_currency').where({ _openid: openid }).get()).data[0];
  if (!curRec) return resp.fail(resp.E.NOT_FOUND, 'currency');

  // 确定扣费货币：优先 coins（若包含 priceCoin），否则 diamonds
  let cost = null;
  if (!free) {
    const useCoins = pack.priceCoin != null;
    const field = useCoins ? 'coins' : 'diamonds';
    const price = useCoins ? pack.priceCoin : pack.priceDiamond;
    if (price == null) return resp.fail(resp.E.PARAM, 'pack has no price');
    if ((curRec[field] || 0) < price * n) return resp.fail(resp.E.LIMIT, 'not enough ' + field);
    cost = { field, amount: price * n };
  }

  // 扣费（原子自增，负数）
  if (cost) {
    await dbm.collection('user_currency').where({ _openid: openid }).update({
      data: { [cost.field]: db.command.inc(-cost.amount), updatedAt: Date.now() },
    });
  }

  // 保底状态
  const pity = await getPity(openid, packType);
  const ownedIds = (await dbm.collection('cards_owned').where({ _openid: openid }).get()).data.map((c) => c.cardId);

  const draw = drawPack(packType, ownedIds, { count: n, consecutiveWithoutGuarantee: pity }, Math.random);

  for (const r of draw.results) {
    if (r.isNew && r.cardId) {
      const def = config.cards().find((c) => c.id === r.cardId);
      await applyDrop(openid, def ? def.seriesId : packType, r);
    } else if (r.shards > 0) {
      await dbm.collection('user_currency').where({ _openid: openid }).update({
        data: { shards: db.command.inc(r.shards), updatedAt: Date.now() },
      });
    }
  }

  // 持久化保底
  await setPity(openid, packType, draw.nextConsecutiveWithoutGuarantee);
  return resp.ok({ results: draw.results, pity: draw.nextConsecutiveWithoutGuarantee, cost: cost ? cost.amount : 0 });
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action, packType, count } = event;

  // 拼拼卡决策：纯 IAA，无付费抽取（draw 已移除）。仅保留看广告免费抽。
  // 看广告免费抽（普通包），每日上限 2 次，记 ads_log
  if (action === 'freeAd') {
    const type = packType || 'normal';
    const today = new Date().toISOString().slice(0, 10);
    const logs = (await dbm.collection('ads_log').where({ _openid: OPENID, type: 'freeGachaAd', date: today }).get()).data;
    if (logs.length >= 2) return resp.fail(resp.E.LIMIT, 'free ad daily cap reached');
    await dbm.collection('ads_log').add({
      data: { _openid: OPENID, type: 'freeGachaAd', date: today, ts: Date.now() },
    });
    // 免费抽 1 次，不扣费
    return drawPacks(OPENID, type, 1, true);
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};
