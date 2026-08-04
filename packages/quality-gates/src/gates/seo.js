// 闸门七：结构 SEO / 可读性（确定性，管层级与导语）
// 文章要点：标题层级必须连贯（不能 H1 直接跳 H3），且开头要有导语/摘要——
// 这两点机器可判定，且直接决定文档是否"像样"。
import { gateResult, SEVERITY } from '../gate.js';

export function createSeoGate({ requireSummary = true, minSummaryLen = 4 } = {}) {
  return {
    name: 'seo',
    layer: 'seo',
    async run(artifact) {
      const c = artifact.content;
      const lines = c.split('\n');
      const heads = [];          // 顺序记录每个标题的层级
      let h1Seen = false;
      let summaryFound = false;

      for (const ln of lines) {
        const h = ln.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
          const level = h[1].length;
          if (level === 1) h1Seen = true;
          // 层级跳级：相对上一篇标题跨了两级及以上（H1->H3 等）
          if (heads.length && level - heads[heads.length - 1] > 1) {
            return gateResult('seo', false, SEVERITY.WARN,
              `标题层级跳级：从 H${heads[heads.length - 1]} 直接到 H${level}`);
          }
          heads.push(level);
        } else if (/^>\s+/.test(ln)) {
          // 引用块作为摘要/导语
          if (ln.replace(/^>\s+/, '').trim().length >= minSummaryLen) summaryFound = true;
        }
      }

      // 缺 H1 兜底（manifest 已在更早 BLOCK 并短路，这里作防御）
      if (!h1Seen) {
        return gateResult('seo', false, SEVERITY.BLOCK, '缺少 H1 标题');
      }

      // 要求导语：开头到第一个 H2 之间需有 ≥minSummaryLen 的非标题行，或存在引用块
      if (requireSummary && !summaryFound) {
        const firstH2 = lines.findIndex((l) => /^##\s+/.test(l));
        const head = firstH2 === -1 ? lines : lines.slice(0, firstH2);
        const hasIntro = head.some(
          (l) => !/^#/.test(l) && !/^>\s*$/.test(l) && l.trim().length >= 20,
        );
        if (!hasIntro) {
          return gateResult('seo', false, SEVERITY.WARN,
            '缺少导语/摘要（建议开头加一段 ≥20 字概述，或用 > 引用块写摘要）');
        }
      }

      return gateResult('seo', true, SEVERITY.INFO, 'SEO/结构合规（层级连贯、含导语）');
    },
  };
}
