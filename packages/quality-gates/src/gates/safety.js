// 闸门三：安全 / 合规层（purpose-built 分类器，不靠生成模型）
// 文章要点：文本跑 toxicity / PII 分类器，都是确定性工具。
import { gateResult, SEVERITY } from '../gate.js';

const PII_PATTERNS = [
  { type: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
  { type: 'phone', re: /(?:\+?86)?1[3-9]\d{9}/ },
  { type: 'idcard', re: /\b\d{17}[\dXx]\b/ },
  { type: 'apikey', re: /(?:api[_-]?key|token|secret)\s*[:=]\s*[\w\-]{16,}/i },
];

// 示例词表，可扩展为正式分类器
const TOXIC_WORDS = ['去死', '废物', '垃圾人'];

export function createSafetyGate() {
  return {
    name: 'safety',
    layer: 'compliance',
    async run(artifact) {
      const c = artifact.content;
      const found = [];
      for (const p of PII_PATTERNS) {
        const m = c.match(p.re);
        if (m) found.push({ type: p.type, sample: m[0].slice(0, 12) });
      }
      if (found.length) {
        return gateResult('safety', false, SEVERITY.BLOCK,
          `检出疑似敏感信息：${found.map((f) => f.type).join('、')}`, { found });
      }
      const toxic = TOXIC_WORDS.filter((w) => c.includes(w));
      if (toxic.length) {
        return gateResult('safety', false, SEVERITY.WARN, `检出不当用词：${toxic.join('、')}`);
      }
      return gateResult('safety', true, SEVERITY.INFO, '未检出敏感 / 不当内容');
    },
  };
}
