// cloud/functions/team/index.js
// 拼拼卡决策：组队集卡（M15）列入二期，一期不开放。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const resp = require('./model/resp');

exports.main = async () => {
  return resp.ok({ available: false, message: '组队集卡功能将于二期开放，先一个人开开心心拼图吧' });
};
