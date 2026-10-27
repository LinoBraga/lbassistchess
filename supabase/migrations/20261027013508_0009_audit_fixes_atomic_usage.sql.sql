/*
# Fase 5 — Correções de auditoria: atomicidade e anti-dupla contagem

1. Visão geral
Corrige três problemas encontrados na auditoria:
- Race condition no limite de uso: check e increment não eram atômicos.
- Dupla contagem: reanalisar uma partida contava novamente.
- Falta rastreamento de game_ids já contados.

2. Nova tabela
- `counted_analyses`: rastreia quais (user_id, game_id) já foram contados
  no consumo mensal. UNIQUE(user_id, game_id) impede dupla contagem.
  - `user_id` (uuid, FK profiles)
  - `game_id` (uuid, FK games)
  - `period` (text, YYYY-MM)
  - `counted_at` (timestamptz)
  - UNIQUE(user_id, game_id)

3. Nova função
- `increment_usage(p_user_id uuid, p_game_id uuid, p_limit int)`:
  SECURITY DEFINER que atomicamente verifica o limite, insere em
  counted_analyses (impede dupla contagem via UNIQUE constraint) e
  incrementa usage_tracking. Retorna {success, reason}.
  Se o game_id já foi contado, retorna success=true, already_counted=true.
  Se o limite foi atingido, retorna success=false, reason='limit_reached'.

4. Segurança
- counted_analyses: sem acesso para anon/authenticated. Apenas service_role.
- increment_usage: SECURITY DEFINER, search_path fixo, EXECUTE apenas
  para service_role (chamada pela edge function).
- RLS habilitado em counted_analyses.
*/

-- =========================================================
-- COUNTED ANALYSES (anti-dupla contagem)
-- =========================================================
CREATE TABLE IF NOT EXISTS counted_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  period text NOT NULL,
  counted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_id)
);

ALTER TABLE counted_analyses ENABLE ROW LEVEL SECURITY;

-- Sem grants para anon/authenticated
GRANT SELECT, INSERT ON counted_analyses TO service_role;

CREATE INDEX IF NOT EXISTS idx_counted_analyses_user_period ON counted_analyses(user_id, period);

-- =========================================================
-- FUNÇÃO ATÔMICA: increment_usage
-- =========================================================
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id uuid,
  p_game_id uuid,
  p_limit int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  v_count int;
  v_already boolean;
BEGIN
  -- Verificar se este game_id já foi contado para este usuário
  SELECT EXISTS(
    SELECT 1 FROM counted_analyses
    WHERE user_id = p_user_id AND game_id = p_game_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'already_counted', true);
  END IF;

  -- Obter contagem atual
  SELECT COALESCE(
    (SELECT analyses_count FROM usage_tracking
     WHERE user_id = p_user_id AND period = v_period),
    0
  ) INTO v_count;

  -- Verificar limite (0 = ilimitado)
  IF p_limit > 0 AND v_count >= p_limit THEN
    RETURN jsonb_build_object('success', false, 'reason', 'limit_reached',
      'current_count', v_count, 'limit', p_limit);
  END IF;

  -- Inserir em counted_analyses (UNIQUE constraint impede dupla contagem)
  INSERT INTO counted_analyses (user_id, game_id, period)
  VALUES (p_user_id, p_game_id, v_period)
  ON CONFLICT (user_id, game_id) DO NOTHING;

  -- Se o insert acima não inseriu (race condition), já foi contado
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_counted', true);
  END IF;

  -- Incrementar usage_tracking
  INSERT INTO usage_tracking (user_id, period, analyses_count)
  VALUES (p_user_id, v_period, 1)
  ON CONFLICT (user_id, period)
  DO UPDATE SET analyses_count = usage_tracking.analyses_count + 1;

  RETURN jsonb_build_object('success', true, 'incremented', true,
    'new_count', v_count + 1, 'period', v_period);
END;
$$;

-- Apenas service_role pode chamar a função
REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, uuid, int) TO service_role;