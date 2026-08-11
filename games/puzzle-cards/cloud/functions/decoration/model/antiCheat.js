// cloud/model/antiCheat.js
// 反作弊校验（PRD 24.2）。返回 { ok, reason }。
// 注：重复提交拦截与设备指纹需配合云数据库（提交键 + 设备记录），此处提供纯函数校验。

const PIECE = { 1: 4, 2: 9, 3: 16, 4: 25, 5: 36 };

// 理论最短用时：每片至少 0.5s 操作 + 基础 2s
function theoreticalMin(stars) {
  const piece = PIECE[stars] || 4;
  return Math.max(2, piece * 0.5);
}

// 用时合理性：低于理论最短 * 0.5 视为无效（PRD 24.2 最短时间）
function validateTime({ usedTimeSec, difficultyStars }) {
  const min = theoreticalMin(difficultyStars) * 0.5;
  if (usedTimeSec < min) return { ok: false, reason: `time_too_fast:${usedTimeSec}<${min}` };
  return { ok: true };
}

// 操作频率：每秒拖拽 > 10 次判定脚本
function validateFrequency(actionsPerSec) {
  if (actionsPerSec > 10) return { ok: false, reason: 'op_too_fast' };
  return { ok: true };
}

// 重复提交键：同一关卡 + 碎片位置 hash，1 分钟内多次提交仅取第一次
function submitKey(levelId, pieceHash) {
  return `${levelId}#${pieceHash}`;
}

// 碎片位置校验：服务端用关卡正确解计算 hash，与客户端上报比对
function hashCompare(expectedHash, providedHash) {
  return expectedHash === providedHash;
}

module.exports = { theoreticalMin, validateTime, validateFrequency, submitKey, hashCompare };
