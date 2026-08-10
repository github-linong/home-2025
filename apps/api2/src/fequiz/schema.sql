-- fequiz 前端面试题库（MySQL 版，幂等：可重复执行）
-- 数据源：https://github.com/febobo/web-interview

CREATE TABLE IF NOT EXISTS fe_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL,
  title VARCHAR(128) NOT NULL,
  description VARCHAR(512) NOT NULL DEFAULT '',
  source VARCHAR(32) NOT NULL DEFAULT 'web-interview',
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fe_categories_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fe_questions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED NOT NULL,
  slug VARCHAR(160) NOT NULL,
  title VARCHAR(500) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  difficulty VARCHAR(16) NOT NULL DEFAULT 'medium',
  source_file VARCHAR(255) DEFAULT NULL,
  processed TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fe_questions_cat_slug (category_id, slug),
  KEY idx_fe_questions_category (category_id),
  KEY idx_fe_questions_processed (processed),
  CONSTRAINT fk_fe_questions_category FOREIGN KEY (category_id)
    REFERENCES fe_categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI 二次加工后的题型变体（同一原题最多 6 种题型）
CREATE TABLE IF NOT EXISTS fe_variants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id INT UNSIGNED NOT NULL,
  qtype ENUM('fill','choice','judge','essay','calc','application') NOT NULL,
  payload JSON NOT NULL,
  base_score INT NOT NULL DEFAULT 5,
  model VARCHAR(16) NOT NULL DEFAULT 'fallback',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fe_variants_qid_qtype (question_id, qtype),
  KEY idx_fe_variants_question (question_id),
  CONSTRAINT fk_fe_variants_question FOREIGN KEY (question_id)
    REFERENCES fe_questions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fe_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  config JSON NOT NULL,
  total_score INT NOT NULL DEFAULT 0,
  earned_score INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fe_answers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id INT UNSIGNED NOT NULL,
  variant_id INT UNSIGNED NOT NULL,
  user_answer JSON,
  is_correct TINYINT,
  score INT NOT NULL DEFAULT 0,
  graded_by VARCHAR(16) NOT NULL DEFAULT 'rule',
  comment VARCHAR(512) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fe_answers_session (session_id),
  KEY idx_fe_answers_variant (variant_id),
  CONSTRAINT fk_fe_answers_session FOREIGN KEY (session_id)
    REFERENCES fe_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_fe_answers_variant FOREIGN KEY (variant_id)
    REFERENCES fe_variants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
