// cloud/functions/trade/index.js
// M13 卡牌交换（服务端权威，PRD 14.2）。
// action: 'propose' | 'accept' | 'list' | 'reject' | 'cancel'
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');

const RARITY_ORDER = ['N', 'R', 'SR', 'SSR'];
// 近似：赛季奖励/限定卡集合（实际应按运营配置替换 / 或扩展 cards 的 limited 标记）
const LIMITED_CARD_IDS = new Set([]);

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function isTradable(cardId) {
  const def = config.cards().find((c) => c.id === cardId);
  if (!def) return { ok: false };
  if (def.hidden) return { ok: false, reason: 'hidden' };
  if (LIMITED_CARD_IDS.has(cardId)) return { ok: false, reason: 'limited' };
  return { ok: true, def };
}
async function ownedCount(openid, cardId) {
  const rec = (await dbm.collection('cards_owned').where({ _openid: openid, cardId }).get()).data[0];
  return rec ? rec.count : 0;
}
async function giveCard(openid, cardId) {
  const db = dbm.getDB();
  const def = config.cards().find((c) => c.id === cardId);
  const col = dbm.collection('cards_owned');
  const rec = (await col.where({ _openid: openid, cardId }).get()).data[0];
  if (rec) {
    await col.doc(rec._id).update({ data: { count: db.command.inc(1) } });
  } else {
    await col.add({ data: { _openid: openid, cardId, seriesId: def ? def.seriesId : '', count: 1, firstGotAt: Date.now() } });
  }
}
async function takeCard(openid, cardId) {
  const col = dbm.collection('cards_owned');
  const rec = (await col.where({ _openid: openid, cardId }).get()).data[0];
  if (!rec) return false;
  if (rec.count > 1) {
    await col.doc(rec._id).update({ data: { count: db.command.inc(-1) } });
  } else {
    await col.doc(rec._id).remove();
  }
  return true;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action } = event;

  if (action === 'propose') {
    const { toOpenid, giveCardId, wantCardId } = event;
    if (!toOpenid || !giveCardId || !wantCardId) return resp.fail(resp.E.PARAM, 'missing params');
    if (toOpenid === OPENID) return resp.fail(resp.E.PARAM, 'cannot trade with self');

    const give = isTradable(giveCardId);
    if (!give.ok) return resp.fail(resp.E.PARAM, `giveCard not tradable:${give.reason}`);
    const want = isTradable(wantCardId);
    if (!want.ok) return resp.fail(resp.E.PARAM, `wantCard not tradable:${want.reason}`);

    // 稀有度差 ≤ 1 级
    const gd = RARITY_ORDER.indexOf(give.def.rarity);
    const wd = RARITY_ORDER.indexOf(want.def.rarity);
    if (gd < 0 || wd < 0 || Math.abs(gd - wd) > 1) return resp.fail(resp.E.PARAM, 'rarity gap > 1');

    // 提议者必须拥有 giveCardId
    if ((await ownedCount(OPENID, giveCardId)) < 1) return resp.fail(resp.E.CONFLICT, 'not own giveCard');
    // 接收者必须拥有 wantCardId
    if ((await ownedCount(toOpenid, wantCardId)) < 1) return resp.fail(resp.E.CONFLICT, 'peer not own wantCard');

    const db = dbm.getDB();
    const now = Date.now();
    // 每日交换 ≤ 3 次
    const today = (await dbm.collection('trades').where({ fromOpenid: OPENID, createdAt: db.command.gt(startOfDay()) }).get()).data;
    if (today.length >= 3) return resp.fail(resp.E.LIMIT, 'daily trade limit 3');
    // 同对好友冷却 4h
    const recent = (await dbm.collection('trades').where(db.command.or([
      { fromOpenid: OPENID, toOpenid, createdAt: db.command.gt(now - 4 * 3600 * 1000) },
      { fromOpenid: toOpenid, toOpenid: OPENID, createdAt: db.command.gt(now - 4 * 3600 * 1000) },
    ])).get()).data;
    if (recent.length) return resp.fail(resp.E.LIMIT, 'pair cooldown 4h');

    const rec = {
      fromOpenid: OPENID, toOpenid, giveCardId, wantCardId,
      status: 'pending', createdAt: now, expireAt: now + 24 * 3600 * 1000,
    };
    await dbm.collection('trades').add({ data: rec });
    return resp.ok({ trade: rec });
  }

  if (action === 'accept') {
    const { tradeId } = event;
    if (!tradeId) return resp.fail(resp.E.PARAM, 'missing tradeId');
    const trade = (await dbm.collection('trades').doc(tradeId).get()).data;
    if (!trade) return resp.fail(resp.E.NOT_FOUND, 'trade not found');
    if (trade.toOpenid !== OPENID) return resp.fail(resp.E.AUTH, 'not your trade');
    if (trade.status !== 'pending') return resp.fail(resp.E.CONFLICT, 'trade not pending');
    if (Date.now() > trade.expireAt) {
      await dbm.collection('trades').doc(tradeId).update({ data: { status: 'expired' } });
      return resp.fail(resp.E.CONFLICT, 'trade expired');
    }
    // 交换：giveCardId 从提议者流向接收者；wantCardId 从接收者流向提议者
    if (!(await takeCard(trade.fromOpenid, trade.giveCardId))) return resp.fail(resp.E.CONFLICT, 'giver lost giveCard');
    if (!(await takeCard(trade.toOpenid, trade.wantCardId))) return resp.fail(resp.E.CONFLICT, 'acceptor lost wantCard');
    await giveCard(trade.toOpenid, trade.giveCardId);
    await giveCard(trade.fromOpenid, trade.wantCardId);
    await dbm.collection('trades').doc(tradeId).update({ data: { status: 'completed', completedAt: Date.now() } });
    return resp.ok({ status: 'completed' });
  }

  if (action === 'list') {
    const { status } = event;
    const db = dbm.getDB();
    const q = db.command.or([{ fromOpenid: OPENID }, { toOpenid: OPENID }]);
    const all = (await dbm.collection('trades').where(q).get()).data;
    const list = status ? all.filter((t) => t.status === status) : all;
    return resp.ok({ list });
  }

  if (action === 'reject') {
    const { tradeId } = event;
    const trade = (await dbm.collection('trades').doc(tradeId).get()).data;
    if (!trade) return resp.fail(resp.E.NOT_FOUND, 'trade not found');
    if (trade.toOpenid !== OPENID) return resp.fail(resp.E.AUTH, 'not your trade');
    if (trade.status !== 'pending') return resp.fail(resp.E.CONFLICT, 'trade not pending');
    await dbm.collection('trades').doc(tradeId).update({ data: { status: 'rejected' } });
    return resp.ok({ status: 'rejected' });
  }

  if (action === 'cancel') {
    const { tradeId } = event;
    const trade = (await dbm.collection('trades').doc(tradeId).get()).data;
    if (!trade) return resp.fail(resp.E.NOT_FOUND, 'trade not found');
    if (trade.fromOpenid !== OPENID) return resp.fail(resp.E.AUTH, 'not your trade');
    if (trade.status !== 'pending') return resp.fail(resp.E.CONFLICT, 'trade not pending');
    await dbm.collection('trades').doc(tradeId).update({ data: { status: 'cancelled' } });
    return resp.ok({ status: 'cancelled' });
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};
