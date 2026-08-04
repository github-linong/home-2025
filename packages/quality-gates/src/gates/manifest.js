// 闸门一：契约 / manifest（上游预防 + 确定性闸门）
// 文章要点：要求 AI 出产物时「同时输出一份机器可读 manifest」，先确定性校验 manifest。
// 这里把契约落地为「结构契约」：必须有 H1 标题 + 不少于 minSections 个 H2 章节，
// 不依赖 LLM 是否恰好写出约定标题，避免误杀真实生成内容。
import { gateResult, SEVERITY } from '../gate.js';

export function createManifestGate() {
  return {
    name: 'manifest',
    layer: 'contract',
    async run(artifact) {
      const m = artifact.manifest;
      if (!m) {
        return gateResult('manifest', false, SEVERITY.WARN, '产物未附带 manifest，无法做契约校验');
      }
      const c = artifact.content;
      const h1 = (c.match(/^#\s+/gm) || []).length;
      const h2 = (c.match(/^##\s+/gm) || []).length;
      const minSections = m.minSections ?? 2;
      if (h1 < 1) {
        return gateResult('manifest', false, SEVERITY.BLOCK, '缺少一级标题（# 标题）', { h1, h2 });
      }
      if (h1 > 1) {
        // 文档应只有一个 H1；多于一个属结构瑕疵，异常驱动人审（不硬拦）
        return gateResult('manifest', false, SEVERITY.WARN, `存在 ${h1} 个一级标题，应只有一个`, { h1, h2 });
      }
      if (h2 < minSections) {
        return gateResult('manifest', false, SEVERITY.BLOCK, `章节数 ${h2} 少于契约要求 ${minSections}`, { h1, h2, minSections });
      }
      return gateResult('manifest', true, SEVERITY.INFO, `契约结构合规（H1=${h1}, H2=${h2}）`);
    },
  };
}
