// cloud/model/signin.js
// 每日签到（PRD 11.2）。连续 7 天额外大奖。
const config = require('./config');

function getReward(day, isFirstWeek) {
  const s = config.signin();
  const entry = s.days.find((d) => d.day === day) || s.days[s.days.length - 1];
  const reward = { ...entry.reward };
  if (day >= 7) {
    const bonus = isFirstWeek ? s.weekBonus.first : s.weekBonus.repeat;
    Object.assign(reward, bonus);
  }
  return reward;
}

module.exports = { getReward };
