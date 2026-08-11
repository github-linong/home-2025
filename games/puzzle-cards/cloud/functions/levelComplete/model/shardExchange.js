// cloud/model/shardExchange.js
// 重复卡转碎片（PRD 5.5）+ 碎片兑换指定卡（PRD 5.6）。
const config = require('./config');

function duplicateToShards(rarity) {
  return config.probabilities().shards.duplicateToShards[rarity] || 0;
}
function exchangeCost(rarity) {
  return config.probabilities().shards.exchangeCost[rarity];
}
function canExchange(userShards, rarity) {
  const cost = exchangeCost(rarity);
  return typeof cost === 'number' && cost > 0 && userShards >= cost;
}
function isExchangeable(rarity) {
  const cost = exchangeCost(rarity);
  return typeof cost === 'number' && cost > 0;
}

module.exports = { duplicateToShards, exchangeCost, canExchange, isExchangeable };
