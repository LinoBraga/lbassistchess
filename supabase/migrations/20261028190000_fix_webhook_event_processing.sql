-- Eventos novos só serão considerados processados após sucesso.
-- Eventos antigos mantêm seus timestamps existentes.
ALTER TABLE public.webhook_events
  ALTER COLUMN processed_at DROP DEFAULT,
  ALTER COLUMN processed_at DROP NOT NULL;
