// cloud/functions/antiCheat/index.js
// M23 反作弊：日志 + 标记端点（重校验在 model/antiCheat，已被 levelComplete 调用）。
// 本函数只负责记录与标记，不做任何数值裁决，保持只读/日志式，绝不改动 users 业务字段。
// 入参：
//   action 'report'       { type, detail }                       type in {time_invalid,freq_abnormal,dup_submit,device_multi,mismatch_hash,other}
//   action 'flag'         { targetOpenid, reason }               标记为人工复核（仅写日志，不动 user 文档）
//   action 'deviceCheck'  { deviceFingerprint, count? }          设备关联账号数 > 3 视为可疑
//   action 'queue'        { limit? }                             返回最近未处理日志（管理端视图，limit 默认 50）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbm = require('./model/db');
const resp = require('./model/resp');

const TYPES = ['time_invalid', 'freq_abnormal', 'dup_submit', 'device_multi', 'mismatch_hash', 'other'];
const QUEUE_LIMIT = 50;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return resp.fail(resp.E.AUTH, 'no openid');

  const { action } = event;

  if (action === 'report') {
    const { type, detail } = event;
    if (!TYPES.includes(type)) return resp.fail(resp.E.PARAM, 'bad type');
    await dbm.collection('anti_cheat_logs').add({
      data: { _openid: OPENID, type, detail: detail || null, ts: Date.now(), handled: false },
    });
    return resp.ok({});
  }

  if (action === 'flag') {
    const { targetOpenid, reason } = event;
    if (!targetOpenid) return resp.fail(resp.E.PARAM, 'targetOpenid required');
    await dbm.collection('anti_cheat_logs').add({
      data: { type: 'review', targetOpenid, reason: reason || '', by: OPENID, ts: Date.now(), handled: false },
    });
    return resp.ok({});
  }

  if (action === 'deviceCheck') {
    const { deviceFingerprint, count } = event;
    if (!deviceFingerprint) return resp.fail(resp.E.PARAM, 'deviceFingerprint required');
    let acc = count;
    if (acc == null) {
      // 近似：扫描已记录的 device_multi 日志里该指纹关联的账号数（按 openid 去重）
      const logs = await dbm.collection('anti_cheat_logs')
        .where({ type: 'device_multi', deviceFingerprint })
        .get();
      acc = new Set(logs.data.map((l) => l._openid)).size;
    }
    // 记录一次设备核查日志（只读、日志式）
    await dbm.collection('anti_cheat_logs').add({
      data: { type: 'device_multi', deviceFingerprint, count: acc, ts: Date.now(), handled: false },
    });
    return resp.ok({ suspicious: acc > 3 });
  }

  if (action === 'queue') {
    const limit = Math.min(Math.max(event.limit || QUEUE_LIMIT, 1), QUEUE_LIMIT);
    const res = await dbm.collection('anti_cheat_logs')
      .where({ handled: false })
      .orderBy('ts', 'desc')
      .limit(limit)
      .get();
    return resp.ok({ logs: res.data });
  }

  return resp.fail(resp.E.PARAM, 'unknown action');
};
