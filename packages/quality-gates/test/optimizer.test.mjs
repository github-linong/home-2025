import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExperienceStore, optimize, evaluate, VersionedConfig } from '../src/optimizer.js';

test('ExperienceStore 记录 + 适应度指标', () => {
  const s = new ExperienceStore();
  s.add({ status: 'pass', report: { gates: [] } });
  s.add({ status: 'blocked', report: { gates: [{ name: 'safety', pass: false }] } });
  s.add({ status: 'review', report: { gates: [{ name: 'format', pass: false, message: '占位' }] } });
  const m = s.metrics();
  assert.equal(m.total, 3);
  assert.equal(m.firstPassRate, +(1 / 3).toFixed(3));
  assert.equal(m.humanReviewRate, +(2 / 3).toFixed(3));
  assert.equal(m.escapeRate, 0);
});

test('optimize 产出候选（参数自治 + 结构人批）', () => {
  const s = new ExperienceStore();
  s.add({ status: 'blocked', report: { gates: [{ name: 'safety', pass: false }] } });
  s.add({ status: 'review', report: { gates: [{ name: 'format', pass: false, message: '占位' }] } });
  const c = optimize(s);
  assert.ok(c.length >= 2);
  assert.ok(c.some((x) => x.kind === 'prompt' && x.auto === true));
  assert.ok(c.some((x) => x.kind === 'gate' && x.auto === false));
});

test('evaluate: 参数自治通过，结构变更需人批', () => {
  assert.equal(evaluate({ auto: true }).approved, true);
  assert.equal(evaluate({ auto: false }).approved, false);
  assert.equal(evaluate({ auto: false }, { humanApproved: true }).approved, true);
});

test('VersionedConfig 晋级 + 回滚兜底', () => {
  const vc = new VersionedConfig({ v: 1 });
  const apply = vc.apply({ kind: 'threshold', target: 'format', delta: '+5%', auto: true }, true, 'tune');
  assert.equal(apply.applied, true);
  assert.equal(vc.current()._applied.length, 1);
  const rb = vc.rollback(0);
  assert.equal(rb.rolledBack, true);
  assert.equal(vc.current().v, 1);
  assert.equal(vc.list().length, 3);
});

test('闭环：失败反哺后配置演进', () => {
  const s = new ExperienceStore();
  s.add({ status: 'review', report: { gates: [{ name: 'format', pass: false, message: '占位' }] } });
  const vc = new VersionedConfig({});
  for (const c of optimize(s)) {
    const ev = evaluate(c);
    if (ev.approved) vc.apply(c, true, 'optimize');
  }
  assert.ok(vc.current()._applied.length >= 1);
});
