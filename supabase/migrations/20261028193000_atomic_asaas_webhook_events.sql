
ALTER TABLE public.webhook_events
  ALTER COLUMN processed_at DROP DEFAULT,
  ALTER COLUMN processed_at DROP NOT NULL;

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_token uuid;

UPDATE public.webhook_events
SET processing_status = 'processed',
    processing_started_at = NULL,
    claim_token = NULL
WHERE processed_at IS NOT NULL;

ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_processing_status_check;

ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_processing_status_check
  CHECK (processing_status IN ('pending', 'processing', 'processed'));

-- Remove versões antigas, caso existam.
DROP FUNCTION IF EXISTS public.claim_asaas_webhook_event(text, text, jsonb);
DROP FUNCTION IF EXISTS public.finish_asaas_webhook_event(text);
DROP FUNCTION IF EXISTS public.release_asaas_webhook_event(text);

CREATE OR REPLACE FUNCTION public.claim_asaas_webhook_event(
  p_id text,
  p_event_type text,
  p_payload jsonb,
  p_claim_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_id text;
  current_status text;
  current_processed_at timestamptz;
BEGIN
  INSERT INTO public.webhook_events (
    id, event_type, payload, processed_at,
    processing_status, processing_started_at, claim_token
  )
  VALUES (
    p_id, p_event_type, p_payload, NULL,
    'processing', now(), p_claim_token
  )
  ON CONFLICT (id) DO UPDATE
  SET event_type = EXCLUDED.event_type,
      payload = EXCLUDED.payload,
      processing_status = 'processing',
      processing_started_at = now(),
      claim_token = EXCLUDED.claim_token
  WHERE public.webhook_events.processed_at IS NULL
    AND (
      public.webhook_events.processing_status = 'pending'
      OR public.webhook_events.processing_started_at IS NULL
      OR public.webhook_events.processing_started_at < now() - interval '5 minutes'
    )
  RETURNING id INTO claimed_id;

  IF claimed_id IS NOT NULL THEN
    RETURN 'claimed';
  END IF;

  SELECT processing_status, processed_at
  INTO current_status, current_processed_at
  FROM public.webhook_events
  WHERE id = p_id;

  IF current_processed_at IS NOT NULL OR current_status = 'processed' THEN
    RETURN 'processed';
  END IF;

  RETURN 'busy';
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_asaas_webhook_event(
  p_id text,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.webhook_events
  SET processing_status = 'processed',
      processed_at = now(),
      processing_started_at = NULL,
      claim_token = NULL
  WHERE id = p_id
    AND claim_token = p_claim_token
    AND processing_status = 'processing'
    AND processed_at IS NULL;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_asaas_webhook_event(
  p_id text,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.webhook_events
  SET processing_status = 'pending',
      processing_started_at = NULL,
      claim_token = NULL
  WHERE id = p_id
    AND claim_token = p_claim_token
    AND processing_status = 'processing'
    AND processed_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_asaas_webhook_event(text, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.finish_asaas_webhook_event(text, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.release_asaas_webhook_event(text, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_asaas_webhook_event(text, text, jsonb, uuid)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.finish_asaas_webhook_event(text, uuid)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.release_asaas_webhook_event(text, uuid)
  TO service_role;
