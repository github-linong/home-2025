// cloud/functions/push/index.js
// 拼拼卡决策：订阅消息/推送（M24）列入二期，一期不开放。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const resp = require('./model/resp');

exports.main = async () => {
  return resp.ok({ available: false, message: '订阅消息将于二期开放' });
};
