/*
# Tabela de análises de partidas (game_analyses)

1. Visão geral
Cria a tabela `game_analyses` para armazenar os resultados da análise de
cada partida pelo Stockfish executado no navegador do usuário (WASM + Web Worker).
Cada análise pertence a uma partida que pertence a um usuário, e é isolada
por RLS através do relacionamento com `games`.

2. Nova tabela
- `game_analyses`
  - `id` (uuid, PK)
  - `game_id` (uuid, FK games, ON DELETE CASCADE)
  - `user_id` (uuid, FK profiles, DEFAULT auth.uid()) — redundante para RLS eficiente
  - `engine_name` (text, ex: 'Stockfish')
  - `engine_version` (text, ex: '16.0')
  - `engine_config` (jsonb: { depth, movetime, multi_pv, skill_level })
  - `status` (text: aguardando | em_andamento | concluida | cancelada | falhou)
  - `positions` (jsonb: array de { ply, fen, best_move, eval_cp, eval_mate, depth, pv, classification })
  - `summary` (jsonb: { inaccuracies, mistakes, blunders, accuracy_white, accuracy_black, analyzed_at })
  - `progress` (int: 0-100, percentual de posições analisadas)
  - `error_message` (text, nullable)
  - `created_at` (timestamptz DEFAULT now())
  - `updated_at` (timestamptz DEFAULT now())

3. Segurança
- RLS habilitado, owner-scoped via user_id.
- CRUD apenas para authenticated dono da linha.
- Índice UNIQUE em game_id (uma análise por partida ativa; reanálise substitui).
- Índice em (user_id, status) para listagem.
- Trigger updated_at automático.

4. Deduplicação
- UNIQUE (game_id) WHERE status IN ('aguardando', 'em_andamento', 'concluida')
  impede análises duplicadas ativas. Análises canceladas/falhas podem ser
  recriadas para retomada.

5. Notas
- As posições são armazenadas como JSONB para flexibilidade.
- `classification` em cada posição: 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | null.
- `eval_cp` é em centipeões da perspectiva das brancas (sempre).
- `eval_mate` é positivo para mate das brancas, negativo para pretas.
*/

CREATE TABLE IF NOT EXISTS game_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  engine_name text NOT NULL DEFAULT 'Stockfish',
  engine_version text NOT NULL DEFAULT '16.0',
  engine_config jsonb NOT NULL DEFAULT '{"depth": 15, "movetime": 1000, "multi_pv": 1, "skill_level": 20}'::jsonb,
  status text NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'em_andamento', 'concluida', 'cancelada', 'falhou')),
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb,
  progress int NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE game_analyses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON game_analyses TO authenticated;

DROP POLICY IF EXISTS "select_own_analyses" ON game_analyses;
CREATE POLICY "select_own_analyses"
ON game_analyses FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_analyses" ON game_analyses;
CREATE POLICY "insert_own_analyses"
ON game_analyses FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_analyses" ON game_analyses;
CREATE POLICY "update_own_analyses"
ON game_analyses FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_analyses" ON game_analyses;
CREATE POLICY "delete_own_analyses"
ON game_analyses FOR DELETE
TO authenticated USING (auth.uid() = user_id);

-- Uma análise ativa (não cancelada/falha) por partida
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_analyses_active
ON game_analyses(game_id)
WHERE status IN ('aguardando', 'em_andamento', 'concluida');

CREATE INDEX IF NOT EXISTS idx_game_analyses_user_status ON game_analyses(user_id, status);
CREATE INDEX IF NOT EXISTS idx_game_analyses_game ON game_analyses(game_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_game_analyses_updated_at ON game_analyses;
CREATE TRIGGER trg_game_analyses_updated_at
BEFORE UPDATE ON game_analyses
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
