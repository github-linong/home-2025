import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEVERITY } from '../src/gate.js';
import { createLinksGate } from '../src/gates/links.js';
import { createSeoGate } from '../src/gates/seo.js';
import { createFormatGate } from '../src/gates/format.js';
import { createManifestGate } from '../src/gates/manifest.js';

const art = (content, manifest = {}) => ({ content, manifest });

// ---------- links 闸门 ----------
test('links: 干净文档（无链接）-> pass', async () => {
  const r = await createLinksGate().run(art('# 标题\n\n正文无链接。'));
  assert.equal(r.pass, true);
  assert.equal(r.severity, SEVERITY.INFO);
});

test('links: 空链接 -> BLOCK', async () => {
  const r = await createLinksGate().run(art('# 标题\n\n[点我]()'));
  assert.equal(r.pass, false);
  assert.equal(r.severity, SEVERITY.BLOCK);
});

test('links: javascript: 伪协议 -> BLOCK', async () => {
  const r = await createLinksGate().run(art('# 标题\n\n[坏](javascript:alert(1))'));
  assert.equal(r.severity, SEVERITY.BLOCK);
});

test('links: 占位域名 example.com -> WARN', async () => {
  const r = await createLinksGate().run(art('# 标题\n\n[参考](https://example.com/a)'));
  assert.equal(r.pass, false);
  assert.equal(r.severity, SEVERITY.WARN);
});

test('links: 占位域名可升级为 BLOCK（blockPlaceholders）', async () => {
  const r = await createLinksGate({ blockPlaceholders: true }).run(art('# 标题\n\n[参考](https://example.com/a)'));
  assert.equal(r.severity, SEVERITY.BLOCK);
});

test('links: 相对路径 / 锚点 / 邮件 -> pass', async () => {
  const r = await createLinksGate({ allowRelative: true }).run(
    art('# 标题\n\n[内链](./x.md) [锚点](#sec) [邮件](mailto:a@b.com)'),
  );
  assert.equal(r.pass, true);
});

// ---------- seo 闸门 ----------
test('seo: 正常层级 + 有导语 -> pass', async () => {
  const c = '# 标题\n\n> 这是一段摘要。\n\n## 背景\n\n内容。\n\n## 小结\n\n内容。';
  const r = await createSeoGate().run(art(c));
  assert.equal(r.pass, true);
});

test('seo: 标题层级跳级 H1->H3 -> WARN', async () => {
  const c = '# 标题\n\n> 摘要。\n\n### 直接三级\n\n内容。';
  const r = await createSeoGate().run(art(c));
  assert.equal(r.pass, false);
  assert.equal(r.severity, SEVERITY.WARN);
});

test('seo: 缺少导语 -> WARN', async () => {
  const c = '# 标题\n\n## 背景\n\n内容。\n\n## 小结\n\n内容。';
  const r = await createSeoGate().run(art(c));
  assert.equal(r.pass, false);
  assert.equal(r.severity, SEVERITY.WARN);
});

test('seo: 缺失 H1 -> BLOCK（兜底）', async () => {
  const c = '## 背景\n\n内容。';
  const r = await createSeoGate().run(art(c));
  assert.equal(r.severity, SEVERITY.BLOCK);
});

// ---------- format 收紧：空章节 ----------
test('format: 存在空章节 -> WARN', async () => {
  const c = '# 标题\n\n## 背景\n\n## 小结\n\n内容。';
  const r = await createFormatGate().run(art(c));
  assert.equal(r.pass, false);
  assert.equal(r.severity, SEVERITY.WARN);
  assert.match(r.message, /空章节/);
});

test('format: 章节有正文 -> pass', async () => {
  const c = '# 标题\n\n## 背景\n\n有正文。\n\n## 小结\n\n有正文。';
  const r = await createFormatGate().run(art(c));
  assert.equal(r.pass, true);
});

// ---------- manifest 收紧：多个 H1 ----------
test('manifest: 多个 H1 -> WARN', async () => {
  const c = '# 标题一\n\n## A\n\nx\n\n# 标题二\n\n## B\n\ny';
  const r = await createManifestGate().run(art(c, { minSections: 2 }));
  assert.equal(r.pass, false);
  assert.equal(r.severity, SEVERITY.WARN);
  assert.match(r.message, /一级标题/);
});

test('manifest: 单一 H1 + 足够 H2 -> pass', async () => {
  const c = '# 标题\n\n## A\n\nx\n\n## B\n\ny';
  const r = await createManifestGate().run(art(c, { minSections: 2 }));
  assert.equal(r.pass, true);
});
