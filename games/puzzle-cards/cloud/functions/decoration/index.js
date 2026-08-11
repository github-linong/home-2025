// cloud/functions/decoration/index.js
// 拼拼卡决策：外观/装饰（M20）列入二期，一期不开放。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const resp = require('./model/resp');

exports.main = async () => {
  return resp.ok({ available: false, message: '外观装饰将于二期开放' });
};
