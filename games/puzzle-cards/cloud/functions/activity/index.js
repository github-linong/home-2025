// cloud/functions/activity/index.js
// 拼拼卡决策：活动系统（M19）列入二期，一期不开放。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const resp = require('./model/resp');

exports.main = async () => {
  return resp.ok({ available: false, message: '活动系统将于二期开放' });
};
