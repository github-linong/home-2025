// 编排器：harness 主流程（对应文章完整闭环）
// 生成 -> 分层跑确定性闸门（由快到慢、快速失败）-> judge -> 人审例外 -> 经验库反哺
import { SEVERITY } from './gate.js';

export async function runHarness({
  requirement,
  constraints = {},
  generate,
  gates = [],
  experienceStore,
} = {}) {
  if (typeof generate !== 'function') throw new Error('runHarness 需要 generate 函数');

  // 1) 生成制品（上游约束已在 generate 内通过 manifest 体现）
  const artifact = await generate(requirement, constraints);

  // 2) 分层跑闸门：遇到硬阻塞立即停（省掉后续无效算力）
  const results = [];
  for (const g of gates) {
    const r = await g.run(artifact, { requirement, constraints });
    results.push(r);
    if (!r.pass && r.severity === SEVERITY.BLOCK) break;
  }

  // 3) 聚合状态
  const blocked = results.find((r) => !r.pass && r.severity === SEVERITY.BLOCK);
  const warned = results.find((r) => !r.pass && r.severity === SEVERITY.WARN);
  let status = 'pass';
  if (blocked) status = 'blocked';
  else if (warned) status = 'review'; // 人只看被拦下的例外

  // 4) judge（启发式打分；真实场景可换 LLM-as-judge，仍为 out-of-context）
  const score = judgeScore(results);
  const needsHumanReview = status === 'review' || status === 'blocked';

  const report = {
    artifactId: artifact.id,
    kind: artifact.kind,
    status,
    score,
    needsHumanReview,
    gates: results.map((r) => ({ name: r.name, pass: r.pass, severity: r.severity, message: r.message })),
    suggestions: buildSuggestions(results),
    generatedAt: new Date().toISOString(),
  };

  // 5) 失败信号进经验库，供后续自我优化（闭环递减人审占比）
  if (experienceStore && status !== 'pass') {
    experienceStore.push({ requirement, constraints, report });
  }
  return report;
}

function judgeScore(results) {
  let s = 100;
  for (const r of results) {
    if (!r.pass) s -= r.severity === SEVERITY.BLOCK ? 100 : 20;
  }
  return Math.max(0, s);
}

function buildSuggestions(results) {
  return results.filter((r) => !r.pass).map((r) => `${r.name}: ${r.message}`);
}
