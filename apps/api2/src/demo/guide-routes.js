import { Router } from "express";
import { readLlmEnv, createRateLimiter } from "./stream-routes.js";

const MAX_PROMPT_LENGTH = 500;
const MAX_REPLY_LENGTH = 160;
const MAX_PANELS = 12;
const MAX_PANEL_TEXT = 300;
const MAX_FOCUS_EVENTS = 3;
const MAX_CONTEXT_LENGTH = 1500;
const PANEL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ANCHOR_ID_PATTERN = /^[a-z0-9][a-z0-9-_]{0,39}$/;

export function sanitizePanels(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const panels = [];
  for (const item of value) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    if (!PANEL_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    panels.push({
      id,
      title: String(item?.title ?? "").trim().slice(0, 60),
      summary: String(item?.summary ?? "").trim().slice(0, MAX_PANEL_TEXT),
      anchors: Array.isArray(item?.anchors)
        ? item.anchors
            .map((anchor) => (typeof anchor === "string" ? anchor.trim() : ""))
            .filter((anchor, index, arr) =>
              ANCHOR_ID_PATTERN.test(anchor) && arr.indexOf(anchor) === index,
            )
            .slice(0, 8)
        : [],
    });
    if (panels.length >= MAX_PANELS) break;
  }
  return panels;
}

function sanitizeGuideContext(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_CONTEXT_LENGTH) : "";
}

export function buildGuideSystemPrompt(panels, context = "") {
  const catalog = panels
    .map((panel) => {
      const anchors =
        Array.isArray(panel.anchors) && panel.anchors.length > 0
          ? `｜anchors=${panel.anchors.join(",")}`
          : "";
      return `- id=${panel.id}${anchors}｜${panel.title}｜${panel.summary}`;
    })
    .join("\n");
  const sanitizedContext = sanitizeGuideContext(context);
  const contextBlock = sanitizedContext ? `\n补充运行上下文：\n${sanitizedContext}\n` : "";
  return (
    "你是民生数据大屏上的3D数字人讲解员，正在给参观者讲解大屏数据。" +
    "大屏当前展示以下面板：\n" +
    catalog +
    contextBlock +
    "\n规则：" +
    "1. 只用简体中文口语回答，直接讲数据结论，不要开场白、编号、列表或Markdown；" +
    "2. 回答只能基于上面面板里的数据，数据里没有的就直说大屏上没有这项数据；" +
    "3. 回答目标约100个汉字，绝对不要超过150个汉字；" +
    '4. 只输出一个JSON对象，格式必须为{"type":"avatar_response","version":2,' +
    '"speech":{"text":"完整台词","language":"zh-CN"},' +
    '"timeline":[{"type":"focus","target":"面板id","anchorId":"锚点id或空","at":0}]}；' +
    "5. focus表示你在屏幕中间原地讲解，并把身体朝向与手臂指向对应面板，target只能是上面列出的面板id；" +
    "若该面板提供了anchors，必须优先返回最贴近讲解内容的anchorId；" +
    "没有可用anchors时anchorId可省略；" +
    "6. 问题涉及某个面板时timeline放1个focus事件且at为0；" +
    "跨面板对比时最多2个focus事件，at按台词位置升序且间隔至少0.4；" +
    "7. 问题与所有面板都无关时timeline返回空数组，原地回答。"
  );
}

export function parseGuideReply(value, panels = []) {
  const source = String(value ?? "").trim();
  const panelIds = new Set(panels.map((panel) => panel.id));
  const panelAnchors = new Map(
    panels.map((panel) => [panel.id, new Set(Array.isArray(panel.anchors) ? panel.anchors : [])]),
  );
  const fallback = (text) => ({
    type: "avatar_response",
    version: 2,
    speech: {
      text: text.slice(0, MAX_REPLY_LENGTH) || "我暂时没有合适的回答。",
      language: "zh-CN",
    },
    timeline: [],
  });

  let parsed;
  try {
    const json = source
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    parsed = JSON.parse(json);
  } catch {
    return fallback(source);
  }

  const speechSource =
    typeof parsed?.speech?.text === "string" ? parsed.speech.text : parsed?.text;
  const text =
    typeof speechSource === "string" && speechSource.trim()
      ? speechSource.trim().slice(0, MAX_REPLY_LENGTH)
      : "我暂时没有合适的回答。";

  const timeline = (Array.isArray(parsed?.timeline) ? parsed.timeline : [])
    .filter(
      (event) => event?.type === "focus" && panelIds.has(event?.target),
    )
    .slice(0, MAX_FOCUS_EVENTS)
    .map((event) => {
      const rawAt = Number.isFinite(event.at) ? event.at : 0;
      const at = Math.round(Math.min(0.9, Math.max(0, rawAt)) * 100) / 100;
      const anchors = panelAnchors.get(event.target);
      const rawAnchorId = typeof event?.anchorId === "string" ? event.anchorId.trim() : "";
      const anchorId =
        rawAnchorId && anchors?.has(rawAnchorId) ? rawAnchorId : undefined;
      return anchorId
        ? { type: "focus", target: event.target, anchorId, at }
        : { type: "focus", target: event.target, at };
    })
    .sort((a, b) => a.at - b.at);

  return {
    type: "avatar_response",
    version: 2,
    speech: { text, language: "zh-CN" },
    timeline,
  };
}

/**
 * Dashboard guide endpoint: answers questions about on-page data panels and
 * tells the avatar which panel to point at from center-locked pose.
 * Mounted at /api/demo/guide
 */
export function createGuideRouter({
  env = process.env,
  fetchImpl = globalThis.fetch,
  maxRequests = 10,
  windowMs = 60_000,
} = {}) {
  const router = Router();
  const allowRequest = createRateLimiter({ maxRequests, windowMs });

  router.post("/", async (req, res) => {
    const cfg = readLlmEnv(env);
    if (!cfg.apiKey) {
      res.status(503).json({
        ok: false,
        error: "llm_not_configured",
        message: "DASHSCOPE_API_KEY is not configured",
      });
      return;
    }

    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({
        ok: false,
        error: "invalid_prompt",
        message: `prompt must contain 1-${MAX_PROMPT_LENGTH} characters`,
      });
      return;
    }

    const panels = sanitizePanels(req.body?.panels);
    if (panels.length === 0) {
      res.status(400).json({
        ok: false,
        error: "invalid_panels",
        message: "panels must contain at least one valid panel",
      });
      return;
    }
    const context = sanitizeGuideContext(req.body?.context);

    const clientKey = req.ip || req.socket.remoteAddress || "unknown";
    if (!allowRequest(clientKey)) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const upstream = await fetchImpl(cfg.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: "system", content: buildGuideSystemPrompt(panels, context) },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 420,
          temperature: 0.5,
        }),
        signal: controller.signal,
      });

      if (!upstream.ok) {
        const detail = (await upstream.text()).slice(0, 500);
        throw new Error(`DashScope HTTP ${upstream.status}: ${detail}`);
      }

      const payload = await upstream.json();
      const completion = payload?.choices?.[0]?.message?.content ?? "";
      const message = parseGuideReply(completion, panels);
      res.status(200).set({
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.json({ ok: true, message });
    } catch (error) {
      console.error("[api2] guide completion failed:", error);
      res.status(502).json({
        ok: false,
        error: "llm_request_failed",
        message: "Qwen completion failed",
      });
    } finally {
      clearTimeout(timeout);
    }
  });

  return router;
}
