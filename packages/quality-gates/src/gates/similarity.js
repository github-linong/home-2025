// 闸门四：相似度基线（感知哈希的确定性阈值 analog）
// 文章要点：生成物对参考基线算哈希，设阈值闸——确定性阈值。
import { gateResult, SEVERITY } from '../gate.js';
import { createHash } from 'node:crypto';

function sig(s) {
  return createHash('sha1').update(s.replace(/\s+/g, '')).digest('hex').slice(0, 16);
}

export function createSimilarityGate({ baseline = [], threshold = 0.9 } = {}) {
  // 完全重复才拦；近似重复可将来用编辑距离扩展，此处保持确定性。
  const sigs = new Set(baseline.map((b) => sig(b)));
  return {
    name: 'similarity',
    layer: 'baseline',
    async run(artifact) {
      const h = sig(artifact.content);
      if (sigs.has(h)) {
        return gateResult('similarity', false, SEVERITY.WARN, '与已有基线完全重复（感知哈希命中）');
      }
      return gateResult('similarity', true, SEVERITY.INFO, '与基线无重复');
    },
  };
}
