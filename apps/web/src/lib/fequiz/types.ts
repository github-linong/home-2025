/**
 * Shared types for the「学前端」feature.
 * Shapes mirror the api2 `/api/fequiz/*` JSON responses (apps/api2/src/fequiz/routes.js).
 */

export type QType = "fill" | "choice" | "judge" | "essay" | "calc" | "application";
export type Difficulty = "easy" | "medium" | "hard";
export type GradedBy = "rule" | "llm" | "manual";

export type QTypeInfo = {
  type: QType;
  label: string;
  baseScore: number;
};

export type CategoryOverview = {
  id: number;
  slug: string;
  title: string;
  description: string;
  question_count: number;
  easy: number;
  medium: number;
  hard: number;
};

export type Overview = {
  categories: CategoryOverview[];
  totalQuestions: number;
  totalVariants: number;
  qtypes: QTypeInfo[];
  llmEnabled: boolean;
};

/** 出卷时发给前端的变体载荷（隐藏答案与解析）。 */
export type VariantPayload = {
  stem: string;
  options?: string[];
  blankCount?: number;
};

export type QuizVariant = {
  id: number;
  qtype: QType;
  label: string;
  baseScore: number;
  payload: VariantPayload;
};

export type QuizQuestion = {
  questionId: number;
  title: string;
  difficulty: Difficulty;
  category: string;
  categoryTitle: string;
  variants: QuizVariant[];
};

export type Quiz = {
  sessionId: number;
  totalScore: number;
  llmEnabled: boolean;
  generatedTypes: QType[];
  questions: QuizQuestion[];
};

/** 交卷后每道题的结果（payload 为完整载荷，含答案/解析）。 */
export type GradedResult = {
  variantId: number;
  qtype: QType;
  qtypeLabel: string;
  questionTitle: string;
  difficulty: Difficulty;
  baseScore: number;
  earned: number;
  correct: boolean | null;
  gradedBy: GradedBy;
  comment: string | null;
  payload: Record<string, any>;
};

export type ScoreResult = {
  sessionId: number;
  totalScore: number;
  earnedScore: number;
  rate: number;
  results: GradedResult[];
};
