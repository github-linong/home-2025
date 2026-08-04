// 闸门五：LLM-as-judge（下游主观评判，管美感/品牌味）
// 文章要点：纯主观部分无法全自动，但「需要人审 ≠ 人当卡点」；
// judge 是 out-of-context 的独立 LLM 调用（不污染生成上下文），只回分数。
// complete(prompt, { maxTokens }) -> string 由调用方注入（真实接 DashScope；离线可省）。
import { gateResult, SEVERITY } from '../gate.js';

export function createJudgeGate({ complete, threshold = 70, name = 'judge', maxTokens = 256 } = {}) {
  return {
    name,
    layer: 'judge',
    async run(artifact, ctx = {}) {
      if (typeof complete !== 'function') {
        // 没有 LLM 时降级为 info，不阻塞，保证离线可跑
        return gateResult(name, true, SEVERITY.INFO, '未配置 judge(LLM)，跳过主观评判（离线）');
      }
      const prompt = buildJudgePrompt(artifact, ctx);
      let raw;
      try {
        raw = await complete(prompt, { maxTokens });
      } catch {
        return gateResult(name, true, SEVERITY.INFO, 'judge 调用失败，跳过');
      }
      const score = parseScore(raw);
      if (score < threshold) {
        return gateResult(name, false, SEVERITY.WARN, `主观质量分 ${score} 低于阈值 ${threshold}`, { score });
      }
      return gateResult(name, true, SEVERITY.INFO, `主观质量分 ${score}`, { score });
    },
  };
}

function buildJudgePrompt(artifact, ctx) {
  const c = ctx?.constraints || {};
  return [
    '你是严苛的资深编辑。请给下面这篇 AI 生成文档的主观质量打 0-100 分（通顺、结构、品牌味）。',
    `受众：${c.audience || '通用'}；语气：${c.tone || '通用'}；技术栈：${c.techStack || '通用'}。`,
    '只回复一个整数分数，不要解释。',
    '---',
    artifact.content,
  ].join('\n');
}

function parseScore(s) {
  const m = String(s).match(/\d{1,3}/);
  if (!m) return 100;
  return Math.min(100, Number(m[0]));
}
