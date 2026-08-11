// cloud/functions/analytics/index.js
// 拼拼卡决策：不自建埋点，数据统一由「微信小游戏数据助手」采集。
// 一期本云函数不落地任何事件，仅返回说明，避免客户端误调用。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const resp = require('./model/resp');

exports.main = async () => {
  return resp.ok({ available: false, message: '拼拼卡数据由微信小游戏数据助手统一采集，不做自研埋点' });
};
