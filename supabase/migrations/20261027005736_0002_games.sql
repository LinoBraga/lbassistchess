/*
# Tabela de partidas importadas (games)

1. Visão geral
Cria a tabela `games` para armazenar partidas importadas do Chess.com, Lichess
ou PGN. Cada partida pertence a um usuário e é deduplicada por identificador
externo quando disponível.

2. Nova tabela
- `games`
  - `id` (uuid, PK)
  - `user_id` (uuid, FK profiles, DEFAULT auth.uid())
  - `source` (text: chesscom | lichess | pgn)
  - `external_id` (text, único por usuário+origem para deduplicação)
  - `pgn` (text, PGN completo)
  - `white_player` (text)
  - `black_player` (text)
  - `result` (text)
  - `played_at` (timestamptz)
  - `time_control` (text)
  - `user_color` (text: white | black)
  - `opening_eco` (text, opcional)
  - `opening_name` (text, opcional)
  - `analysis_status` (text: pendente | em_andamento | concluida | parcial | falhou)
  - `imported_at` (timestamptz DEFAULT now())

3. Segurança
- RLS habilitado, owner-scoped (user_id).
- CRUD apenas para authenticated dono da linha.
- Índices em user_id, source, played_at, analysis_status.
- UNIQUE (user_id, source, external_id) para deduplicação (external_id pode ser null).
*/

CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('chesscom', 'lichess', 'pgn')),
  external_id text,
  pgn text NOT NULL,
  white_player text,
  black_player text,
  result text,
  played_at timestamptz,
  time_control text,
  user_color text CHECK (user_color IN ('white', 'black', null)),
  opening_eco text,
  opening_name text,
  analysis_status text NOT NULL DEFAULT 'pendente'
    CHECK (analysis_status IN ('pendente', 'em_andamento', 'concluida', 'parcial', 'falhou')),
  imported_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON games TO authenticated;

DROP POLICY IF EXISTS "select_own_games" ON games;
CREATE POLICY "select_own_games"
ON games FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_games" ON games;
CREATE POLICY "insert_own_games"
ON games FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_games" ON games;
CREATE POLICY "update_own_games"
ON games FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_games" ON games;
CREATE POLICY "delete_own_games"
ON games FOR DELETE
TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_games_user_id ON games(user_id);
CREATE INDEX IF NOT EXISTS idx_games_source ON games(source);
CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_analysis_status ON games(analysis_status);

-- Deduplicação: um usuário não importa a mesma partida da mesma origem duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_dedup
ON games(user_id, source, external_id)
WHERE external_id IS NOT NULL;
