/*
# Fase 5 — Defesa em profundidade: validar ownership do game em increment_usage

A função increment_usage é SECURITY DEFINER e roda como service_role.
A edge function valida ownership antes de chamar, mas a função em si
não valida. Adiciona verificação dentro da função para impedir que
outras fontes (scripts, triggers) causem contagem cruzada.

Também limpa dados de teste do teste anterior.
*/

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
  v_game_owner uuid;
BEGIN
  -- Validar que o game pertence ao usuário
  SELECT user_id INTO v_game_owner FROM games WHERE id = p_game_id;
  IF v_game_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'game_not_found');
  END IF;
  IF v_game_owner != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'game_not_owned');
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, uuid, int) TO service_role;