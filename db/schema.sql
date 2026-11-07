-- SkillForge - PostgreSQL schema
-- WARNING: drops and recreates every SkillForge table.
-- Run with:  npm run db:setup

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS
  audit_logs, notifications, user_achievements, achievements, progress, roadmap_items, roadmaps,
  learning_resources, attempt_answers, assessment_attempts, assessment_questions, assessments,
  question_skills, question_options, questions, user_skills, skills, skill_categories,
  password_resets, user_roles, users, roles, "session"
CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

CREATE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE "session" (
  sid    VARCHAR      NOT NULL COLLATE "default",
  sess   JSON         NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);
CREATE INDEX idx_session_expire ON "session" (expire);

CREATE TABLE roles (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(30) NOT NULL UNIQUE CHECK (name IN ('user', 'content_manager', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                VARCHAR(120) NOT NULL,
  email               VARCHAR(255) NOT NULL UNIQUE,
  password_hash       TEXT         NOT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  career_goal         VARCHAR(120),
  bio                 TEXT,
  email_notifications BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_lowercase CHECK (email = LOWER(email))
);

CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE password_resets (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE skill_categories (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE skills (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id INTEGER      NOT NULL REFERENCES skill_categories (id) ON DELETE RESTRICT,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  threshold   SMALLINT     NOT NULL DEFAULT 70 CHECK (threshold BETWEEN 0 AND 100),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE user_skills (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skill_id         INTEGER      NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  score            NUMERIC(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  previous_score   NUMERIC(5,2) CHECK (previous_score BETWEEN 0 AND 100),
  last_assessed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, skill_id)
);

CREATE TABLE questions (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  text        TEXT        NOT NULL,
  type        VARCHAR(30) NOT NULL DEFAULT 'multiple_choice' CHECK (type IN ('multiple_choice')),
  difficulty  VARCHAR(20) NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  explanation TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by  INTEGER     REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE question_options (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  option_text TEXT    NOT NULL,
  is_correct  BOOLEAN NOT NULL DEFAULT FALSE
);

-- Exactly one correct option per multiple-choice question.
CREATE UNIQUE INDEX uq_question_one_correct_option ON question_options (question_id) WHERE is_correct;

CREATE TABLE question_skills (
  question_id INTEGER NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  skill_id    INTEGER NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, skill_id)
);

CREATE TABLE assessments (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  time_limit  INTEGER      NOT NULL DEFAULT 30 CHECK (time_limit BETWEEN 1 AND 300),
  status      VARCHAR(20)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by  INTEGER      REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE assessment_questions (
  assessment_id  INTEGER      NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  question_id    INTEGER      NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  question_order INTEGER      NOT NULL CHECK (question_order >= 1),
  marks          NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (marks > 0),
  PRIMARY KEY (assessment_id, question_id),
  CONSTRAINT uq_assessment_question_order UNIQUE (assessment_id, question_order) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE assessment_attempts (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_id INTEGER      NOT NULL REFERENCES assessments (id) ON DELETE RESTRICT,
  user_id       INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  total_marks   NUMERIC(7,2),
  earned_marks  NUMERIC(7,2),
  score         NUMERIC(5,2) CHECK (score BETWEEN 0 AND 100),
  status        VARCHAR(20)  NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned'))
);

CREATE UNIQUE INDEX uq_attempts_one_active ON assessment_attempts (user_id, assessment_id) WHERE status = 'in_progress';

CREATE TABLE attempt_answers (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id         INTEGER      NOT NULL REFERENCES assessment_attempts (id) ON DELETE CASCADE,
  question_id        INTEGER      NOT NULL REFERENCES questions (id) ON DELETE RESTRICT,
  selected_option_id INTEGER      REFERENCES question_options (id) ON DELETE SET NULL,
  is_correct         BOOLEAN,
  marks_awarded      NUMERIC(5,2) NOT NULL DEFAULT 0,
  answered_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE learning_resources (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  skill_id      INTEGER      NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  resource_type VARCHAR(30)  NOT NULL CHECK (resource_type IN ('Article', 'Video', 'Documentation', 'Tutorial', 'Practice', 'Project')),
  url           TEXT         NOT NULL,
  difficulty    VARCHAR(20)  NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  status        VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE roadmaps (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  career_goal  VARCHAR(120),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed'))
);

CREATE UNIQUE INDEX uq_roadmaps_one_active ON roadmaps (user_id) WHERE status = 'active';

CREATE TABLE roadmap_items (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  roadmap_id  INTEGER      NOT NULL REFERENCES roadmaps (id) ON DELETE CASCADE,
  skill_id    INTEGER      NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
  resource_id INTEGER      REFERENCES learning_resources (id) ON DELETE SET NULL,
  priority    SMALLINT     NOT NULL CHECK (priority >= 1),
  skill_gap   NUMERIC(5,2) NOT NULL DEFAULT 0,
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date    DATE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE progress (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  roadmap_item_id  INTEGER     NOT NULL REFERENCES roadmap_items (id) ON DELETE CASCADE,
  progress_percent SMALLINT    NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  completed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, roadmap_item_id)
);

CREATE TABLE achievements (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT         NOT NULL,
  rule_key    VARCHAR(60)  NOT NULL UNIQUE,
  icon        VARCHAR(50)  NOT NULL DEFAULT 'fa-award',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE user_achievements (
  user_id        INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id INTEGER     NOT NULL REFERENCES achievements (id) ON DELETE CASCADE,
  earned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE notifications (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      VARCHAR(200) NOT NULL,
  message    TEXT         NOT NULL,
  is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
  link       VARCHAR(255),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id INTEGER     REFERENCES users (id) ON DELETE SET NULL,
  action        VARCHAR(60) NOT NULL,
  entity_type   VARCHAR(60) NOT NULL,
  entity_id     INTEGER,
  old_data      JSONB,
  new_data      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_status             ON users (status);
CREATE INDEX idx_users_created_at         ON users (created_at);
CREATE INDEX idx_user_roles_role_id       ON user_roles (role_id);
CREATE INDEX idx_password_resets_user_id  ON password_resets (user_id);
CREATE INDEX idx_skills_category_id       ON skills (category_id);
CREATE INDEX idx_user_skills_user_id      ON user_skills (user_id);
CREATE INDEX idx_user_skills_skill_id     ON user_skills (skill_id);
CREATE INDEX idx_questions_status         ON questions (status);
CREATE INDEX idx_questions_difficulty     ON questions (difficulty);
CREATE INDEX idx_question_options_qid     ON question_options (question_id);
CREATE INDEX idx_question_skills_skill_id ON question_skills (skill_id);
CREATE INDEX idx_assessments_status       ON assessments (status);
CREATE INDEX idx_assessment_questions_qid ON assessment_questions (question_id);
CREATE INDEX idx_attempts_user_id         ON assessment_attempts (user_id);
CREATE INDEX idx_attempts_assessment_id   ON assessment_attempts (assessment_id);
CREATE INDEX idx_attempts_user_status     ON assessment_attempts (user_id, status);
CREATE INDEX idx_attempts_completed_at    ON assessment_attempts (completed_at);
CREATE INDEX idx_attempt_answers_attempt  ON attempt_answers (attempt_id);
CREATE INDEX idx_attempt_answers_question ON attempt_answers (question_id);
CREATE INDEX idx_resources_skill_id       ON learning_resources (skill_id);
CREATE INDEX idx_resources_status         ON learning_resources (status);
CREATE INDEX idx_roadmaps_user_id         ON roadmaps (user_id);
CREATE INDEX idx_roadmap_items_roadmap_id ON roadmap_items (roadmap_id);
CREATE INDEX idx_roadmap_items_skill_id   ON roadmap_items (skill_id);
CREATE INDEX idx_progress_user_id         ON progress (user_id);
CREATE INDEX idx_notifications_user_read  ON notifications (user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications (created_at);
CREATE INDEX idx_audit_logs_actor         ON audit_logs (actor_user_id);
CREATE INDEX idx_audit_logs_created_at    ON audit_logs (created_at);
CREATE INDEX idx_audit_logs_entity        ON audit_logs (entity_type, entity_id);

CREATE TRIGGER trg_users_updated_at       BEFORE UPDATE ON users              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_questions_updated_at   BEFORE UPDATE ON questions          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_assessments_updated_at BEFORE UPDATE ON assessments        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_resources_updated_at   BEFORE UPDATE ON learning_resources FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_progress_updated_at    BEFORE UPDATE ON progress           FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
