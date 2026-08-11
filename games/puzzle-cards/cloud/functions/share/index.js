// cloud/functions/share/index.js
// M08 分享裂变（服务端权威）：分享奖励（带每日上限） + 好友回流双方奖励（PRD 9.3）。
// action: 'trigger' | 'callback'
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 分享奖励表（PRD 9.3）。field 为受影响的 user_currency 字段。
const REWARDS = {
  complete: { field: 'puzzleChances', amt: 1, cap: 3 }, // 拼图完成 +1，每日上限 3
  rare: { field: 'puzzleChances', amt: 2, cap: 2 },     // SR/SSR 炫耀 +2，每日上限 2
  rank: { field: 'coins', amt: 100, cap: 1 },           // 排行榜 +100，每日上限 1
  team: { field: 'coins', amt: 50, cap: 2 },            // 组队 +50，每日上限 2
};

// 记录并校验每日触发次数（key: openid+date+type），用 shares 集合承载。
async function bumpTrigger(openid, type) {
  const db = dbm.getDB();
  const today = todayStr();
  const shares = dbm.collection('shares');
  const rec = (await shares.where({ _openid: openid, kind: 'trigger', date: today, type }).get()).data[0];
  if (rec) {
    if (rec.count >= REWARDS[type].cap) return { ok: false };
    await shares.doc(rec._id).update({ data: { count: db.command.inc(1) } });
  } else {
    await shares.add({ data: { _openid: openid, kind: 'trigger', date: today, type, count: 1, ts: Date.now() } });
  }
  return { ok: true };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action, type, shareId, fromOpenid } = event;

  // 发起分享：给分享者发奖励（受每日上限约束）
  if (action === 'trigger') {
    const rw = REWARDS[type];
    if (!rw) return resp.fail(resp.E.PARAM, 'unknown share type');
    const bump = await bumpTrigger(OPENID, type);
    if (!bump.ok) return resp.fail(resp.E.LIMIT, 'daily share cap reached');
    const db = dbm.getDB();
    await dbm.collection('user_currency').where({ _openid: OPENID }).update({
      data: { [rw.field]: db.command.inc(rw.amt), updatedAt: Date.now() },
    });
    return resp.ok({ type, granted: { [rw.field]: rw.amt } });
  }

  // 好友通过分享进入：双方各 +1 次拼图机会（不限，每对仅一次）
  if (action === 'callback') {
    if (!shareId || !fromOpenid) return resp.fail(resp.E.PARAM, 'missing shareId/fromOpenid');
    const db = dbm.getDB();
    const shares = dbm.collection('shares');
    const dup = await shares.where({ shareId, callbackOpenid: OPENID, kind: 'callback' }).get();
    if (dup.data.length) return resp.fail(resp.E.CONFLICT, 'already rewarded');
    await shares.add({
      data: { fromOpenid, shareId, callbackOpenid: OPENID, rewarded: true, kind: 'callback', ts: Date.now() },
    });
    // 双方各 +1 次拼图机会（原子自增；若 fromOpenid===OPENID 仅命中一条）
    await dbm.collection('user_currency').where({ _openid: db.command.in([fromOpenid, OPENID]) }).update({
      data: { puzzleChances: db.command.inc(1), updatedAt: Date.now() },
    });
    return resp.ok({ bothGranted: 1 });
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};
