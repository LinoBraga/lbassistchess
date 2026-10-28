/*
# Fase 4: Diagnósticos, exercícios, planos de treino e evolução

1. Visão geral
Cria 4 tabelas para suportar o sistema de treinamento personalizado:
- `diagnoses`: resultado consolidado da análise de fraquezas do usuário,
  versionado e recalculável.
- `exercises`: exercícios gerados a partir de posições reais das partidas
  analisadas, vinculados à partida e posição de origem.
- `exercise_attempts`: tentativas do usuário em cada exercício, com resultado
  e feedback.
- `training_plans`: plano semanal personalizado com sessões diárias.
- `plan_sessions`: sessões individuais do plano, marcáveis como concluídas.

2. Nova tabela: diagnoses
- `id` (uuid, PK)
- `user_id` (uuid, FK profiles, DEFAULT auth.uid())
- `version` (int, incrementa a cada recálculo)
- `categories` (jsonb: array de { category, occurrences, games_used, confidence, recommendation, example_positions })
- `games_analyzed` (int: quantas partidas foram usadas)
- `computed_at` (timestamptz DEFAULT now())

3. Nova tabela: exercises
- `id` (uuid, PK)
- `user_id` (uuid, FK profiles, DEFAULT auth.uid())
- `game_id` (uuid, FK games, ON DELETE CASCADE)
- `source_ply` (int: ply da posição na partida)
- `fen` (text: posição inicial do exercício)
- `side_to_move` (text: 'w' | 'b')
- `best_move` (text: melhor lance segundo a análise)
- `acceptable_moves` (jsonb: lances alternativos aceitáveis, UCI)
- `pv` (text: variação principal)
- `category` (text: categoria de fraqueza)
- `difficulty` (text: 'facil' | 'medio' | 'dificil')
- `instruction` (text: instrução objetiva)
- `explanation` (text: explicação da ideia)
- `created_at` (timestamptz DEFAULT now())
- UNIQUE (user_id, game_id, source_ply) — evita duplicatas

4. Nova tabela: exercise_attempts
- `id` (uuid, PK)
- `user_id` (uuid, FK profiles, DEFAULT auth.uid())
- `exercise_id` (uuid, FK exercises, ON DELETE CASCADE)
- `move_played` (text: lance jogado em UCI)
- `is_correct` (boolean)
- `time_ms` (int: tempo até responder)
- `created_at` (timestamptz DEFAULT now())

5. Nova tabela: training_plans
- `id` (uuid, PK)
- `user_id` (uuid, FK profiles, DEFAULT auth.uid())
- `week_start` (date: segunda-feira da semana)
- `minutes_per_day` (int)
- `days` (jsonb: array de { day, sessions: [{ category, exercise_ids: [], is_review }] })
- `diagnosis_version` (int: versão do diagnóstico usado)
- `is_provisional` (boolean: true se não há dados suficientes)
- `created_at` (timestamptz DEFAULT now())
- UNIQUE (user_id, week_start) — um plano por semana

6. Nova tabela: plan_sessions
- `id` (uuid, PK)
- `user_id` (uuid, FK profiles, DEFAULT auth.uid())
- `plan_id` (uuid, FK training_plans, ON DELETE CASCADE)
- `day` (int: 0-6, dia da semana)
- `category` (text)
- `exercise_ids` (jsonb: array de uuid)
- `completed` (boolean DEFAULT false)
- `completed_at` (timestamptz, nullable)
- `review_session` (boolean DEFAULT false)
- UNIQUE (plan_id, day, category)

7. Segurança
- RLS habilitado em todas as tabelas.
- CRUD owner-scoped (user_id) em todas, apenas authenticated.
- Índices em user_id para queries frequentes.
- Nenhuma chave secreta armazenada.
- Índices UNIQUE para deduplicação.
*/

-- =========================================================
-- DIAGNOSES
-- =========================================================
CREATE TABLE IF NOT EXISTS diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  games_analyzed int NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON diagnoses TO authenticated;

