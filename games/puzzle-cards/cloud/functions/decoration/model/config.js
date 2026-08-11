// cloud/model/config.js
// 配置加载器：require 生成好的数值表 JSON。云函数冷启动时缓存。
// 数值表由 scripts/gen-config.mjs 生成到 ./config/ 下，保证与 PRD 计数一致。

const path = require('path');

const cache = {};

function load(name) {
  if (cache[name]) return cache[name];
  const file = path.join(__dirname, 'config', `${name}.json`);
  const data = require(file);
  cache[name] = data;
  return data;
}

const config = {
  difficulty: () => load('difficulty'),
  probabilities: () => load('probabilities'),
  cards: () => load('cards'),
  levels: () => load('levels'),
  signin: () => load('signin'),
  tasks: () => load('tasks'),
  shop: () => load('shop'),
  gacha: () => load('gacha'),
  // 工具：按系列取卡；按稀有度分组
  cardsBySeries(seriesId) {
    return load('cards').filter((c) => c.seriesId === seriesId);
  },
  cardsByRarity(seriesId, rarity) {
    return load('cards').filter((c) => c.seriesId === seriesId && c.rarity === rarity);
  },
  levelById(levelId) {
    return load('levels').find((l) => l.id === levelId);
  },
  seriesMeta() {
    return load('cards').reduce((acc, c) => {
      if (!acc[c.seriesId]) {
        acc[c.seriesId] = { seriesId: c.seriesId, name: c.seriesName, cards: [] };
      }
      acc[c.seriesId].cards.push(c);
      return acc;
    }, {});
  },
};

module.exports = config;
