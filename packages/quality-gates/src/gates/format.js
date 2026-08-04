// 闸门二：格式 / 几何层（非代码产物的「类型系统」）
// 文章要点：图片世界用 sharp 查尺寸/格式/调色板；文本世界用结构 + 长度约束。
import { gateResult, SEVERITY } from '../gate.js';

function countWords(s) {
  // 中文按字、英文按词粗略统计
  const cjk = (s.match(/\p{Script=Han}/gu) || []).length;
  const en = (s.match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + en;
}

export function createFormatGate({ maxWords, minWords = 0 } = {}) {
  return {
    name: 'format',
    layer: 'geometry',
    async run(artifact, ctx = {}) {
      const c = artifact.content;

      // 代码围栏必须闭合
      const fenceCount = (c.match(/```/g) || []).length;
      if (fenceCount % 2 !== 0) {
        return gateResult('format', false, SEVERITY.BLOCK, 'Markdown 代码围栏未闭合（``` 数量为奇数）');
      }

      const words = countWords(c);
      const limit = maxWords ?? ctx?.constraints?.lengthWords ?? 2000;
      if (words > limit) {
        return gateResult('format', false, SEVERITY.WARN, `篇幅 ${words} 字超过上限 ${limit} 字`);
      }
      if (words < minWords) {
        return gateResult('format', false, SEVERITY.WARN, `篇幅 ${words} 字过短`);
      }

      // 残留占位 = 上游没填完，需人补
      const placeholder = (c.match(/\[待补充|TODO|FIXME|占位/g) || []).length;
      if (placeholder > 0) {
        return gateResult('format', false, SEVERITY.WARN, `残留 ${placeholder} 处占位标记，需补全`, { placeholder });
      }

      // 空章节：H2 之后没有任何正文就直接下一个标题或文档结束
      const lines = c.split('\n');
      let emptySections = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i])) {
          // 向后看，直到下一个标题或结尾，中间是否全为空/空白
          let j = i + 1;
          let hasBody = false;
          while (j < lines.length && !/^#{1,6}\s+/.test(lines[j])) {
            if (lines[j].trim().length > 0) hasBody = true;
            j++;
          }
          if (!hasBody) emptySections++;
        }
      }
      if (emptySections > 0) {
        return gateResult('format', false, SEVERITY.WARN, `存在 ${emptySections} 个空章节（标题下无正文）`, { emptySections });
      }

      return gateResult('format', true, SEVERITY.INFO, `格式合规，约 ${words} 字`);
    },
  };
}
