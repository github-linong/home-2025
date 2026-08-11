// cloud/database/init.js
// 创建集合 + 索引 + 种子数据（关卡/系列/卡牌）。幂等，可重复执行。
// 作为云函数上传后，在云开发控制台「云函数」中手动触发一次（或定时）。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const config = require('../model/config');

const COLLECTIONS = [
  'users', 'user_currency', 'user_progress', 'cards_owned', 'collection', 'pity_state',
  'levels', 'series', 'cards', 'shares', 'help_requests', 'daily_tasks', 'signin',
  'ads_log', 'invites', 'trades', 'pk_records', 'teams', 'seasons', 'activities',
  'orders', 'achievements', 'analytics_events', 'anti_cheat_logs',
  'daily_challenge', 'pushes', 'decorations',
];

async function createCollection(name) {
  try { await db.createCollection(name); console.log('created', name); }
  catch (e) { console.log('exists/skip', name); }
}

const INDEXES = {
  users: [{ fields: { inviteCode: 1 } }],
  cards_owned: [{ fields: { _openid: 1, cardId: 1 } }],
  shares: [{ fields: { fromOpenid: 1, createdAt: -1 } }],
  help_requests: [{ fields: { fromOpenid: 1, status: 1 } }],
  trades: [{ fields: { fromOpenid: 1, toOpenid: 1, status: 1 } }],
  pk_records: [{ fields: { initiator: 1, opponent: 1, status: 1 } }],
  teams: [{ fields: { 'members.openid': 1 } }],
  orders: [{ fields: { _openid: 1, outTradeNo: 1 } }],
  analytics_events: [{ fields: { _openid: 1, event: 1 } }],
  anti_cheat_logs: [{ fields: { _openid: 1, type: 1 } }],
};

async function seed(name, docs) {
  const col = db.collection(name);
  const exist = await col.count();
  if (exist.total > 0) { console.log('seed skip', name); return; }
  for (let i = 0; i < docs.length; i += 20) {
    await col.add({ data: docs.slice(i, i + 20) });
  }
  console.log('seeded', name, docs.length);
}

exports.main = async () => {
  for (const c of COLLECTIONS) await createCollection(c);
  for (const [name, idxs] of Object.entries(INDEXES)) {
    const col = db.collection(name);
    for (const idx of idxs) {
      try { await col.createIndex({ data: idx.fields }); console.log('index', name, JSON.stringify(idx.fields)); }
      catch (e) { console.log('index skip', name); }
    }
  }
  await seed('levels', config.levels());
  await seed('series', Object.values(config.seriesMeta()).map((s) => ({ seriesId: s.seriesId, name: s.name })));
  await seed('cards', config.cards());
  return { ok: true, collections: COLLECTIONS.length };
};
