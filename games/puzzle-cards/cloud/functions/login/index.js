// cloud/functions/login/index.js
// M01 用户系统：静默登录（U-001）+ 授权头像昵称（U-002）+ 新用户初始化（U-003）+ 隐私（U-006）。
// 微信云开发天然在 getWXContext() 提供 OPENID，无需自行换 code。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');

function genInviteCode() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += s[Math.floor(Math.random() * s.length)];
  return r;
}
function defaultNick() {
  return '拼图玩家' + Math.floor(1000 + Math.random() * 9000);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');

  const users = dbm.collection('users');
  const exist = await users.where({ _openid: OPENID }).get();

  if (!exist.data.length) {
    const now = Date.now();
    const init = {
      _openid: OPENID,
      nickname: defaultNick(),
      avatar: 'images/default_avatar.png',
      inviteCode: genInviteCode(),
      createdAt: now,
      tutorialDone: false,
      tutorialStep: 0,
      privacyAccepted: !!event.privacyAccepted,
      removedAds: false,
      levelsCleared: 0,
      lastAdTs: 0,
      settings: { sound: true, vibrate: true, theme: 'light' },
    };
    await users.add({ data: init });
    // 货币与进度初始化（PRD U-003）
    await dbm.collection('user_currency').add({ data: { _openid: OPENID, coins: 0, diamonds: 0, shards: 0, puzzleChances: 16, updatedAt: now } });
    await dbm.collection('user_progress').add({ data: { _openid: OPENID, clearedLevels: [], stars: {}, bestTime: {}, maxUnlockedOrder: 0, updatedAt: now } });
    await dbm.collection('pity_state').add({ data: { _openid: OPENID, levelPity: {}, updatedAt: now } });
    await dbm.collection('collection').add({ data: { _openid: OPENID, seriesProgress: {}, totalCollected: 0, totalScore: 0, updatedAt: now } });
    return resp.ok({ ...init, isNew: true });
  }

  const user = exist.data[0];
  // 授权头像昵称（U-002）：可更新
  const update = {};
  if (event.nickname) update.nickname = event.nickname;
  if (event.avatar) update.avatar = event.avatar;
  if (event.privacyAccepted && !user.privacyAccepted) update.privacyAccepted = true;
  if (Object.keys(update).length) {
    await users.doc(user._id).update({ data: update });
  }
  return resp.ok({ ...user, ...update, isNew: false });
};
