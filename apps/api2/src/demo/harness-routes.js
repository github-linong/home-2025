// Harness 路由：把《AI 制品质量闸门框架》的逻辑空间完整落地
// 挂载在 /api/demo/harness 下。复用 stream-routes.js 的 DashScope 流式管道。
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  readLlmEnv,
  pipeSseTextToResponse,
  iterateSseTextTokens,
} from './stream-routes.js';
import {
  runHarness,
  defaultGates,
  buildManifest,
  mockGenerate,
  createJudgeGate,
  ExperienceStore,
  optimize,
  evaluate,
  VersionedConfig,
  saveArtifact,
  listVersions,
  readVersion,
} from '../../../../packages/quality-gates/src/index.js';

// 进程级单例：经验库 + 版本化配置（自我优化闭环贯穿多次请求）
const experience = new ExperienceStore();
const config = new VersionedConfig({});

const DOC_SYSTEM_PROMPT = `你是 lilnong.top 的文档生成器。根据用户需求与约束产出结构化中文 Markdown。
规则：1) 必须包含标题层级（# / ##）与一段简短导言；2) 用清晰小节组织，适当用列表/表格/代码块（标注语言）；
3) 不编造不确定事实，缺失信息用 [待补充] 占位并说明缺什么；4) 结尾给"下一步 / 延伸阅读"建议（方向即可）；
5) 直接输出 Markdown 正文，不要外层解释或客套。`;

function buildUserMessage(requirement, constraints = {}) {
  const c = constraints;
  const parts = [];
  if (c.docType || c.audience || c.tone || c.techStack || c.lengthWords) {
    parts.push(
      `请按以下约束撰写：受众=${c.audience || '通用'}；语气=${c.tone || '通用'}；` +
      `技术栈=${c.techStack || '通用'}；篇幅≈${c.lengthWords || 800} 字；类型=${c.docType || 'doc'}。`,
    );
  }
  parts.push(`需求：${requirement}`);
  return parts.join('\n');
}

// 非流式生成完整文本（harness-run 用）
async function generateText(cfg, messages, { fetchImpl = globalThis.fetch, timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetchImpl(cfg.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) throw new Error(`DashScope HTTP ${upstream.status}`);
    if (!upstream.body) throw new Error('DashScope returned no body');
    let text = '';
    for await (const tok of iterateSseTextTokens(upstream.body)) text += tok;
    return text;
  } finally {
    clearTimeout(t);
  }
}

export function createHarnessRouter({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const router = Router();

  // 1) 流式生成（供前端实时预览 markdown）
  router.post('/harness-doc', async (req, res) => {
    const { requirement, constraints } = req.body || {};
    if (!requirement || !requirement.trim()) {
      return res.status(400).json({ ok: false, error: 'invalid_requirement' });
    }
    const cfg = readLlmEnv(env);
    const inProd = env.NODE_ENV === 'production' || env.MODE === '生产';

    // 离线 / dev 兜底：无 key 且非生产，流式回放 mock，保证 UI 链路可测
    if (!cfg.apiKey && !inProd) {
      res.status(200);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      const art = mockGenerate(requirement, constraints || {});
      for (const ch of art.content) {
        res.write(ch);
        await new Promise((r) => setTimeout(r, 4));
      }
      if (!res.writableEnded) res.end();
      return;
    }
    if (!cfg.apiKey) return res.status(503).json({ ok: false, error: 'llm_not_configured' });

    try {
      const upstream = await fetchImpl(cfg.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: DOC_SYSTEM_PROMPT },
            { role: 'user', content: buildUserMessage(requirement, constraints) },
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });
      if (!upstream.ok) {
        const d = (await upstream.text()).slice(0, 500);
        throw new Error(`DashScope HTTP ${upstream.status}: ${d}`);
      }
      res.status(200);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      await pipeSseTextToResponse(upstream.body, res);
      if (!res.writableEnded) res.end();
    } catch (err) {
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      res.status(502).json({ ok: false, error: 'llm_request_failed' });
    }
  });

  // 2) 完整流水线：生成 + 确定性闸门 + judge + 经验库 -> QA 报告
  router.post('/harness-run', async (req, res) => {
    const { requirement, constraints } = req.body || {};
    if (!requirement || !requirement.trim()) {
      return res.status(400).json({ ok: false, error: 'invalid_requirement' });
    }
    const cfg = readLlmEnv(env);
    const c = constraints || {};

    let content = null;
    if (cfg.apiKey) {
      try {
        content = await generateText(
          cfg,
          [
            { role: 'system', content: DOC_SYSTEM_PROMPT },
            { role: 'user', content: buildUserMessage(requirement, c) },
          ],
          { fetchImpl },
        );
      } catch {
        content = null; // 生成失败回退 mock
      }
    }
    if (!content) {
      const art = mockGenerate(requirement, c);
      content = art.content;
    }

    const artifact = { id: randomUUID(), kind: 'markdown', content, manifest: buildManifest(requirement, c) };

    // 闸门集：确定性四闸 + （有 LLM 时）judge 主观评判
    const gates = defaultGates();
    if (cfg.apiKey) {
      gates.push(
        createJudgeGate({
          threshold: 70,
          complete: async (prompt, { maxTokens = 256 } = {}) => {
            const r = await fetchImpl(cfg.endpoint, {
              method: 'POST',
              headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: cfg.model,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                temperature: 0.3,
                max_tokens: maxTokens,
              }),
            });
            const j = await r.json();
            return j?.choices?.[0]?.message?.content || '';
          },
        }),
      );
    }

    const report = await runHarness({
      requirement,
      constraints: c,
      generate: async () => artifact,
      gates,
      experienceStore: experience,
    });

    res.status(200).json({ ok: true, content, report, metrics: experience.metrics() });
  });

  // 3) 适应度指标（首次通过率 / 逃逸率 / 人审占比）
  router.get('/harness-metrics', (_req, res) => {
    res.json({ ok: true, metrics: experience.metrics() });
  });

  // 4) 产物版本化 + 灰度回滚
  router.post('/harness-save', async (req, res) => {
    const { content, requirement, constraints, status, score, gates } = req.body || {};
    if (!content) return res.status(400).json({ ok: false, error: 'invalid_content' });
    const rec = await saveArtifact({ content }, { requirement, constraints, status, score, gates });
    res.json({ ok: true, record: rec });
  });
  router.get('/harness-versions', async (_req, res) => {
    res.json({ ok: true, versions: await listVersions() });
  });
  router.post('/harness-rollback', async (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'invalid_id' });
    const md = await readVersion(id);
    if (md == null) return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({ ok: true, id, content: md });
  });

  // 5) 自我优化：失败信号 -> 候选（参数自治晋升，结构变更待人批）
  router.post('/harness-optimize', (req, res) => {
    const { humanApproved = false } = req.body || {};
    const candidates = optimize(experience, config.current());
    const applied = [];
    for (const cand of candidates) {
      const ev = evaluate(cand, { humanApproved });
      if (ev.approved) {
        const r = config.apply(cand, true, 'optimize');
        applied.push({ candidate: cand, ...r });
      } else {
        applied.push({ candidate: cand, approved: false, reason: ev.reason });
      }
    }
    res.json({ ok: true, candidates: applied, config: config.current(), metrics: experience.metrics() });
  });

  return router;
}
