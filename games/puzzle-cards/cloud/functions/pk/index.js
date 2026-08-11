// cloud/functions/pk/index.js
// M14 PK 对战（服务端权威，PRD 15.2）。
// action: 'invite' | 'accept' | 'submit' | 'record'
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');
const ac = require('./model/antiCheat');

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
async function getProgress(openid) {
  const p = (await dbm.collection('user_progress').where({ _openid: openid }).get()).data[0];
  return p ? (p.maxUnlockedOrder || 0) : 0;
}
async function grantCurrency(openid, { shards, coins }) {
  const db = dbm.getDB();
  const data = { updatedAt: Date.now() };
  if (shards) data.shards = db.command.inc(shards);
  if (coins) data.coins = db.command.inc(coins);
  await dbm.collection('user_currency').where({ _openid: openid }).update({ data });
}
async function setStreak(openid, win) {
  const db = dbm.getDB();
  const u = (await dbm.collection('users').where({ _openid: openid }).get()).data[0];
  if (!u) return;
  const cur = u.pkStreak || 0;
  const next = win ? cur + 1 : 0;
  const data = { pkStreak: next, updatedAt: Date.now() };
  // 连胜 3 场额外 +50 金币
  if (win && next >= 3) data.coins = db.command.inc(50);
  await dbm.collection('users').where({ _openid: openid }).update({ data });
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action } = event;

  if (action === 'invite') {
    const { opponentOpenid } = event;
    if (!opponentOpenid || opponentOpenid === OPENID) return resp.fail(resp.E.PARAM, 'invalid opponent');

    const db = dbm.getDB();
    const now = Date.now();
    // 每日挑战 ≤ 5 次
    const today = (await dbm.collection('pk_records').where({ initiator: OPENID, createdAt: db.command.gt(startOfDay()) }).get()).data;
    if (today.length >= 5) return resp.fail(resp.E.LIMIT, 'daily pk limit 5');

    // 选双方都未通关的关卡（order 超过双方最大解锁）
    const levels = config.levels();
    const minOrder = Math.max(await getProgress(OPENID), await getProgress(opponentOpenid));
    const pool = levels.filter((l) => l.order > minOrder);
    const level = pool.length ? pool[Math.floor(Math.random() * pool.length)] : levels[Math.floor(Math.random() * levels.length)];

    const rec = {
      initiator: OPENID, opponent: opponentOpenid, levelId: level.id,
      status: 'pending', initiatorTime: null, opponentTime: null, winner: null,
      createdAt: now, expireAt: now + 24 * 3600 * 1000,
    };
    await dbm.collection('pk_records').add({ data: rec });
    return resp.ok({ pk: rec });
  }

  if (action === 'accept') {
    const { pkId } = event;
    const pk = (await dbm.collection('pk_records').doc(pkId).get()).data;
    if (!pk) return resp.fail(resp.E.NOT_FOUND, 'pk not found');
    if (pk.opponent !== OPENID) return resp.fail(resp.E.AUTH, 'not your pk');
    if (pk.status !== 'pending') return resp.fail(resp.E.CONFLICT, 'pk not pending');
    if (Date.now() > pk.expireAt) {
      await dbm.collection('pk_records').doc(pkId).update({ data: { status: 'expired' } });
      return resp.fail(resp.E.CONFLICT, 'pk expired');
    }
    await dbm.collection('pk_records').doc(pkId).update({ data: { status: 'accepted' } });
    return resp.ok({ status: 'accepted' });
  }

  if (action === 'submit') {
    const { pkId, usedTimeSec, pieceHash } = event;
    if (!pkId || usedTimeSec == null) return resp.fail(resp.E.PARAM, 'missing params');
    const pk = (await dbm.collection('pk_records').doc(pkId).get()).data;
    if (!pk) return resp.fail(resp.E.NOT_FOUND, 'pk not found');
    if (OPENID !== pk.initiator && OPENID !== pk.opponent) return resp.fail(resp.E.AUTH, 'not participant');
    if (pk.status === 'finished') return resp.fail(resp.E.CONFLICT, 'pk finished');
    if (Date.now() > pk.expireAt) {
      await dbm.collection('pk_records').doc(pkId).update({ data: { status: 'expired' } });
      return resp.fail(resp.E.CONFLICT, 'pk expired');
    }

    const level = config.levelById(pk.levelId);
    const tCheck = ac.validateTime({ usedTimeSec, difficultyStars: level ? level.difficultyStars : 1 });
    if (!tCheck.ok) return resp.fail(resp.E.CHEAT, tCheck.reason);

    const data = { updatedAt: Date.now() };
    if (OPENID === pk.initiator) data.initiatorTime = usedTimeSec;
    else data.opponentTime = usedTimeSec;
    await dbm.collection('pk_records').doc(pkId).update({ data });

    const cur = (await dbm.collection('pk_records').doc(pkId).get()).data;
    const it = cur.initiatorTime, ot = cur.opponentTime;
    const now = Date.now();

    // 都提交 或 对方超时 → 判定
    const otherExpired = now > cur.expireAt;
    const bothIn = it != null && ot != null;
    const oneInOtherOut = (it != null && ot == null) || (it == null && ot != null);
    if (!bothIn && !(oneInOtherOut && otherExpired)) {
      return resp.ok({ status: cur.status, waiting: true });
    }

    let winner;
    if (it != null && ot != null) winner = it <= ot ? cur.initiator : cur.opponent;
    else if (it != null) winner = cur.initiator; // 对手超时
    else winner = cur.opponent; // 发起者超时
    const loser = winner === cur.initiator ? cur.opponent : cur.initiator;

    await grantCurrency(winner, { shards: 2, coins: 20 });
    await grantCurrency(loser, { shards: 1, coins: 10 });
    await setStreak(winner, true);
    await setStreak(loser, false);

    await dbm.collection('pk_records').doc(pkId).update({ data: { status: 'finished', winner, finishedAt: Date.now() } });
    return resp.ok({ status: 'finished', winner });
  }

  if (action === 'record') {
    const db = dbm.getDB();
    const list = (await dbm.collection('pk_records').where(db.command.or([{ initiator: OPENID }, { opponent: OPENID }])).get()).data;
    return resp.ok({ list });
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};
