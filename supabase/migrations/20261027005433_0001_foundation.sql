/*
# Base do LB Assist Chess — perfis, preferências e contas externas

1. Visão geral
Cria a fundação de dados para o LB Assist Chess: perfis de usuário,
preferências de treinamento, contas externas conectadas (Chess.com / Lichess)
e uma tabela de configurações administrativas (planos comerciais, limites do sistema).

2. Novas tabelas
- `profiles`: dados públicos do usuário ligados a auth.users. Contém nome de
  exibição, status de onboarding, rating declarado (com origem e data) e timestamps.
- `training_preferences`: preferências de treinamento definidas no onboarding
  (plataforma, controle de tempo, minutos por dia, objetivo, rating aproximado).
- `external_accounts`: conexões com Chess.com e Lichess (username público, tipo,
  status da conexão, última sincronização). Não armazena senhas.
- `app_config`: configurações administrativas (limites, preços, planos). Chaveada
  por `key`. Controlada por admin via SECURITY DEFINER function (futura).

3. Segurança
- RLS habilitado em todas as tabelas expostas.
- `profiles`: o usuário lê e atualiza apenas o próprio perfil. INSERT é feito
  por trigger quando o usuário se cadastra (auth.users), mas permitimos INSERT
  direto para robustez.
- `training_preferences` e `external_accounts`: owner-scoped (user_id), CRUD
  apenas pelo dono.
- `app_config`: leitura pública (anon) para a landing page consultar preços;
  escrita apenas via service_role (admin/edge functions).
- `profiles.id` referencia auth.users(id) ON DELETE CASCADE.
- `training_preferences.user_id` e `external_accounts.user_id` referenciam
  profiles(id) ON DELETE CASCADE, com DEFAULT auth.uid() para inserts simples.

4. Notas
- O perfil é criado automaticamente por um trigger `handle_new_user` que roda
  após INSERT em auth.users, preenchendo email e id. Isso evita depender do
  frontend para criar o perfil.
- `app_config` armazena o preço do plano Pro e limites de análise/treinamento,
  evitando espalhar valores pelo frontend.
- Não há dados fictícios. Todas as colunas refletem dados reais do usuário.
*/

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  avatar_url text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  declared_rating int,
  rating_source text CHECK (rating_source IN ('chesscom', 'lichess', 'declarado', null)),
  rating_recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile"
ON profiles FOR SELECT
TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile"
ON profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
ON profiles FOR UPDATE
TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile"
ON profiles FOR DELETE
TO authenticated USING (auth.uid() = id);

-- Trigger: criar perfil automaticamente no cadastro
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch ON profiles;
CREATE TRIGGER profiles_touch
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- TRAINING PREFERENCES
-- =========================================================
CREATE TABLE IF NOT EXISTS training_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  platform text CHECK (platform IN ('chesscom', 'lichess', 'ambas', null)),
  time_control text,
  minutes_per_day int CHECK (minutes_per_day >= 0 AND minutes_per_day <= 480),
  objective text CHECK (objective IN ('rapidas', 'blitz', 'classicas', 'geral', null)),
  rating_approx int,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE training_preferences ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON training_preferences TO authenticated;

DROP POLICY IF EXISTS "select_own_prefs" ON training_preferences;
CREATE POLICY "select_own_prefs"
ON training_preferences FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_prefs" ON training_preferences;
CREATE POLICY "insert_own_prefs"
ON training_preferences FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_prefs" ON training_preferences;
CREATE POLICY "update_own_prefs"
ON training_preferences FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_prefs" ON training_preferences;
CREATE POLICY "delete_own_prefs"
ON training_preferences FOR DELETE
TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS training_preferences_touch ON training_preferences;
CREATE TRIGGER training_preferences_touch
BEFORE UPDATE ON training_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- EXTERNAL ACCOUNTS
-- =========================================================
CREATE TABLE IF NOT EXISTS external_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('chesscom', 'lichess')),
  external_username text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  status text NOT NULL DEFAULT 'conectada' CHECK (status IN ('conectada', 'erro', 'pendente')),
  UNIQUE (user_id, provider)
);

ALTER TABLE external_accounts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON external_accounts TO authenticated;

DROP POLICY IF EXISTS "select_own_accounts" ON external_accounts;
CREATE POLICY "select_own_accounts"
ON external_accounts FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_accounts" ON external_accounts;
CREATE POLICY "insert_own_accounts"
ON external_accounts FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_accounts" ON external_accounts;
CREATE POLICY "update_own_accounts"
ON external_accounts FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_accounts" ON external_accounts;
CREATE POLICY "delete_own_accounts"
ON external_accounts FOR DELETE
TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- APP CONFIG (administrativo)
-- =========================================================
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Leitura pública de configurações marcadas como públicas (preços, limites visíveis)
GRANT SELECT ON app_config TO anon, authenticated;

DROP POLICY IF EXISTS "public_read_config" ON app_config;
CREATE POLICY "public_read_config"
ON app_config FOR SELECT
TO anon, authenticated USING (is_public = true);

-- service_role tem acesso total (bypassa RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON app_config TO service_role;

DROP TRIGGER IF EXISTS app_config_touch ON app_config;
CREATE TRIGGER app_config_touch
BEFORE UPDATE ON app_config
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Valores iniciais
INSERT INTO app_config (key, value, is_public) VALUES
  ('plans', '[
    {"id":"pro","name":"LB Assist Chess Pro","price_monthly":14.90,"currency":"BRL",
     "features":[
       "Importação ilimitada de partidas (Chess.com, Lichess e PGN)",
       "Análise com Stockfish de até 40 partidas por mês",
       "Diagnóstico personalizado e relatório consolidado",
       "Treinamento adaptativo com repetição espaçada",
       "Plano semanal de estudo personalizado",
       "Histórico completo de evolução",
       "Repertório de aberturas"
     ],
     "limits":{"analyses_per_month":40,"daily_exercises":30}}
  ]'::jsonb, true),
  ('system_limits', '{
    "max_pgn_file_mb":5,
    "max_concurrent_analyses":2,
    "analysis_depth":18,
    "min_games_for_report":8
  }'::jsonb, true)
ON CONFLICT (key) DO NOTHING;
