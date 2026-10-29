UPDATE public.app_config
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(
      value,
      '{0,price_monthly}',
      '19.99'::jsonb
    ),
    '{0,limits,analyses_per_month}',
    '0'::jsonb
  ),
  '{0,features}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem #>> '{}' ILIKE '%40 partidas por mês%'
          THEN to_jsonb('Análise com Stockfish ilimitadas'::text)
        ELSE elem
      END
    )
    FROM jsonb_array_elements(value->0->'features') AS elem
  )
)
WHERE key = 'plans'
  AND value->0->>'id' = 'pro';
