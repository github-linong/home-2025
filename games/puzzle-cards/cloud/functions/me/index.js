// cloud/functions/me/index.js
// M21 个人中心（服务端权威）。
// action: 'get' | 'updateSettings' | 'updateProfile' | 'cardWall'
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action } = event;
  const users = dbm.collection('users');
  const user = (await users.where({ _openid: OPENID }).get()).data[0];
  if (!user) return resp.fail(resp.E.NOT_FOUND, 'user');

  if (action === 'get') {
    const progress = (await dbm.collection('user_progress').where({ _openid: OPENID }).get()).data[0] || {};
    const totalCards = (await dbm.collection('cards_owned').where({ _openid: OPENID }).count()).total;
    const stars = progress.stars || {};
    const starsSum = Object.values(stars).reduce((s, v) => s + (v || 0), 0);
    const achievements = (await dbm.collection('achievements').where({ _openid: OPENID }).get()).data;
    const decorations = (await dbm.collection('decorations').where({ _openid: OPENID }).get()).data;

    const profile = {
      nickname: user.nickname,
      avatar: user.avatar,
      inviteCode: user.inviteCode,
      settings: user.settings || { sound: true, vibrate: true, theme: 'light' },
      tutorialDone: !!user.tutorialDone,
    };
    const stats = {
      levelsCleared: (progress.clearedLevels || []).length,
      totalCards,
      starsSum,
    };
    return resp.ok({ profile, stats, achievements, decorations });
  }

  if (action === 'updateSettings') {
    const { sound, vibrate, theme } = event;
    const cur = user.settings || {};
    const next = { ...cur };
    if (typeof sound === 'boolean') next.sound = sound;
    if (typeof vibrate === 'boolean') next.vibrate = vibrate;
    if (typeof theme === 'string' && theme) next.theme = theme;
    await users.doc(user._id).update({ data: { settings: next, updatedAt: Date.now() } });
    return resp.ok({ settings: next });
  }

  if (action === 'updateProfile') {
    const { nickname, avatar } = event;
    const data = { updatedAt: Date.now() };
    if (nickname) data.nickname = nickname;
    if (avatar) data.avatar = avatar;
    if (Object.keys(data).length === 1) return resp.fail(resp.E.PARAM, 'nothing to update');
    await users.doc(user._id).update({ data });
    return resp.ok({ nickname: data.nickname, avatar: data.avatar });
  }

  if (action === 'cardWall') {
    const owned = (await dbm.collection('cards_owned').where({ _openid: OPENID }).get()).data;
    return resp.ok({ owned: owned.map((c) => c.cardId) });
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};
