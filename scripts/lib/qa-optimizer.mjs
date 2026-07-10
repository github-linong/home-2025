/**
 * @deprecated Use scripts/optimize-sf-answers-llm.mjs instead (rule-based fallback only).
 */

const TECH_HINTS = [
  ["Vue", /\bvue\b|element-ui|el-|ant-design-vue/i],
  ["React", /\breact\b|jsx|tsx/i],
  ["JavaScript", /\bjavascript\b|\bjs\b|es6|typescript/i],
  ["CSS", /\bcss\b|flex|grid|ellipsis|样式/i],
  ["Node.js", /node\.?js|npm|webpack/i],
  ["Canvas", /canvas/i],
  ["跨域", /跨域|cors|jsonp/i],
  ["jQuery", /jquery|\$\(/i],
  ["正则", /正则|regex/i],
];

function detectTech(text) {
  return TECH_HINTS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function inferGoal(text) {
  if (/去重|排序|去重复/.test(text)) return "希望获得清晰、可运行的去重或排序实现方案。";
  if (/怎么|如何|怎样|为什么|为何/.test(text)) {
    if (/实现|完成|做到/.test(text)) return "希望了解可行的实现方式或解决思路。";
    if (/为什么|为何/.test(text)) return "希望理解背后的原因或机制。";
    return "希望获得清晰、可落地的解答。";
  }
  if (/求|请教|有没有/.test(text)) return "希望获得示例代码或推荐方案。";
  return "希望问题描述更清晰，便于检索与讨论。";
}

export function optimizeQuestion(original) {
  const text = (original || "").trim();
  if (!text) return "";

  const tech = detectTech(text);
  const lines = ["### 问题概述", "", text];

  if (tech.length) {
    lines.push("", "### 涉及技术", "", tech.join("、"));
  }

  lines.push("", "### 期望结果", "", inferGoal(text));
  return lines.join("\n");
}

function splitCodeBlocks(text) {
  const prose = [];
  const code = [];
  const parts = text.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    if (part.startsWith("```")) {
      code.push(part.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim());
    } else {
      const cleaned = part
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n\n");
      if (cleaned) prose.push(cleaned);
    }
  }

  if (code.length === 0) {
    const bracketIdx = text.search(/\[\s*\{/);
    if (bracketIdx !== -1) {
      prose.push(text.slice(0, bracketIdx).trim());
      code.push(text.slice(bracketIdx).trim());
    } else if (/^[\[{]|function\s*\(|const\s|let\s|var\s|<\w+/.test(text.trim())) {
      code.push(text.trim());
    } else {
      prose.push(text.trim());
    }
  }

  return { prose: prose.join("\n\n"), code };
}

function firstSentence(text) {
  const m = text.match(/^[^。！？\n]+[。！？]?/);
  return m ? m[0].trim() : text.slice(0, 120);
}

function formatProse(text) {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function optimizeAnswer(original) {
  const text = (original || "").trim();
  if (!text) return "";

  const { prose, code } = splitCodeBlocks(text);
  const lines = [];

  lines.push("### 解答思路", "");
  lines.push(firstSentence(prose || "核心方案如下。"));

  if (code.length) {
    lines.push("", "### 示例代码", "");
    for (const block of code) {
      lines.push("```js", block, "```", "");
    }
  }

  if (prose) {
    lines.push("### 详细说明", "", formatProse(prose));
  }

  lines.push("", "### 小结", "", summarize(prose, code.length > 0));
  return lines.join("\n").trim();
}

function summarize(prose, hasCode) {
  if (!prose && hasCode) return "可直接参考上方代码示例。";
  const s = prose.replace(/\s+/g, "");
  if (s.length <= 40) return prose;
  return firstSentence(prose) || "以上为该问题的参考解答。";
}

export function buildQaRecord({ questionTitle, answerOriginal, questionBody = "" }) {
  const questionOriginal = (questionBody || questionTitle || "").trim();
  const answer = (answerOriginal || "").trim();

  return {
    questionOriginal,
    answerOriginal: answer,
    questionOptimized: optimizeQuestion(questionOriginal),
    answerOptimized: optimizeAnswer(answer),
    optimizedAt: new Date().toISOString(),
  };
}
