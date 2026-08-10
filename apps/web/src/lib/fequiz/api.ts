/** Thin client for the api2 `/api/fequiz/*` endpoints. */

import type { Overview, Quiz, ScoreResult } from "./types";

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  const text = await res.text();
  let data: T & { ok?: boolean; error?: string };
  try {
    data = JSON.parse(text) as T & { ok?: boolean; error?: string };
  } catch {
    throw new Error(
      text.trim() ? `invalid_json (${res.status})` : `empty_response (${res.status})`,
    );
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export const fequizApi = {
  /** 分类 + 题库统计总览。 */
  overview: () => apiJson<Overview>("/api/fequiz/overview"),

  /** 按技术栈 + 题型出卷（AI 二次加工按需生成并缓存）。 */
  createQuiz: (categories: string[], types: string[], count: number) =>
    apiJson<Quiz>("/api/fequiz/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories, types, count }),
    }),

  /** 交卷自动判分。 */
  score: (sessionId: number, answers: { variantId: number; answer: unknown }[]) =>
    apiJson<ScoreResult>(`/api/fequiz/quiz/${sessionId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    }),
};
