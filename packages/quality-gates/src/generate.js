// 制品生成器：把「上游预防」落地
// - mockGenerate：离线可用，按约束生成带 manifest 的 Markdown（演示用，可注入缺陷）
// - apiGenerate：接 api2 的 /api/demo/harness-doc（真实 LLM；失败回退 mock）
import { randomUUID } from 'node:crypto';

const SECTION_TEMPLATES = {
  tutorial: ['背景', '核心概念', '动手实践', '常见坑', '小结'],
  doc: ['概述', '用法', '示例', '注意事项'],
  report: ['摘要', '分析', '结论', '建议'],
};

export function buildManifest(requirement, constraints = {}) {
  const docType = constraints.docType || 'doc';
  const sections = SECTION_TEMPLATES[docType] || SECTION_TEMPLATES.doc;
  const maxWords = constraints.lengthWords || 800;
  return {
    kind: 'markdown',
    docType,
    requiredSections: sections,
    minSections: 2,
    maxWords,
    expectedHeadings: sections.map((s) => `## ${s}`),
  };
}

export function mockGenerate(requirement, constraints = {}, { injectFaults = [] } = {}) {
  const manifest = buildManifest(requirement, constraints);
  const lines = [`# ${constraints.title || requirement.slice(0, 24)}`, ''];
  lines.push(`> ${requirement}`, '');
  for (const s of manifest.requiredSections) {
    lines.push(`## ${s}`);
    lines.push(`针对「${requirement}」的${s}内容。这里用确定性约束保证结构完整。`);
    lines.push('');
  }
  let content = lines.join('\n');

  if (injectFaults.includes('placeholder')) content += '\n[待补充：缺少示例]\n';
  if (injectFaults.includes('pii')) content += '\n联系方式：zhangsan@example.com / 13800001111\n';

  return { id: randomUUID(), kind: 'markdown', content, manifest };
}

export async function apiGenerate(
  requirement,
  constraints = {},
  { endpoint = 'http://127.0.0.1:3002/api/demo/harness-doc' } = {},
) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirement, constraints }),
    });
    if (!res.ok) throw new Error(`harness-doc HTTP ${res.status}`);
    const content = await res.text();
    return { id: randomUUID(), kind: 'markdown', content, manifest: buildManifest(requirement, constraints) };
  } catch {
    // 离线 / 无 key 时回退 mock，保证链路可测
    return mockGenerate(requirement, constraints);
  }
}
