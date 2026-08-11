// cloud/functions/rank/index.js
// M07 排行榜：每日挑战成绩提交 + 赛季榜单读取 + 个人最佳读取（服务端权威）。
// action: 'submitDailyChallenge' | 'getSeasonTop' | 'getMyBest'
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action } = event;

  // 提交每日挑战成绩：仅持久化本人成绩（PRD M07）
  if (action === 'submitDailyChallenge') {
    const { levelId, score, usedTimeSec } = event;
    if (!levelId || score == null) return resp.fail(resp.E.PARAM, 'missing levelId/score');
    await dbm.collection('daily_challenge').add({
      data: {
        _openid: OPENID,
        levelId,
        score,
        usedTimeSec: usedTimeSec || 0,
        date: todayStr(),
        ts: Date.now(),
      },
    });
    return resp.ok({ submitted: true });
  }

  // 全服赛季榜：拼拼卡决策列入二期；一期仅保留个人最佳 + 每日挑战成绩（见下）
  if (action === 'getSeasonTop') {
    return resp.ok({ available: false, list: [], message: '全服赛季榜将于二期开放' });
  }

  // 读取本人最佳：最佳用时（指定关卡）+ 收集总评分
  if (action === 'getMyBest') {
    const { levelId } = event;
    const prog = (await dbm.collection('user_progress').where({ _openid: OPENID }).get()).data[0] || {};
    const col = (await dbm.collection('collection').where({ _openid: OPENID }).get()).data[0] || {};
    const bestTime =
      levelId != null && prog.bestTime ? (prog.bestTime[levelId] != null ? prog.bestTime[levelId] : null) : (prog.bestTime || {});
    return resp.ok({ bestTime, totalScore: col.totalScore || 0 });
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};

// 注意：好友的速度/收集/进度排行榜由客户端通过开放数据域（wx.getFriendCloudStorage）
// 读取，服务端不处理。本函数仅持久化并读取“自己的最佳成绩”。
