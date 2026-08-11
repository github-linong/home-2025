// cloud/functions/invite/index.js
// M16 邀请有礼（服务端权威）。
// action: 'generate' | 'activate' | 'milestones' | 'records'
// generate: 返回自己的邀请码 + 分享链接。
// activate {inviteCode}: 被邀请者完成首关后触发；记录邀请、发奖、里程碑。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');
const config = require('./model/config');
const invite = require('./model/invite');
const { applyDrop } = require('./model/applyDrop');

// 货币原子发放（coins/shards/diamonds/puzzleChances）
async function grantCurrency(openid, { coins = 0, shards = 0, diamonds = 0, puzzleChances = 0 }) {
  const db = dbm.getDB();
  const data = { updatedAt: Date.now() };
  if (coins) data.coins = db.command.inc(coins);
  if (shards) data.shards = db.command.inc(shards);
  if (diamonds) data.diamonds = db.command.inc(diamonds);
  if (puzzleChances) data.puzzleChances = db.command.inc(puzzleChances);
  if (Object.keys(data).length > 1) {
    await dbm.collection('user_currency').where({ _openid: openid }).update({ data });
  }
}

// 指定系列/稀有度抽一张卡（优先未拥有），并 applyDrop
async function pickRarityCard(openid, seriesId, rarity) {
  const pool = config.cardsByRarity(seriesId, rarity);
  if (!pool.length) return null;
  const owned = (await dbm.collection('cards_owned').where({ _openid: openid }).get()).data.map((c) => c.cardId);
  const unowned = pool.filter((c) => !owned.includes(c.id));
  const choose = unowned.length ? unowned : pool;
  const pick = choose[Math.floor(Math.random() * choose.length)];
  await applyDrop(openid, seriesId, { isNew: true, cardId: pick.id, rarity, shards: 0, isDuplicate: false, isHidden: false });
  return pick.id;
}

// 跨系列发 1 张 SR 卡（srDirected 里程碑）
async function grantSR(openid) {
  const sr = config.cards().filter((c) => c.rarity === 'SR' && !c.hidden);
  if (!sr.length) return null;
  const owned = (await dbm.collection('cards_owned').where({ _openid: openid }).get()).data.map((c) => c.cardId);
  const unowned = sr.filter((c) => !owned.includes(c.id));
  const choose = unowned.length ? unowned : sr;
  const pick = choose[Math.floor(Math.random() * choose.length)];
  await applyDrop(openid, pick.seriesId, { isNew: true, cardId: pick.id, rarity: 'SR', shards: 0, isDuplicate: false, isHidden: false });
  return pick.id;
}

// 解锁装饰（写入 decorations 集合）
async function grantDecoration(openid, decoId, source) {
  if (!decoId) return;
  await dbm.collection('decorations').add({ data: { _openid: openid, decorationId: decoId, source: source || 'invite', ts: Date.now() } });
}

// 发指定卡（存在才发，否则跳过，如 ssr_friendship 未配置）
async function grantCardIfExists(openid, cardId) {
  const def = config.cards().find((c) => c.id === cardId);
  if (!def) return null;
  await applyDrop(openid, def.seriesId, { isNew: true, cardId, rarity: def.rarity, shards: 0, isDuplicate: false, isHidden: false });
  return cardId;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');
  const { action, inviteCode } = event;
  const users = dbm.collection('users');

  if (action === 'generate' || !action) {
    const user = (await users.where({ _openid: OPENID }).get()).data[0];
    if (!user) return resp.fail(resp.E.NOT_FOUND, 'user');
    const code = user.inviteCode;
    return resp.ok({ inviteCode: code, shareLink: `/pages/invite/invite?code=${code}` });
  }

  if (action === 'activate') {
    if (!inviteCode) return resp.fail(resp.E.PARAM, 'missing inviteCode');
    const inviterDoc = (await users.where({ inviteCode }).get()).data[0];
    if (!inviterDoc) return resp.fail(resp.E.NOT_FOUND, 'inviter not found');
    const inviter = inviterDoc._openid;
    if (inviter === OPENID) return resp.fail(resp.E.PARAM, 'cannot activate own code');
    // 防重复激活：同一被邀请者仅一次
    const dup = await dbm.collection('invites').where({ invitedOpenid: OPENID }).get();
    if (dup.data.length) return resp.fail(resp.E.CONFLICT, 'already activated');

    const prevCount = (await dbm.collection('invites').where({ inviterOpenid: inviter }).get()).data.length;
    await dbm.collection('invites').add({ data: { inviterOpenid: inviter, invitedOpenid: OPENID, ts: Date.now() } });
    const newCount = prevCount + 1;

    // 邀请者基础奖励（PRD 17.2）：+2 拼图次数 +5 碎片
    await grantCurrency(inviter, { puzzleChances: 2, shards: 5 });
    // 被邀请者新手礼包：+3 拼图次数 + 1 张 R 卡
    await grantCurrency(OPENID, { puzzleChances: invite.INVITEE_REWARD.puzzleChances });
    const rCardId = await pickRarityCard(OPENID, 'flower', invite.INVITEE_REWARD.rarityCard);

    // 里程碑奖励（仅发放 새로 跨过的）
    const crossed = invite.newlyCrossed(prevCount, newCount);
    const milestones = [];
    for (const m of crossed) {
      const r = m.reward;
      const granted = {};
      if (r.puzzleChances || r.shards) {
        await grantCurrency(inviter, { puzzleChances: r.puzzleChances || 0, shards: r.shards || 0 });
        granted.currency = { puzzleChances: r.puzzleChances || 0, shards: r.shards || 0 };
      }
      if (r.srDirected) granted.srCard = await grantSR(inviter);
      if (r.decoration) { await grantDecoration(inviter, r.decoration, 'invite'); granted.decoration = r.decoration; }
      if (r.card) granted.card = await grantCardIfExists(inviter, r.card);
      milestones.push({ count: m.count, granted });
    }
    return resp.ok({ inviter, prevCount, newCount, inviteeReward: { puzzleChances: invite.INVITEE_REWARD.puzzleChances, cardId: rCardId }, milestones });
  }

  if (action === 'milestones') {
    const count = (await dbm.collection('invites').where({ inviterOpenid: OPENID }).get()).data.length;
    return resp.ok({ count, reached: invite.reachedMilestones(count), milestones: invite.MILESTONES });
  }

  if (action === 'records') {
    const list = await dbm.collection('invites').where({ inviterOpenid: OPENID }).get();
    return resp.ok({ records: list.data });
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};
