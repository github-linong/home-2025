/**
 * OpenAI-compatible chat completions client (no extra deps).
 */

export function getLlmConfig() {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    throw new Error(
      "Missing LLM_API_KEY or OPENAI_API_KEY. Set in .env or environment before running."
    );
  }

  return { apiKey, baseUrl, model };
}

export async function chatJson({ messages, temperature = 0.3 }) {
  const { apiKey, baseUrl, model } = getLlmConfig();

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM API ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty content");

  return JSON.parse(content);
}
