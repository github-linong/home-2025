import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJudgeGate } from '../src/gates/judge.js';

test('judge: 分数>=阈值 -> pass', async () => {
  const g = createJudgeGate({ complete: async () => '82', threshold: 70 });
  const r = await g.run({ content: '通顺且结构清晰的文档' });
  assert.equal(r.pass, true);
  assert.equal(r.severity, 'info');
});

test('judge: 分数<阈值 -> warn（人审例外）', async () => {
  const g = createJudgeGate({ complete: async () => '40', threshold: 70 });
  const r = await g.run({ content: '前言不搭后语的文档' });
  assert.equal(r.pass, false);
  assert.equal(r.severity, 'warn');
});

test('judge: 无 LLM -> 降级 info，不阻塞（离线可跑）', async () => {
  const g = createJudgeGate({});
  const r = await g.run({ content: 'x' });
  assert.equal(r.pass, true);
  assert.equal(r.severity, 'info');
});

test('judge: LLM 调用抛错 -> 降级 info', async () => {
  const g = createJudgeGate({ complete: async () => { throw new Error('boom'); } });
  const r = await g.run({ content: 'x' });
  assert.equal(r.pass, true);
});
