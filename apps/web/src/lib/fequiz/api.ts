/** Thin client for the api2 `/api/fequiz/*` endpoints. */

import type { Favorite, Mistake, Overview, Quiz, ReviewItem, ScoreResult } from "./types";

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const t0 = performance.now();
  console.log("[fequiz] request 发出:", init?.method || "GET", path);
  const res = await fetch(path, { credentials: "same-origin", ...init });
  const text = await res.text();
  console.log(`[fequiz] request 返回: ${init?.method || "GET"} ${path} → HTTP ${res.status} (${Math.round(performance.now() - t0)}ms)`);
  let data: T & { ok?: boolean; error?: string };
  try {
    data = JSON.parse(text) as T & { ok?: boolean; error?: string };
  } catch {
    throw new Error(
      text.trim() ? `invalid_json (${res.status})` : `empty_response (${res.status})`,
    );
  }
  if (!res.ok || data.ok === false) {
    console.error("[fequiz] request 失败:", path, data.error || `HTTP ${res.status}`, text.slice(0, 200));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export const fequizApi = {
  /** 分类 + 题库统计总览。 */
  overview: () => apiJson<Overview>("/api/fequiz/overview"),

  /** 按技术栈 + 题型 + 难度范围出卷。difficulty 如 { min: 5, max: 8 }，不传则全难度；source: all|favorites|mistakes。 */
  createQuiz: (
    categories: string[],
    types: string[],
    count: number,
    difficulty?: { min: number; max: number } | null,
    source?: "all" | "favorites" | "mistakes",
  ) =>
    apiJson<Quiz>("/api/fequiz/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categories,
        types,
        count,
        difficulty: difficulty || undefined,
        source: source || undefined,
      }),
    }),

  /** 交卷自动判分。 */
  score: (sessionId: number, answers: { variantId: number; answer: unknown }[]) =>
    apiJson<ScoreResult>(`/api/fequiz/quiz/${sessionId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    }),

  // ── 评分 / Review ─────────────────────────────────────────────
  rate: (questionId: number, rating: number, comment?: string) =>
    apiJson<{ count: number; avg: number }>("/api/fequiz/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, rating, comment }),
    }),

  reviews: (threshold = 3) =>
    apiJson<{ threshold: number; reviews: ReviewItem[] }>(
      `/api/fequiz/reviews?threshold=${threshold}`,
    ),

  // ── 收藏 ───────────────────────────────────────────────────────
  favorites: () => apiJson<{ favorites: Favorite[] }>("/api/fequiz/favorites"),

  addFavorite: (questionId: number) =>
    apiJson<{ favorited: number }>(`/api/fequiz/favorites/${questionId}`, { method: "POST" }),

  removeFavorite: (questionId: number) =>
    apiJson<{ favorited: number }>(`/api/fequiz/favorites/${questionId}`, { method: "DELETE" }),

  // ── 错题本 ─────────────────────────────────────────────────────
  mistakes: () => apiJson<{ mistakes: Mistake[] }>("/api/fequiz/mistakes"),

  removeMistake: (variantId: number) =>
    apiJson<{ removed: number }>(`/api/fequiz/mistakes/${variantId}`, { method: "DELETE" }),
};
