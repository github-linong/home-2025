// cloud/functions/shop/index.js
// 拼拼卡决策：纯 IAA 变现（激励/插屏/Banner 广告），不含任何内购。
// 已移除 IAP / 钻石 / 月卡 / 通行证 / 卡包购买。一期本云函数不提供任何能力，仅返回说明。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const resp = require('./model/resp');

exports.main = async () => {
  return resp.ok({ available: false, message: '拼拼卡为纯广告变现（IAA）版本，一期不含内购商店' });
};
