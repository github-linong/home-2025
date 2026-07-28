import { Router } from "express";

const DEFAULT_ENDPOINT =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const MAX_PROMPT_LENGTH = 1_000;
const MAX_REPLY_LENGTH = 150;
const MAX_MOTIONS = 6;
const ALLOWED_MOTIONS = new Set([
  "none",
  "wave_right",
  "wave_left",
  "hand_raise",
  "hand_raise_left",
  "point",
  "thumbs_up",
  "thumbs_down",
  "ok_sign",
  "shrug_both",
  "nod_yes",
  "shake_no",
  "applause",
  "thinking_face",
  "celebrate",
  "bow",
  "side_step_left",
  "side_step_right",
  "turn_around",
]);
const SYSTEM_PROMPT =
  "你是一个正在和用户面对面说话的中文数字人。" +
  "规则：" +
  "1. 只用简体中文口语回答；" +
  "2. 直接说结论，不要开场白、客套、编号、列表或 Markdown；" +
  "3. 普通回答目标约100个汉字，绝对不要超过150个汉字；简单问候可以更短；" +
  "4. 回答要自然完整，用户要求表演、手势舞或连续动作时，台词要描述并配合动作；" +
  '5. 只输出一个JSON对象，格式必须为{"type":"avatar_response","version":1,' +
  '"speech":{"text":"完整台词","language":"zh-CN"},' +
  '"timeline":[{"type":"motion","name":"动作","at":0.0}]}；' +
  "6. timeline最多6项，目前每项type必须为motion；at是动作在整段语音中的相对位置，" +
  "范围0到0.95并按升序排列；" +
  "7. motion事件的name只能是wave_right、wave_left、hand_raise、hand_raise_left、point、" +
  "thumbs_up、thumbs_down、ok_sign、shrug_both、nod_yes、shake_no、applause、" +
  "thinking_face、celebrate、bow、side_step_left、side_step_right、turn_around；" +
  "8. 右手挥手用wave_right，左手挥手用wave_left，右手抬手用hand_raise，" +
  "左手抬手用hand_raise_left，指向用point，赞同或鼓励用thumbs_up，" +
  "否定用shake_no，鼓掌用applause，思考用thinking_face，庆祝用celebrate，" +
  "鞠躬用bow，向观众左侧走动用side_step_left，向观众右侧走动用side_step_right，" +
  "走动后会自动回到原位；转身、转圈、旋转必须用turn_around，" +
  "不要用走动或其他动作代替转圈；无需动作时timeline返回空数组；" +
  "9. 动作必须与对应位置的台词含义一致；手势舞按台词节奏编排多个不同动作，" +
  "例如挥手、指向、点赞、鼓掌、庆祝依次分布；" +
  "10. 每个动作需要约3秒才能做完：大约每15个汉字最多安排1个动作，宁少勿挤，" +
  "相邻动作的at间隔至少0.2。";

export function readLlmEnv(env = process.env) {
  return {
    apiKey: env.DASHSCOPE_API_KEY || "",
    endpoint: env.DASHSCOPE_LLM_ENDPOINT || DEFAULT_ENDPOINT,
    model: env.DASHSCOPE_LLM_MODEL || "qwen-flash",
  };
}

export function parseSseDataLine(line) {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  const payload = JSON.parse(data);
  const content = payload?.choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : null;
}

async function readCompletionText(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completion = "";

  const collectLines = (text) => {
    pending += text;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const content = parseSseDataLine(line);
      if (content) completion += content;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    collectLines(decoder.decode(value, { stream: true }));
  }
  collectLines(decoder.decode() + "\n");
  return completion;
}

