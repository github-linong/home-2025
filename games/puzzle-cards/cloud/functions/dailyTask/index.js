// cloud/functions/dailyTask/index.js
// M10 每日签到 / 每日任务（服务端权威）。
// action: 'signin' | 'tasks' | 'claim'
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');
const signin = require('./model/signin');
const dailyTask = require('./model/dailyTask');
const cardDrop = require('./model/cardDrop');
const { applyDrop } = require('./model/applyDrop');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

// 把奖励里的货币字段原子自增到 user_currency
async function applyCurrency(openid, reward) {
  if (!reward) return;
  const db = dbm.getDB();
  const data = { updatedAt: Date.now() };
  let has = false;
  for (const k of ['coins', 'puzzleChances', 'shards', 'diamonds']) {
    if (reward[k]) { data[k] = db.command.inc(reward[k]); has = true; }
  }
  if (has) await dbm.collection('user_currency').where({ _openid: openid }).update({ data });
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action } = event;
  const users = dbm.collection('users');
  const user = (await users.where({ _openid: OPENID }).get()).data[0];
  if (!user) return resp.fail(resp.E.NOT_FOUND, 'user');

  if (action === 'signin') {
    const today = todayStr();
    if (user.lastSigninDate === today) {
      return resp.ok({ signed: true, day: user.signinDay || 1, streak: user.streak || 0, reward: user.lastSigninReward || null });
    }
    const last = user.lastSigninDate;
    const streak = (last === yesterdayStr()) ? (user.streak || 0) + 1 : 1;
    const day = ((streak - 1) % 7) + 1;
    const isFirstWeek = streak <= 7;
    const reward = signin.getReward(day, isFirstWeek);

    await applyCurrency(OPENID, reward);

    if (reward.cardPack) {
      const owned = (await dbm.collection('cards_owned').where({ _openid: OPENID }).get()).data.map((c) => c.cardId);
      const roll = cardDrop.rollCard({
        seriesId: 'flower', difficultyStars: 1, starRating: 3, isFirstClear: false,
        isBoss: false, isHiddenLevel: false, ownedCardIds: owned, pityMiss: 0,
      }, Math.random);
      await applyDrop(OPENID, 'flower', roll);
      reward.card = { cardId: roll.cardId, rarity: roll.rarity };
    }
    if (reward.decoration) {
      await dbm.collection('decorations').add({
        data: { _openid: OPENID, decorationId: reward.decoration, source: 'signin', createdAt: Date.now() },
      });
    }

    const newStreak = day >= 7 ? 0 : streak;
    await users.doc(user._id).update({
      data: { signinDay: day, streak: newStreak, lastSigninDate: today, lastSigninReward: reward, updatedAt: Date.now() },
    });
    return resp.ok({ signed: true, day, streak: newStreak, reward });
  }

  if (action === 'tasks') {
    const today = todayStr();
    const rec = (await dbm.collection('daily_tasks').where({ _openid: OPENID }).get()).data[0];
    let metrics;
    if (!rec || rec.date !== today) {
      metrics = { levelClear: 0, newCard: 0, social: 0 };
      const data = { _openid: OPENID, date: today, metrics, claimed: {}, lastReset: Date.now() };
      if (rec) await dbm.collection('daily_tasks').doc(rec._id).update({ data });
      else await dbm.collection('daily_tasks').add({ data });
    } else {
      metrics = rec.metrics || { levelClear: 0, newCard: 0, social: 0 };
    }
    const tasks = dailyTask.evaluate(metrics);
    const allDone = dailyTask.allDone(tasks);
    const claimedBonus = rec && rec.claimed && rec.claimed[today] && rec.claimed[today].bonus;
    return resp.ok({ date: today, tasks, allDone, bonusAvailable: allDone && !claimedBonus });
  }

  if (action === 'claim') {
    const { taskId } = event;
    const today = todayStr();
    const rec = (await dbm.collection('daily_tasks').where({ _openid: OPENID }).get()).data[0];
    if (!rec) return resp.fail(resp.E.NOT_FOUND, 'no daily task');
    const metrics = rec.metrics || {};
    const tasks = dailyTask.evaluate(metrics);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return resp.fail(resp.E.PARAM, 'unknown task');
    if (!task.done) return resp.fail(resp.E.CONFLICT, 'task not done');
    const claimed = rec.claimed || {};
    claimed[today] = claimed[today] || {};
    if (claimed[today][taskId]) return resp.fail(resp.E.CONFLICT, 'already claimed');

    await applyCurrency(OPENID, task.reward);
    claimed[today][taskId] = true;

    let bonus = null;
    const allDone = dailyTask.allDone(tasks);
    if (allDone && !claimed[today].bonus) {
      bonus = dailyTask.allCompleteBonus();
      await applyCurrency(OPENID, bonus);
      claimed[today].bonus = true;
    }
    await dbm.collection('daily_tasks').doc(rec._id).update({ data: { claimed, updatedAt: Date.now() } });
    return resp.ok({ taskId, reward: task.reward, bonus });
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};
