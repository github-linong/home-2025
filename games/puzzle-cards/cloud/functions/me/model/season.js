// cloud/model/season.js
// 赛季积分累加（PRD 19.2）。
const SCORE = {
  levelClearPerStar: 10, // 完成拼图：难度星级×10
  threeStarBonus: 0.5, // 3星通关额外 +50%
  firstClearBonus: 0.2, // 首次通关额外 +20%
  newCard: { N: 10, R: 30, SR: 80, SSR: 200 },
  seriesComplete: 500,
  invite: 50,
  help: 10,
  trade: 5,
  teamComplete: 100,
  dailyChallenge: 30,
  pkWin: 20,
};

// events: 触发事件数组，每项 { type, stars?, rarity? }
// 返回本次获得的赛季积分
function addPoints(events = []) {
  let total = 0;
  for (const e of events) {
    switch (e.type) {
      case 'levelClear': {
        let p = (e.stars || 1) * SCORE.levelClearPerStar;
        if (e.firstClear) p *= 1 + SCORE.firstClearBonus;
        if (e.threeStar) p *= 1 + SCORE.threeStarBonus;
        total += Math.round(p);
        break;
      }
      case 'newCard': total += SCORE.newCard[e.rarity] || 0; break;
      case 'seriesComplete': total += SCORE.seriesComplete; break;
      case 'invite': total += SCORE.invite; break;
      case 'help': total += SCORE.help; break;
      case 'trade': total += SCORE.trade; break;
      case 'teamComplete': total += SCORE.teamComplete; break;
      case 'dailyChallenge': total += SCORE.dailyChallenge; break;
      case 'pkWin': total += SCORE.pkWin; break;
      default: break;
    }
  }
  return total;
}

module.exports = { addPoints, SCORE };
