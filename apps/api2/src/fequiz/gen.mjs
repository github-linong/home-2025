/**
 * fequiz 出题引擎：
 *  - 6 种题型定义与分值
 *  - AI 二次加工：把原始问答二次加工为 填空/选择/判断/问答/计算/应用（LLM 生成，失败走离线兜底）
 *  - 自动判分：客观题规则判分，主观题 LLM 判分（不可用时降级为“人工复核”）
 */
import { callLlm } from "./llm.mjs";

export const QTYPES = [
  { type: "fill", label: "填空题", baseScore: 6 },
  { type: "choice", label: "选择题", baseScore: 5 },
  { type: "judge", label: "判断题", baseScore: 3 },
  { type: "essay", label: "问答题", baseScore: 15 },
  { type: "calc", label: "计算题", baseScore: 12 },
  { type: "application", label: "应用题", baseScore: 20 },
];

export const BASE_SCORES = Object.fromEntries(QTYPES.map((q) => [q.type, q.baseScore]));
export const QTYPE_LABELS = Object.fromEntries(QTYPES.map((q) => [q.type, q.label]));
export const VALID_TYPES = QTYPES.map((q) => q.type);

export function isValidType(t) {
  return VALID_TYPES.includes(t);
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const truncate = (s, n) => (s && s.length > n ? `${s.slice(0, n)}…` : s || "");

/** Extract a compact “关键词” from a question title, used by the offline fallback. */
export function keyTerm(title) {
  let t = String(title || "");
  t = t.replace(/^.*?[:：]\s*/, "");
  t = t.replace(/[？?！!].*$/, "");
  t = t
    .replace(
      /^(说说你对|谈谈你对|请说说|请谈谈|请介绍|请说明|介绍一下|说说|谈谈|介绍|简述|解释|讲讲|聊一聊|谈一谈|说明|什么是|为什么|如何|怎么|哪些)\s*/,
      "",
    )
    .replace(/(的)?(理解|认识|定义|概念|原理|机制|区别|作用|特点|是什么|有哪些|使用场景|场景)[。，,.]?$/, "")
    .trim();
  const matches = t.match(
    /[A-Za-z_$][A-Za-z0-9_$.\-]*|[\u4e00-\u9fa5]{2,}|[^\s\u4e00-\u9fa5A-Za-z0-9]{2,}/g,
  );
  if (!matches) return t.slice(0, 12) || "该知识点";
  matches.sort((a, b) => b.length - a.length);
  return matches[0];
}

// ── 校验 + 兜底 ─────────────────────────────────────────────────────────────

export function normalizeVariant(qtype, obj) {
  if (!obj || typeof obj !== "object") return null;
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  switch (qtype) {
    case "fill": {
      const stem = s(obj.stem);
      const blanks = Array.isArray(obj.blanks)
        ? obj.blanks.map((b) => ({
            answers: Array.isArray(b?.answers) ? b.answers.map(s).filter(Boolean) : [],
          }))
        : [];
      if (!stem || blanks.length === 0 || blanks.some((b) => b.answers.length === 0)) return null;
      return { stem, blanks, explanation: s(obj.explanation) };
    }
    case "choice": {
      const stem = s(obj.stem);
      const options = Array.isArray(obj.options) ? obj.options.map(s).filter(Boolean) : [];
      const answerIndex = Number(obj.answerIndex);
      if (!stem || options.length < 2 || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
        return null;
      }
      return { stem, options, answerIndex, explanation: s(obj.explanation) };
    }
    case "judge": {
      const stem = s(obj.stem);
      if (!stem || typeof obj.answer !== "boolean") return null;
      return { stem, answer: obj.answer, explanation: s(obj.explanation) };
    }
    case "essay":
    case "calc":
    case "application": {
      const stem = s(obj.stem);
      const modelAnswer = s(obj.modelAnswer);
      if (!stem || !modelAnswer) return null;
      const keyList = qtype === "essay" ? "keyPoints" : qtype === "calc" ? "steps" : "criteria";
      const list = Array.isArray(obj[keyList]) ? obj[keyList].map(s).filter(Boolean) : [];
      return { stem, modelAnswer, [keyList]: list, explanation: s(obj.explanation) };
    }
    default:
      return null;
  }
}

export function fallbackVariant(question, qtype) {
  const title = String(question.title || "题目");
  const body = String(question.body || "");
  const term = keyTerm(title);
  const bullets = body
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter((l) => l.length > 2 && !l.startsWith("```") && !l.startsWith("!["))
    .slice(0, 5);
  const modelAnswer = truncate(body, 1200) || `参考答案：请参考原题解析。`;
  // 从正文中提取要点句子（去代码块、标题前缀、列表符号）
  const sentences = body
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n+/)
    .map((l) => l.replace(/^#{1,6}\s*/, "").replace(/^[-*•]\s*/, "").replace(/^\d+[.、)]\s*/, "").trim())
    .filter((l) => l.length >= 12 && l.length <= 90);
  switch (qtype) {
    case "fill": {
      const first = sentences[0] || title;
      const idx = first.indexOf(term);
      const stem = idx >= 0 ? `${first.slice(0, idx)}____${first.slice(idx + term.length)}` : `${title}，请填空：____`;
      return { stem, blanks: [{ answers: [term] }], explanation: `要点：${term}。详见原题解析。` };
    }
    case "choice": {
      // 正确答案取自正文真实要点，干扰项为明显错误说法（基于题目主题）
      const correct = sentences[0] || `“${term}”是前端面试核心考点，需掌握其原理与使用场景`;
      return {
        stem: `${title}（选择最准确的说法）`,
        options: [
          correct,
          `“${term}”与前端开发无关，仅存在于其它领域`,
          `“${term}”是一个已被废弃的旧特性，现代前端不需要掌握`,
          `“${term}”只能在浏览器中使用，Node.js 等其它环境完全用不到`,
        ],
        answerIndex: 0,
        explanation: `依据原题解析：${truncate(body, 300)}`,
      };
    }
    case "judge":
      return {
        stem: `“${term}”是前端面试的重要考点，需要理解其原理与适用场景。`,
        answer: true,
        explanation: `该表述正确，见原题解析。`,
      };
    case "essay":
      return {
        stem: title,
        modelAnswer,
        keyPoints: bullets.length ? bullets : [`掌握“${term}”的核心概念与使用场景`],
        explanation: "参考答案整理自原题解析。",
      };
    case "calc":
      return {
        stem: `针对“${term}”，请给出一个最小可运行的代码示例，并说明其执行结果。`,
        modelAnswer,
        steps: bullets.length ? bullets : ["先给出示例代码", "逐步说明执行结果"],
        explanation: "可结合原题中的示例代码作答。",
      };
    case "application":
      return {
        stem: `在实际业务中会用到“${term}”，请给出一个应用场景与实现思路。`,
        modelAnswer,
        criteria: bullets.length ? bullets : ["结合具体业务场景", "思路清晰、步骤完整"],
        explanation: "结合原题解析中的要点作答。",
      };
    default:
      return null;
  }
}

// ── AI 生成 ───────────────────────────────────────────────────────────────

/**
 * LLM 生成题型变体。
 * 分批调用：客观题（fill/choice/judge）与主观题（essay/calc/application）分开，
 * 控制单次输出长度，避免一次生成 6 类 JSON 超出模型 max_tokens 导致整题失败。
 */
const LLM_BATCHES = [
  { types: ["fill", "choice", "judge"], maxTokens: 1600 },
  { types: ["essay"], maxTokens: 2200 },
  { types: ["calc"], maxTokens: 2000 },
  { types: ["application"], maxTokens: 2200 },
];

export async function generateLlmVariants(question, types) {
  const want = Array.from(new Set(types.filter(isValidType)));
  const system =
    "你是资深前端面试官与在线出题专家。你会把一道面试问答二次加工为多种题型，" +
    "题干严谨、答案准确、难度适配，只输出 JSON。";
  const result = {};
  for (const batch of LLM_BATCHES) {
    const need = want.filter((t) => batch.types.includes(t));
    if (!need.length) continue;
    const user = `【原始题目】
${question.title}

【参考解析】
${truncate(question.body, 2500)}

请把这道题二次加工成以下题型（只输出一个 JSON 对象，键为题型，只输出要求中的题型）：
{
  "fill": {"stem":"含 ____ 空格的题干（空位用 ____ 表示）","blanks":[{"answers":["可接受的答案1","别名2"]}],"explanation":"简要解析"},
  "choice": {"stem":"题干","options":["选项A","选项B","选项C","选项D"],"answerIndex":0,"explanation":"简要解析"},
  "judge": {"stem":"可直接判对错的陈述句","answer":true,"explanation":"简要解析"},
  "essay": {"stem":"问答题干","modelAnswer":"参考答案（要点化、完整）","keyPoints":["评分要点1"],"explanation":"解析"},
  "calc": {"stem":"计算/代码输出类题干（给出代码与要求，如“写出输出顺序”）","modelAnswer":"参考答案","steps":["推导步骤1"],"explanation":"解析"},
  "application": {"stem":"场景化应用题题干（如“请实现XX / 如何优化XX”）","modelAnswer":"参考答案","criteria":["评分点1"],"explanation":"解析"}
}
要求：
- 本次需要生成的题型：${need.join("、")}
- choice 恰好 4 个选项、答案唯一；judge 必须是可判对错的判断句；fill 的空位数量与 blanks 一一对应；
- 题干必须基于原始题目改写，不得编造新考点；答案与解析严格依据参考解析；
- 全部使用中文；题目难度适中，贴近前端面试。`;
    const res = await callLlm(system, user, { temperature: 0.7, maxTokens: batch.maxTokens });
    if (res?.obj && typeof res.obj === "object") Object.assign(result, res.obj);
  }
  return result;
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

/** 出卷时发给前端的变体载荷：隐藏答案与解析。 */
export function publicPayload(qtype, payload) {
  switch (qtype) {
    case "fill":
      return { stem: payload.stem, blankCount: payload.blanks?.length || 1 };
    case "choice":
      return { stem: payload.stem, options: payload.options };
    case "judge":
      return { stem: payload.stem };
    case "essay":
    case "calc":
    case "application":
      return { stem: payload.stem };
    default:
      return payload;
  }
}

// ── 自动判分 ───────────────────────────────────────────────────────────────

const norm = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[。，,.;；：:！!？?]$/, "");

/** 客观题规则判分。 */
function gradeObjective(qtype, payload, userAnswer) {
  if (qtype === "choice") {
    // 未作答（null/undefined/空字符串）一律判错，
    // 防止 Number(null)===0 误匹配 answerIndex=0 而被判对的漏洞。
    if (userAnswer === null || userAnswer === undefined || userAnswer === "") return { correct: false };
    const idx = Number(userAnswer);
    return {
      correct:
        Number.isInteger(idx) &&
        idx >= 0 &&
        idx < (payload.options?.length || 0) &&
        idx === payload.answerIndex,
    };
  }
  if (qtype === "judge") {
    if (userAnswer !== true && userAnswer !== false) return { correct: false };
    return { correct: userAnswer === payload.answer };
  }
  if (qtype === "fill") {
    if (userAnswer === null || userAnswer === undefined) return { correct: false };
    const given = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
    let ok = true;
    for (let i = 0; i < payload.blanks.length; i++) {
      const g = norm(given[i]);
      if (!g || !payload.blanks[i].answers.map(norm).includes(g)) {
        ok = false;
        break;
      }
    }
    return { correct: ok };
  }
  return { correct: false };
}

/** 主观题 LLM 判分；失败返回 null（调用方降级为人工复核）。 */
async function gradeSubjectiveLlm(variant, userAnswer) {
  const p = variant.payload;
  const base = variant.base_score || 5;
  const answer = String(userAnswer ?? "").trim();
  if (!answer) return null;
  const system =
    "你是严格的前端面试判卷老师。依据参考答案与评分要点客观评分，只输出 JSON。";
  const user = `【题目】${p.stem}

【参考答案】${p.modelAnswer}

【评分要点】${Array.isArray(p.keyPoints) ? p.keyPoints.join("；") : Array.isArray(p.steps) ? p.steps.join("；") : Array.isArray(p.criteria) ? p.criteria.join("；") : "总体要点"} 

【满分】${base} 分

【学生作答】${answer}

请评分并输出：
{"score": 0-${base} 的整数, "verdict": "correct"|"partial"|"wrong", "comment": "50字以内的点评，指出关键问题或亮点"}`;
  const res = await callLlm(system, user, { temperature: 0.2, maxTokens: 1024 });
  if (!res?.obj) return null;
  const o = res.obj;
  const score = clamp(Math.round(Number(o.score)), 0, base);
  return {
    correct: o.verdict === "correct" ? true : o.verdict === "wrong" ? false : null,
    score,
    comment: String(o.comment || "").slice(0, 200),
  };
}

/**
 * 判定一道题的作答。返回 { correct, score, gradedBy, comment }。
 * correct: boolean（主观题无法自动判定时为 null）
 */
export async function gradeVariant(variant, userAnswer) {
  const payload = variant.payload;
  const base = variant.base_score || 5;
  const qtype = variant.qtype;

  if (qtype === "choice" || qtype === "judge" || qtype === "fill") {
    const { correct } = gradeObjective(qtype, payload, userAnswer);
    return { correct, score: correct ? base : 0, gradedBy: "rule", comment: null };
  }

  // 主观题：LLM 判分，失败则人工复核。
  const llm = await gradeSubjectiveLlm(variant, userAnswer);
  if (!llm) {
    return {
      correct: null,
      score: 0,
      gradedBy: "manual",
      comment: "AI 判分暂不可用，本题需人工复核。",
    };
  }
  return { correct: llm.correct, score: llm.score, gradedBy: "llm", comment: llm.comment };
}
