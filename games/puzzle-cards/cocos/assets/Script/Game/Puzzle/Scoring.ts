// cocos/assets/Script/Game/Puzzle/Scoring.ts
// 本地星级预判（仅用于 UI 反馈；权威评级以云端 levelComplete 为准，PRD P-015）。
export function predictStar(stdTimeSec: number, usedTimeSec: number | null, hintsUsed: number): 1 | 2 | 3 {
  if (usedTimeSec == null) return 1;
  let s: 1 | 2 | 3 = 1;
  if (usedTimeSec <= stdTimeSec * 1.5) s = 2;
  if (usedTimeSec <= stdTimeSec && hintsUsed === 0) s = 3;
  return s;
}
