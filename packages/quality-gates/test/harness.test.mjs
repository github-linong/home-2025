import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runHarness,
  mockGenerate,
  defaultGates,
  createManifestGate,
  createSafetyGate,
  createFormatGate,
} from '../src/index.js';

test('合规产物 -> pass（自动放行）', async () => {
  const r = await runHarness({
    requirement: 'test',
    constraints: { docType: 'doc' },
    generate: (req, c) => mockGenerate(req, c),
    gates: defaultGates(),
  });
  assert.equal(r.status, 'pass');
  assert.equal(r.needsHumanReview, false);
  assert.equal(r.score, 100);
});

test('缺章节 -> manifest 阻断（blocked）', async () => {
  const artifact = await mockGenerate('x', { docType: 'doc' });
  artifact.content = '# 标题\n\n只有一段，没有必需章节。';
  const r = await runHarness({
    requirement: 'x',
    generate: async () => artifact,
    gates: [createManifestGate()],
  });
  assert.equal(r.status, 'blocked');
});

test('含 PII -> safety 阻断（blocked）', async () => {
  const artifact = await mockGenerate('x', { docType: 'doc' });
  artifact.content += '\n邮箱：a@b.com 电话 13800001111';
  const r = await runHarness({
    requirement: 'x',
    generate: async () => artifact,
    gates: [createSafetyGate()],
  });
  assert.equal(r.status, 'blocked');
});

test('残留占位 -> format 警告 -> review（人审例外）', async () => {
  const r = await runHarness({
    requirement: 'x',
    constraints: { docType: 'doc' },
    generate: (req, c) => mockGenerate(req, c, { injectFaults: ['placeholder'] }),
    gates: [createManifestGate(), createFormatGate()],
  });
  assert.equal(r.status, 'review');
  assert.equal(r.needsHumanReview, true);
});

test('失败信号进经验库（闭环递减）', async () => {
  const store = [];
  await runHarness({
    requirement: 'x',
    generate: async () => ({ id: '1', kind: 'markdown', content: 'a@b.com' }),
    gates: [createSafetyGate()],
    experienceStore: store,
  });
  assert.equal(store.length, 1);
});
