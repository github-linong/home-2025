/**
 * 前端面试题库（fequiz）API（MySQL 版）。
 *
 * 题型变体在「导入时全量预处理」阶段生成（fe:import / fe:preprocess），
 * 出卷时直接从 fe_variants 读取，不再按需调 LLM。
 *
 *  - GET  /overview          分类 + 题库统计
 *  - GET  /stats             全库统计（含 6 种题型覆盖、AI 生成状态）
 *  - POST /quiz              按技术栈/题型出卷
 *  - POST /quiz/:id/score    交卷自动判分
 *  - GET  /sessions          最近考试记录
 */
import { Router } from "express";
import { gradeVariant, publicPayload, QTYPES, QTYPE_LABELS, isValidType } from "./gen.mjs";
import { llmEnabled } from "./llm.mjs";
import { fequizPool } from "./db.js";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const log = (...args) => console.log(`[fequiz] ${new Date().toISOString()}`, ...args);

/**
 * @param {import("mysql2/promise").Pool} pool
 */
export function createFeQuizRouter(pool) {
  const router = Router();

  // 请求日志中间件：记录每个 /api/fequiz/* 请求的方法、路径、IP、耗时
  router.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "-";
      const summary =
        req.method === "POST"
          ? `${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms) ip=${ip} body=${JSON.stringify(req.body || {}).slice(0, 200)}`
          : `${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms) ip=${ip}`;
      log(summary);
    });
    next();
  });

  // ── 总览：分类 + 题目数量 + 难度分布 ───────────────────────────────
  router.get("/overview", async (_req, res) => {
    try {
      const [cats] = await pool.query(
        `SELECT c.id, c.slug, c.title, c.description, c.sort_order,
                COUNT(q.id) AS question_count,
                COALESCE(SUM(q.difficulty = 'easy'), 0)   AS easy,
                COALESCE(SUM(q.difficulty = 'medium'), 0) AS medium,
                COALESCE(SUM(q.difficulty = 'hard'), 0)   AS hard,
                COALESCE(ROUND(AVG(q.difficulty_level), 1), 0) AS avg_level
         FROM fe_categories c
         LEFT JOIN fe_questions q ON q.category_id = c.id
         GROUP BY c.id
         ORDER BY c.sort_order ASC, c.id ASC`,
      );
      const [[stats]] = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM fe_questions) AS total_questions,
           (SELECT COUNT(*) FROM fe_variants)  AS total_variants`,
      );
      res.json({
        ok: true,
        categories: cats,
        totalQuestions: stats.total_questions,
        totalVariants: stats.total_variants,
        qtypes: QTYPES,
        llmEnabled: llmEnabled(),
      });
    } catch (err) {
      console.error("[fequiz] GET /overview failed:", err);
      res.status(500).json({ ok: false, error: "overview_error" });
    }
  });

  // ── 全库统计 ────────────────────────────────────────────────────────
  router.get("/stats", async (_req, res) => {
    try {
      const [countsRow] = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM fe_categories) AS categories,
           (SELECT COUNT(*) FROM fe_questions)  AS questions,
           (SELECT COUNT(*) FROM fe_variants)   AS variants,
           (SELECT COUNT(*) FROM fe_sessions)   AS sessions`,
      );
      const [byType] = await pool.query(
        `SELECT qtype, COUNT(*) AS n FROM fe_variants GROUP BY qtype ORDER BY qtype`,
      );
      const [byDiff] = await pool.query(
        `SELECT difficulty, COUNT(*) AS n FROM fe_questions GROUP BY difficulty ORDER BY difficulty`,
      );
      const [byLevel] = await pool.query(
        `SELECT difficulty_level AS level, COUNT(*) AS n
         FROM fe_questions GROUP BY difficulty_level ORDER BY difficulty_level`,
      );
      const [[levelAgg]] = await pool.query(
        `SELECT ROUND(AVG(difficulty_level), 1) AS avg_level,
                MIN(difficulty_level) AS min_level,
                MAX(difficulty_level) AS max_level
         FROM fe_questions`,
      );
      const [byModel] = await pool.query(
        `SELECT model, COUNT(*) AS n FROM fe_variants GROUP BY model ORDER BY model`,
      );
      res.json({
        ok: true,
        ...countsRow[0],
        byType,
        byDifficulty: byDiff,
        byLevel,
        levelStats: levelAgg,
        byModel,
        qtypes: QTYPES,
        llmEnabled: llmEnabled(),
      });
    } catch (err) {
      console.error("[fequiz] GET /stats failed:", err);
      res.status(500).json({ ok: false, error: "stats_error" });
    }
  });

  // ── 出卷：选择技术栈 + 题型 → 随机抽题（读预处理好的变体） ──────────
  router.post("/quiz", async (req, res) => {
    const t0 = Date.now();
    try {
      const body = req.body || {};
      const cats = Array.isArray(body.categories)
        ? body.categories.map((s) => String(s).trim()).filter(Boolean)
        : [];
      const types = Array.isArray(body.types)
        ? body.types.filter(isValidType)
        : QTYPES.map((q) => q.type);
      const count = clamp(Number(body.count) || 10, 1, 30);
      // 难度范围（1-10），如 { difficulty: { min: 5, max: 8 } }；不传则不过滤。
      const diffRange = body.difficulty && typeof body.difficulty === "object"
        ? { min: clamp(Number(body.difficulty.min) || 1, 1, 10), max: clamp(Number(body.difficulty.max) || 10, 1, 10) }
        : null;
      // 出题来源：all | favorites | mistakes
      const source = body.source === "favorites" || body.source === "mistakes" ? body.source : "all";
      log(`POST /quiz 开始 categories=${JSON.stringify(cats)} types=${JSON.stringify(types)} count=${count} difficulty=${JSON.stringify(diffRange)} source=${source}`);
      if (!types.length) {
        return res.status(400).json({ ok: false, error: "no_valid_types" });
      }

      // 选中的技术栈（为空 = 全部）
      let catRows;
      if (cats.length) {
        const placeholders = cats.map(() => "?").join(",");
        const [r] = await pool.query(
          `SELECT id, slug, title FROM fe_categories WHERE slug IN (${placeholders}) ORDER BY sort_order ASC`,
          cats,
        );
        catRows = r;
      } else {
        const [r] = await pool.query(
          `SELECT id, slug, title FROM fe_categories ORDER BY sort_order ASC`,
        );
        catRows = r;
      }
      if (!catRows.length && source === "all") {
        return res.status(404).json({ ok: false, error: "no_categories" });
      }

      // 抽题
      let questions;
      if (source === "favorites" || source === "mistakes") {
        // 从收藏/错题中抽题（可叠加技术栈与难度过滤）
        const join = source === "favorites"
          ? "JOIN fe_favorites fav ON fav.question_id = q.id"
          : "JOIN fe_mistakes mk ON mk.question_id = q.id";
        let sql = `SELECT q.id, q.title, q.difficulty, q.difficulty_level, q.category_id,
                          c.slug AS category, c.title AS categoryTitle
                   FROM fe_questions q
                   JOIN fe_categories c ON c.id = q.category_id
                   ${join}
                   WHERE 1=1`;
        const params = [];
        if (cats.length) {
          sql += ` AND c.slug IN (${cats.map(() => "?").join(",")})`;
          params.push(...cats);
        }
        if (diffRange) {
          sql += ` AND q.difficulty_level BETWEEN ? AND ?`;
          params.push(diffRange.min, diffRange.max);
        }
        sql += ` ORDER BY RAND() LIMIT ?`;
        params.push(count);
        const [rows] = await pool.query(sql, params);
        questions = rows.slice(0, count);
      } else {
        // 每个分类均匀抽样，再合并打乱。
        const perCat = Math.ceil(count / catRows.length);
        const levelClause = diffRange ? " AND difficulty_level BETWEEN ? AND ?" : "";
        const picked = [];
        for (const cat of catRows) {
          const [rows] = await pool.query(
            `SELECT id, title, difficulty, difficulty_level, category_id
             FROM fe_questions
             WHERE category_id = ?${levelClause}
             ORDER BY RAND()
             LIMIT ?`,
            diffRange ? [cat.id, diffRange.min, diffRange.max, perCat] : [cat.id, perCat],
          );
          for (const q of rows) {
            picked.push({ ...q, category: cat.slug, categoryTitle: cat.title });
          }
        }
        // 洗牌
        for (let i = picked.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [picked[i], picked[j]] = [picked[j], picked[i]];
        }
        questions = picked.slice(0, count);
      }
      if (!questions.length) {
        return res.status(404).json({ ok: false, error: source === "all" ? "no_questions" : `no_${source}` });
      }

      // 读取预处理好的变体（只取所选题型）
      const qIds = questions.map((q) => q.id);
      const ph = qIds.map(() => "?").join(",");
      const [variants] = await pool.query(
        `SELECT id, question_id, qtype, payload, base_score, model
         FROM fe_variants
         WHERE question_id IN (${ph}) AND qtype IN (${types.map(() => "?").join(",")})
         ORDER BY question_id, FIELD(qtype, ${types.map(() => "?").join(",")})`,
        [...qIds, ...types, ...types],
      );
      const variantsByQuestion = new Map();
      for (const v of variants) {
        v.payload = typeof v.payload === "string" ? JSON.parse(v.payload) : v.payload;
        if (!variantsByQuestion.has(v.question_id)) variantsByQuestion.set(v.question_id, []);
        variantsByQuestion.get(v.question_id).push(v);
      }

      // 查询收藏状态
      const favSet = new Set();
      if (qIds.length) {
        const [favRows] = await pool.query(
          `SELECT question_id FROM fe_favorites WHERE question_id IN (${ph})`,
          qIds,
        );
        for (const r of favRows) favSet.add(r.question_id);
      }

      const quizQuestions = [];
      let totalScore = 0;
      for (const q of questions) {
        const vList = variantsByQuestion.get(q.id) || [];
        if (!vList.length) continue;
        // 每道原题只随机分配 1 种题型，使“题目数量”= 实际小题数（10-20 道左右），避免题量爆炸。
        const v = vList[Math.floor(Math.random() * vList.length)];
        totalScore += v.base_score || 0;
        quizQuestions.push({
          questionId: q.id,
          title: q.title,
          difficulty: q.difficulty,
          difficultyLevel: q.difficulty_level ?? null,
          category: q.category,
          categoryTitle: q.categoryTitle,
          favorited: favSet.has(q.id) ? 1 : 0,
          variants: [
            {
              id: v.id,
              qtype: v.qtype,
              label: QTYPE_LABELS[v.qtype] || v.qtype,
              baseScore: v.base_score,
              payload: publicPayload(v.qtype, v.payload),
            },
          ],
        });
      }

      if (!quizQuestions.length) {
        return res.status(404).json({ ok: false, error: "no_variants" });
      }

      const [sessionRes] = await pool.query(
        `INSERT INTO fe_sessions (config, total_score) VALUES (?, ?)`,
        [JSON.stringify({ categories: cats, types, count: quizQuestions.length, source }), totalScore],
      );
      const sessionId = sessionRes.insertId;

      log(`POST /quiz 完成 session=${sessionId} 题数=${quizQuestions.length} 满分=${totalScore} source=${source} 耗时=${Date.now() - t0}ms`);
      res.json({
        ok: true,
        sessionId,
        totalScore,
        llmEnabled: llmEnabled(),
        generatedTypes: types,
        source,
        questions: quizQuestions,
      });
    } catch (err) {
      console.error("[fequiz] POST /quiz failed:", err);
      log(`POST /quiz 失败 耗时=${Date.now() - t0}ms err=${err?.message || err}`);
      res.status(500).json({ ok: false, error: "quiz_error" });
    }
  });

  // ── 交卷自动判分 ─────────────────────────────────────────────────────
  router.post("/quiz/:id/score", async (req, res) => {
    const t0 = Date.now();
    try {
      const sessionId = Number(req.params.id);
      const body = req.body || {};
      const answers = Array.isArray(body.answers) ? body.answers : [];
      log(`POST /score 开始 session=${sessionId} 作答数=${answers.length}`);
      if (!answers.length) {
        return res.status(400).json({ ok: false, error: "no_answers" });
      }

      const [[sessionRow]] = await pool.query(`SELECT id FROM fe_sessions WHERE id = ?`, [sessionId]);
      if (!sessionRow) {
        return res.status(404).json({ ok: false, error: "session_not_found" });
      }

      const variantIds = answers.map((a) => Number(a.variantId)).filter((n) => Number.isFinite(n));
      const ph = variantIds.map(() => "?").join(",");
      const [variantRows] = await pool.query(
        `SELECT v.id, v.question_id, v.qtype, v.payload, v.base_score, v.model,
                q.title AS question_title, q.difficulty, q.difficulty_level
         FROM fe_variants v
         JOIN fe_questions q ON q.id = v.question_id
         WHERE v.id IN (${ph})`,
        variantIds,
      );
      const variantById = new Map();
      for (const v of variantRows) {
        v.payload = typeof v.payload === "string" ? JSON.parse(v.payload) : v.payload;
        variantById.set(v.id, v);
      }

      const results = [];
      let totalScore = 0;
      let earnedScore = 0;
      for (const item of answers) {
        const variant = variantById.get(Number(item.variantId));
        if (!variant) continue;
        const grade = await gradeVariant(variant, item.answer);
        totalScore += variant.base_score || 0;
        earnedScore += grade.score;
        await pool.query(
          `INSERT INTO fe_answers (session_id, variant_id, user_answer, is_correct, score, graded_by, comment)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            variant.id,
            JSON.stringify(item.answer ?? null),
            grade.correct === null ? null : grade.correct ? 1 : 0,
            grade.score,
            grade.gradedBy,
            grade.comment,
          ],
        );
        // 答错自动记入错题本（按 variant 累计错次）
        if (grade.correct === false) {
          await pool.query(
            `INSERT INTO fe_mistakes (question_id, variant_id, wrong_count, last_answer, last_wrong_at)
             VALUES (?, ?, 1, ?, NOW())
             ON DUPLICATE KEY UPDATE
               wrong_count = wrong_count + 1,
               last_answer = VALUES(last_answer),
               last_wrong_at = NOW()`,
            [variant.question_id, variant.id, JSON.stringify(item.answer ?? null)],
          );
        }
        results.push({
          variantId: variant.id,
          questionId: variant.question_id,
          qtype: variant.qtype,
          qtypeLabel: QTYPE_LABELS[variant.qtype] || variant.qtype,
          questionTitle: variant.question_title,
          difficulty: variant.difficulty,
          difficultyLevel: variant.difficulty_level ?? null,
          baseScore: variant.base_score || 0,
          earned: grade.score,
          correct: grade.correct,
          gradedBy: grade.gradedBy,
          comment: grade.comment,
          payload: variant.payload,
        });
      }

      await pool.query(
        `UPDATE fe_sessions SET total_score = ?, earned_score = ? WHERE id = ?`,
        [totalScore, earnedScore, sessionId],
      );

      log(`POST /score 完成 session=${sessionId} ${earnedScore}/${totalScore}分 耗时=${Date.now() - t0}ms`);
      res.json({
        ok: true,
        sessionId,
        totalScore,
        earnedScore,
        rate: totalScore > 0 ? Math.round((earnedScore / totalScore) * 1000) / 10 : 0,
        results,
      });
    } catch (err) {
      console.error("[fequiz] POST /quiz/:id/score failed:", err);
      log(`POST /score 失败 session=${req.params.id} 耗时=${Date.now() - t0}ms err=${err?.message || err}`);
      res.status(500).json({ ok: false, error: "score_error" });
    }
  });

  // ── 题目评分（1-5 星，可带评价） ───────────────────────────────────
  router.post("/rate", async (req, res) => {
    try {
      const questionId = Number(req.body?.questionId);
      const rating = Number(req.body?.rating);
      const comment = String(req.body?.comment ?? "").trim().slice(0, 500) || null;
      if (!Number.isFinite(questionId) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ ok: false, error: "invalid_rating" });
      }
      const [[q]] = await pool.query(`SELECT id FROM fe_questions WHERE id = ?`, [questionId]);
      if (!q) return res.status(404).json({ ok: false, error: "question_not_found" });
      const [ins] = await pool.query(
        `INSERT INTO fe_ratings (question_id, rating, comment) VALUES (?, ?, ?)`,
        [questionId, rating, comment],
      );
      const [[agg]] = await pool.query(
        `SELECT COUNT(*) AS count, ROUND(AVG(rating), 1) AS avg
         FROM fe_ratings WHERE question_id = ?`,
        [questionId],
      );
      log(`POST /rate question=${questionId} rating=${rating} 总评分=${agg.count} 平均=${agg.avg}`);
      res.json({ ok: true, ratingId: ins.insertId, count: agg.count, avg: agg.avg });
    } catch (err) {
      console.error("[fequiz] POST /rate failed:", err);
      res.status(500).json({ ok: false, error: "rate_error" });
    }
  });

  // ── 低分题 Review：平均分 ≤ threshold 且有人评分的题 ───────────────
  router.get("/reviews", async (req, res) => {
    try {
      const threshold = clamp(Number(req.query.threshold) || 3, 1, 5);
      const limit = clamp(Number(req.query.limit) || 20, 1, 100);
      const [rows] = await pool.query(
        `SELECT q.id, q.title, q.difficulty, q.difficulty_level, q.body,
                c.slug AS category, c.title AS categoryTitle,
                COUNT(r.id) AS rating_count,
                ROUND(AVG(r.rating), 1) AS avg_rating,
                MAX(r.created_at) AS last_rated_at
         FROM fe_ratings r
         JOIN fe_questions q ON q.id = r.question_id
         JOIN fe_categories c ON c.id = q.category_id
         GROUP BY q.id
         HAVING avg_rating <= ?
         ORDER BY avg_rating ASC, rating_count DESC
         LIMIT ?`,
        [threshold, limit],
      );
      res.json({ ok: true, threshold, reviews: rows });
    } catch (err) {
      console.error("[fequiz] GET /reviews failed:", err);
      res.status(500).json({ ok: false, error: "reviews_error" });
    }
  });

  // ── 收藏：增 / 删 / 查 ──────────────────────────────────────────────
  router.get("/favorites", async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT q.id AS question_id, q.title, q.difficulty, q.difficulty_level,
                c.title AS categoryTitle, f.created_at
         FROM fe_favorites f
         JOIN fe_questions q ON q.id = f.question_id
         JOIN fe_categories c ON c.id = q.category_id
         ORDER BY f.created_at DESC`,
      );
      res.json({ ok: true, favorites: rows });
    } catch (err) {
      console.error("[fequiz] GET /favorites failed:", err);
      res.status(500).json({ ok: false, error: "favorites_error" });
    }
  });

  router.post("/favorites/:questionId", async (req, res) => {
    try {
      const questionId = Number(req.params.questionId);
      const [[q]] = await pool.query(`SELECT id FROM fe_questions WHERE id = ?`, [questionId]);
      if (!q) return res.status(404).json({ ok: false, error: "question_not_found" });
      await pool.query(
        `INSERT IGNORE INTO fe_favorites (question_id) VALUES (?)`,
        [questionId],
      );
      res.json({ ok: true, favorited: 1 });
    } catch (err) {
      console.error("[fequiz] POST /favorites failed:", err);
      res.status(500).json({ ok: false, error: "favorite_add_error" });
    }
  });

  router.delete("/favorites/:questionId", async (req, res) => {
    try {
      const questionId = Number(req.params.questionId);
      await pool.query(`DELETE FROM fe_favorites WHERE question_id = ?`, [questionId]);
      res.json({ ok: true, favorited: 0 });
    } catch (err) {
      console.error("[fequiz] DELETE /favorites failed:", err);
      res.status(500).json({ ok: false, error: "favorite_remove_error" });
    }
  });

  // ── 错题本：查 / 移除 ───────────────────────────────────────────────
  router.get("/mistakes", async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT m.id AS mistake_id, m.variant_id, m.wrong_count, m.last_wrong_at,
                q.id AS question_id, q.title, q.difficulty, q.difficulty_level,
                v.qtype, v.payload,
                c.title AS categoryTitle
         FROM fe_mistakes m
         JOIN fe_questions q ON q.id = m.question_id
         JOIN fe_variants v ON v.id = m.variant_id
         JOIN fe_categories c ON c.id = q.category_id
         ORDER BY m.last_wrong_at DESC`,
      );
      for (const r of rows) {
        r.payload = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
      }
      res.json({ ok: true, mistakes: rows });
    } catch (err) {
      console.error("[fequiz] GET /mistakes failed:", err);
      res.status(500).json({ ok: false, error: "mistakes_error" });
    }
  });

  router.delete("/mistakes/:variantId", async (req, res) => {
    try {
      const variantId = Number(req.params.variantId);
      const [del] = await pool.query(`DELETE FROM fe_mistakes WHERE variant_id = ?`, [variantId]);
      res.json({ ok: true, removed: del.affectedRows });
    } catch (err) {
      console.error("[fequiz] DELETE /mistakes failed:", err);
      res.status(500).json({ ok: false, error: "mistake_remove_error" });
    }
  });

  // ── 最近考试记录 ─────────────────────────────────────────────────────
  router.get("/sessions", async (req, res) => {
    try {
      const limit = clamp(Number(req.query.limit) || 10, 1, 50);
      const [rows] = await pool.query(
        `SELECT id, config, total_score, earned_score, created_at
         FROM fe_sessions
         ORDER BY id DESC
         LIMIT ?`,
        [limit],
      );
      res.json({ ok: true, sessions: rows });
    } catch (err) {
      console.error("[fequiz] GET /sessions failed:", err);
      res.status(500).json({ ok: false, error: "sessions_error" });
    }
  });

  return router;
}

/** 供 server.js 使用默认连接池的工厂。 */
export function defaultFeQuizRouter() {
  return createFeQuizRouter(fequizPool());
}
