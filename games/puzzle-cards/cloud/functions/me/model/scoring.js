// cloud/model/scoring.js
// 星级评定（PRD 3.2 P-015）+ 每日挑战计分（PRD 4.3）。

// 1 星完成；2 星用时<=标准*1.5；3 星用时<=标准 且 未用任何提示。
function computeStar({ stdTimeSec, usedTimeSec, hintsUsed }) {
  if (usedTimeSec == null) return 1;
  let star = 1;
  if (usedTimeSec <= stdTimeSec * 1.5) star = 2;
  if (usedTimeSec <= stdTimeSec && (hintsUsed || 0) === 0) star = 3;
  return star;
}

// 每日挑战：基础分 × 速度系数 × 难度系数（PRD 4.3）
function dailyChallengeScore({ baseScore, usedTimeSec, stdTimeSec, difficultyStars }) {
  const speed = stdTimeSec > 0 ? Math.max(0.2, stdTimeSec / Math.max(1, usedTimeSec)) : 1;
  return Math.round(baseScore * speed * difficultyStars);
}

module.exports = { computeStar, dailyChallengeScore };