DROP POLICY IF EXISTS "select_own_diagnoses" ON diagnoses;
CREATE POLICY "select_own_diagnoses"
ON diagnoses FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_diagnoses" ON diagnoses;
CREATE POLICY "insert_own_diagnoses"
ON diagnoses FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_diagnoses" ON diagnoses;
CREATE POLICY "update_own_diagnoses"
ON diagnoses FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_diagnoses" ON diagnoses;
CREATE POLICY "delete_own_diagnoses"
ON diagnoses FOR DELETE
TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_diagnoses_user ON diagnoses(user_id, computed_at DESC);

-- =========================================================
-- EXERCISES
-- =========================================================
CREATE TABLE IF NOT EXISTS exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  source_ply int NOT NULL,
  fen text NOT NULL,
  side_to_move text NOT NULL CHECK (side_to_move IN ('w', 'b')),
  best_move text,
  acceptable_moves jsonb NOT NULL DEFAULT '[]'::jsonb,
  pv text,
  category text NOT NULL,
  difficulty text NOT NULL DEFAULT 'medio' CHECK (difficulty IN ('facil', 'medio', 'dificil')),
  instruction text NOT NULL,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_id, source_ply)
);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON exercises TO authenticated;

DROP POLICY IF EXISTS "select_own_exercises" ON exercises;
CREATE POLICY "select_own_exercises"
ON exercises FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_exercises" ON exercises;
CREATE POLICY "insert_own_exercises"
ON exercises FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_exercises" ON exercises;
CREATE POLICY "update_own_exercises"
ON exercises FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_exercises" ON exercises;
CREATE POLICY "delete_own_exercises"
ON exercises FOR DELETE
TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_exercises_user ON exercises(user_id, category);
CREATE INDEX IF NOT EXISTS idx_exercises_game ON exercises(game_id);

-- =========================================================
-- EXERCISE ATTEMPTS
-- =========================================================
CREATE TABLE IF NOT EXISTS exercise_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  move_played text NOT NULL,
  is_correct boolean NOT NULL,
  time_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exercise_attempts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON exercise_attempts TO authenticated;

DROP POLICY IF EXISTS "select_own_attempts" ON exercise_attempts;
CREATE POLICY "select_own_attempts"
ON exercise_attempts FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_attempts" ON exercise_attempts;
CREATE POLICY "insert_own_attempts"
ON exercise_attempts FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_attempts" ON exercise_attempts;
CREATE POLICY "update_own_attempts"
ON exercise_attempts FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_attempts" ON exercise_attempts;
CREATE POLICY "delete_own_attempts"
ON exercise_attempts FOR DELETE
TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON exercise_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_exercise ON exercise_attempts(exercise_id);

-- =========================================================
-- TRAINING PLANS
-- =========================================================
CREATE TABLE IF NOT EXISTS training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  minutes_per_day int NOT NULL DEFAULT 15,
  days jsonb NOT NULL DEFAULT '[]'::jsonb,
  diagnosis_version int NOT NULL DEFAULT 0,
  is_provisional boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON training_plans TO authenticated;

DROP POLICY IF EXISTS "select_own_plans" ON training_plans;
CREATE POLICY "select_own_plans"
ON training_plans FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_plans" ON training_plans;
CREATE POLICY "insert_own_plans"
ON training_plans FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_plans" ON training_plans;
CREATE POLICY "update_own_plans"
ON training_plANS FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_plans" ON training_plans;
CREATE POLICY "delete_own_plans"
ON training_plans FOR DELETE
TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_plans_user ON training_plans(user_id, week_start DESC);

-- =========================================================
-- PLAN SESSIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS plan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  day int NOT NULL CHECK (day >= 0 AND day <= 6),
  category text NOT NULL,
  exercise_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  review_session boolean NOT NULL DEFAULT false,
  UNIQUE (plan_id, day, category)
);

ALTER TABLE plan_sessions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON plan_sessions TO authenticated;

DROP POLICY IF EXISTS "select_own_sessions" ON plan_sessions;
CREATE POLICY "select_own_sessions"
ON plan_sessions FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sessions" ON plan_sessions;
CREATE POLICY "insert_own_sessions"
ON plan_sessions FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sessions" ON plan_sessions;
CREATE POLICY "update_own_sessions"
ON plan_sessions FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sessions" ON plan_sessions;
CREATE POLICY "delete_own_sessions"
ON plan_sessions FOR DELETE
TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_plan ON plan_sessions(plan_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON plan_sessions(user_id, completed);
