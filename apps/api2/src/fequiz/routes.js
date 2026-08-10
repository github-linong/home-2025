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

/**
 * @param {import("mysql2/promise").Pool} pool
 */
export function createFeQuizRouter(pool) {
  const router = Router();

  // ── 总览：分类 + 题目数量 + 难度分布 ───────────────────────────────
  router.get("/overview", async (_req, res) => {
    try {
      const [cats] = await pool.query(
        `SELECT c.id, c.slug, c.title, c.description, c.sort_order,
                COUNT(q.id) AS question_count,
                COALESCE(SUM(q.difficulty = 'easy'), 0)   AS easy,
                COALESCE(SUM(q.difficulty = 'medium'), 0) AS medium,
                COALESCE(SUM(q.difficulty = 'hard'), 0)   AS hard
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
      const [byModel] = await pool.query(
        `SELECT model, COUNT(*) AS n FROM fe_variants GROUP BY model ORDER BY model`,
      );
      res.json({
        ok: true,
        ...countsRow[0],
        byType,
        byDifficulty: byDiff,
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
    try {
      const body = req.body || {};
      const cats = Array.isArray(body.categories)
        ? body.categories.map((s) => String(s).trim()).filter(Boolean)
        : [];
      const types = Array.isArray(body.types)
        ? body.types.filter(isValidType)
        : QTYPES.map((q) => q.type);
      const count = clamp(Number(body.count) || 10, 1, 30);
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
      if (!catRows.length) {
        return res.status(404).json({ ok: false, error: "no_categories" });
      }

      // 每个分类均匀抽样，再合并打乱。
      const perCat = Math.ceil(count / catRows.length);
      const picked = [];
      for (const cat of catRows) {
        const [rows] = await pool.query(
          `SELECT id, title, difficulty, category_id
           FROM fe_questions
           WHERE category_id = ?
           ORDER BY RAND()
           LIMIT ?`,
          [cat.id, perCat],
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
      const questions = picked.slice(0, count);
      if (!questions.length) {
        return res.status(404).json({ ok: false, error: "no_questions" });
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

      const quizQuestions = [];
      let totalScore = 0;
      for (const q of questions) {
        const vList = variantsByQuestion.get(q.id) || [];
        if (!vList.length) continue;
        totalScore += vList.reduce((sum, v) => sum + (v.base_score || 0), 0);
        quizQuestions.push({
          questionId: q.id,
          title: q.title,
          difficulty: q.difficulty,
          category: q.category,
          categoryTitle: q.categoryTitle,
          variants: vList.map((v) => ({
            id: v.id,
            qtype: v.qtype,
            label: QTYPE_LABELS[v.qtype] || v.qtype,
            baseScore: v.base_score,
            payload: publicPayload(v.qtype, v.payload),
          })),
        });
      }

      if (!quizQuestions.length) {
        return res.status(404).json({ ok: false, error: "no_variants" });
      }

      const [sessionRes] = await pool.query(
        `INSERT INTO fe_sessions (config, total_score) VALUES (?, ?)`,
        [JSON.stringify({ categories: cats, types, count: quizQuestions.length }), totalScore],
      );
      const sessionId = sessionRes.insertId;

      res.json({
        ok: true,
        sessionId,
        totalScore,
        llmEnabled: llmEnabled(),
        generatedTypes: types,
        questions: quizQuestions,
      });
    } catch (err) {
      console.error("[fequiz] POST /quiz failed:", err);
      res.status(500).json({ ok: false, error: "quiz_error" });
    }
  });

  // ── 交卷自动判分 ─────────────────────────────────────────────────────
  router.post("/quiz/:id/score", async (req, res) => {
    try {
      const sessionId = Number(req.params.id);
      const body = req.body || {};
      const answers = Array.isArray(body.answers) ? body.answers : [];
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
                q.title AS question_title, q.difficulty
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
        results.push({
          variantId: variant.id,
          qtype: variant.qtype,
          qtypeLabel: QTYPE_LABELS[variant.qtype] || variant.qtype,
          questionTitle: variant.question_title,
          difficulty: variant.difficulty,
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
      res.status(500).json({ ok: false, error: "score_error" });
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
