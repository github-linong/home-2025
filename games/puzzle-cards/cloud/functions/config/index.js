// cloud/functions/config/index.js
// 向客户端下发静态配置（关卡/卡牌/系列/难度/免费抽卡）。客户端不打包 60 关数据，运行时拉取。纯 IAA，不含商店。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const config = require('./model/config');
const resp = require('./model/resp');

exports.main = async (event) => {
  const { type } = event || {};
  if (type === 'levels') return resp.ok(config.levels());
  if (type === 'cards') return resp.ok(config.cards());
  if (type === 'series') return resp.ok(Object.values(config.seriesMeta()));
  if (type === 'shop') return resp.ok(config.shop());
  if (type === 'gacha') return resp.ok(config.gacha());
  if (type === 'difficulty') return resp.ok(config.difficulty());
  // 默认全量（首启动）
  return resp.ok({
    levels: config.levels(),
    cards: config.cards(),
    series: Object.values(config.seriesMeta()),
    shop: config.shop(),
    gacha: config.gacha(),
    difficulty: config.difficulty(),
  });
};
