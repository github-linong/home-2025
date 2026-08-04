// 闸门六：链接卫生（确定性，文本产物的「外链健康」）
// 文章要点：确定性工具能查的就不靠人眼——坏链/占位链是最常见的 AI 制品瑕疵。
// 策略：空链接、伪协议(javascript:/data:)、畸形 URL -> BLOCK；
//       占位/示例域名(example.com 等) -> WARN（异常驱动人审，可升级为 BLOCK）；
//       相对路径与 #fragment 默认放行（站内文档常态）。
import { gateResult, SEVERITY } from '../gate.js';

const PLACEHOLDER_HOSTS = [
  'example.com', 'example.org', 'example.net',
  'placeholder.com', 'your-domain.com', 'test.com',
  'xxx.com', 'domain.com', 'mysite.com',
];

export function createLinksGate({ blockPlaceholders = false, allowRelative = true } = {}) {
  return {
    name: 'links',
    layer: 'hygiene',
    async run(artifact) {
      const c = artifact.content;
      // 捕获 [text](url) 与 ![alt](url)，url 可能带 "title"
      const linkRe = /!?\[[^\]]*\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g;
      const issues = [];
      let m;
      while ((m = linkRe.exec(c))) {
        const raw = m[1].trim();
        const url = decodeURIComponent(raw);
        if (!url) { issues.push({ url: raw, kind: 'empty' }); continue; }
        if (/^(javascript|data|vbscript):/i.test(url)) { issues.push({ url, kind: 'insecure' }); continue; }
        if (/^(https?):\/\//i.test(url)) {
          try {
            const u = new URL(url);
            if (PLACEHOLDER_HOSTS.includes(u.hostname.toLowerCase())) issues.push({ url, kind: 'placeholder' });
          } catch {
            issues.push({ url, kind: 'malformed' });
          }
        } else if (/^mailto:/i.test(url)) {
          // 邮件链接放行
        } else if (/^#/.test(url)) {
          // 页内锚点放行
        } else if (allowRelative) {
          // 相对路径（站内文档常态）放行
        } else {
          issues.push({ url, kind: 'relative' });
        }
      }

      if (!issues.length) {
        return gateResult('links', true, SEVERITY.INFO, '链接结构合规');
      }

      const hard = issues.filter((i) => i.kind === 'empty' || i.kind === 'insecure' || i.kind === 'malformed');
      if (hard.length) {
        return gateResult('links', false, SEVERITY.BLOCK,
          `链接异常：${hard.map((i) => i.kind).join('、')}`, { issues });
      }
      if (blockPlaceholders) {
        return gateResult('links', false, SEVERITY.BLOCK,
          `占位/示例外链：${issues.map((i) => i.url).join('、')}`, { issues });
      }
      return gateResult('links', false, SEVERITY.WARN,
        `疑似占位/示例外链（建议替换为真实出处）：${issues.map((i) => i.url).join('、')}`, { issues });
    },
  };
}
