// 自我优化闭环（文章第六章）
// 失败信号（拦截 / 人审例外 / 线上逃逸）→ 经验库 → 优化器候选 → 评估门卡 → 回灌 prompt/契约/闸
// 关键：评估门卡「结构变更人批、参数自治；不过不晋级、可回滚」。
import { randomUUID } from 'node:crypto';

// 经验库：记录每次失败信号，供反哺
export class ExperienceStore {
  constructor() {
    this.items = [];
  }
  add(entry) {
    this.items.push({ id: randomUUID(), at: new Date().toISOString(), ...entry });
  }
  // 系统「适应度」指标：首次通过率↑、逃逸率↓、人审占比↓
  metrics() {
    const n = this.items.length || 1;
    const blocked = this.items.filter((i) => i.status === 'blocked').length;
    const review = this.items.filter((i) => i.status === 'review').length;
    const pass = this.items.filter((i) => i.status === 'pass').length;
    const escape = this.items.filter((i) => i.escaped).length;
    return {
      total: this.items.length,
      firstPassRate: +(pass / n).toFixed(3),
      escapeRate: +(escape / n).toFixed(3),
      humanReviewRate: +((review + blocked) / n).toFixed(3),
    };
  }
}

// 优化器：把失败信号变成候选改进（示例注入 / 阈值微调 / 加闸 / 契约演进）
// candidate: { kind: 'prompt'|'threshold'|'gate'|'contract', target, delta, auto }
export function optimize(experience, _current = {}) {
  const candidates = [];
  const fails = experience.items.filter((i) => i.status !== 'pass');
  const byGate = new Map();
  for (const f of fails) {
    const bad = (f.report?.gates || []).find((g) => !g.pass);
    const key = bad?.name || 'unknown';
    if (!byGate.has(key)) byGate.set(key, []);
    byGate.get(key).push(f);
  }
  for (const [gate, items] of byGate) {
    if (gate === 'format') {
      candidates.push({ kind: 'prompt', target: 'systemPrompt', delta: '强调：不得留下 [待补充] 等占位标记', auto: true });
    }
    if (gate === 'safety') {
      candidates.push({ kind: 'gate', target: 'safety', delta: '收紧 PII 正则覆盖更多形态', auto: false });
    }
    if (gate === 'manifest') {
      candidates.push({ kind: 'contract', target: 'manifest', delta: '契约章节缺失时改为自动补全而非硬阻断', auto: false });
    }
    // 通用：阈值微调（参数级，可自动晋升）
    candidates.push({ kind: 'threshold', target: gate, delta: 'warn 阈值 +5%', auto: true });
  }
  return candidates;
}

// 评估门卡：结构变更人批，参数自治；不过不晋级
export function evaluate(candidate, { humanApproved = false } = {}) {
  if (candidate.auto) return { approved: true, reason: '参数级，自治晋升' };
  return { approved: humanApproved, reason: humanApproved ? '人批通过' : '待人工审批（结构变更）' };
}

// 版本化配置 + 灰度回滚兜底
export class VersionedConfig {
  constructor(initial) {
    this.versions = [{ id: randomUUID(), at: new Date().toISOString(), config: initial ?? {}, note: 'init' }];
  }
  current() {
    return this.versions[this.versions.length - 1].config;
  }
  apply(candidate, approved, note = '') {
    if (!approved) return { applied: false, reason: '未通过评估门卡，不晋级' };
    const next = mergeConfig(this.current(), candidate);
    this.versions.push({ id: randomUUID(), at: new Date().toISOString(), config: next, note, candidate });
    return { applied: true, version: this.versions.length - 1, config: next };
  }
  rollback(versionIndex) {
    const v = this.versions[versionIndex];
    if (!v) return { rolledBack: false };
    this.versions.push({ id: randomUUID(), at: new Date().toISOString(), config: v.config, note: `rollback->v${versionIndex}` });
    return { rolledBack: true, config: v.config };
  }
  list() {
    return this.versions.map((v, i) => ({ i, at: v.at, note: v.note }));
  }
}

function mergeConfig(base, candidate) {
  const config = JSON.parse(JSON.stringify(base || {}));
  config._applied = config._applied || [];
  config._applied.push({ kind: candidate.kind, target: candidate.target, delta: candidate.delta });
  return config;
}