export function parseAvatarReply(value, prompt = "") {
  const source = String(value ?? "").trim();
  let parsed;
  try {
    const json = source
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    parsed = JSON.parse(json);
  } catch {
    return {
      type: "avatar_response",
      version: 1,
      speech: {
        text: source.slice(0, MAX_REPLY_LENGTH) || "我暂时没有合适的回答。",
        language: "zh-CN",
      },
      timeline: [],
    };
  }

  const speechSource =
    typeof parsed?.speech?.text === "string" ? parsed.speech.text : parsed?.text;
  const text =
    typeof speechSource === "string" && speechSource.trim()
      ? speechSource.trim().slice(0, MAX_REPLY_LENGTH)
      : "我暂时没有合适的回答。";
  const candidates = Array.isArray(parsed?.timeline)
    ? parsed.timeline.filter((event) => event?.type === "motion")
    : Array.isArray(parsed?.motions)
      ? parsed.motions.map((motion) => ({ type: "motion", ...motion }))
    : parsed?.motion
      ? [{ type: "motion", name: parsed.motion, at: 0 }]
      : [];
  const timeline = candidates
    .slice(0, MAX_MOTIONS)
    .map((candidate, index) => {
      let name = ALLOWED_MOTIONS.has(candidate?.name) ? candidate.name : "none";
      const fallbackAt = candidates.length > 1 ? index / candidates.length : 0;
      const rawAt = Number.isFinite(candidate?.at) ? candidate.at : fallbackAt;
      const at = Math.round(Math.min(0.95, Math.max(0, rawAt)) * 100) / 100;

      if (name !== "none" && /左手|左边/.test(prompt)) {
        if (name === "wave_right") name = "wave_left";
        if (name === "hand_raise") name = "hand_raise_left";
      }
      if (name !== "none" && /右手|右边/.test(prompt)) {
        if (name === "wave_left") name = "wave_right";
        if (name === "hand_raise_left") name = "hand_raise";
      }
      return { type: "motion", name, at };
    })
    .filter(({ name }) => name !== "none")
    .sort((a, b) => a.at - b.at);

  return {
    type: "avatar_response",
    version: 1,
    speech: {
      text,
      language: "zh-CN",
    },
    timeline,
  };
}

export function createRateLimiter({ maxRequests = 10, windowMs = 60_000 } = {}) {
  const clients = new Map();
  return (key) => {
    if (maxRequests <= 0) return false;
    const now = Date.now();
    const current = clients.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      clients.set(key, { count: 1, startedAt: now });
      return true;
    }
    current.count += 1;
    return current.count <= maxRequests;
  };
}

/**
 * Chinese Qwen streaming proxy for the TalkingHead demo.
 * Mounted at /api/demo
 */
export function createDemoRouter({
  env = process.env,
  fetchImpl = globalThis.fetch,
  maxRequests = 10,
  windowMs = 60_000,
} = {}) {
  const router = Router();
  const allowRequest = createRateLimiter({ maxRequests, windowMs });

  router.post("/llm-stream", async (req, res) => {
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

    const clientKey = req.ip || req.socket.remoteAddress || "unknown";
    if (!allowRequest(clientKey)) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    const abortOnDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", abortOnDisconnect);

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
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          stream: true,
          response_format: { type: "json_object" },
          // Headroom for a 150-character answer and up to six motion cues.
          max_tokens: 420,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!upstream.ok) {
        const detail = (await upstream.text()).slice(0, 500);
        throw new Error(`DashScope HTTP ${upstream.status}: ${detail}`);
      }
      if (!upstream.body) throw new Error("DashScope returned no response body");

      const completion = await readCompletionText(upstream.body);
      const message = parseAvatarReply(completion, prompt);
      res.status(200).set({
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.json({ ok: true, message });
    } catch (error) {
      if (error?.name === "AbortError" && res.destroyed) return;
      console.error("[api2] Qwen completion failed:", error);
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(502).json({
        ok: false,
        error: "llm_request_failed",
        message: "Qwen completion failed",
      });
    } finally {
      clearTimeout(timeout);
      res.off("close", abortOnDisconnect);
    }
  });

  return router;
}
