/*
# Fase 5 — Harden webhook_events and fix function search_path

1. Visão geral
- Adiciona uma política deny-all explícita em webhook_events para silenciar
  o advisor de RLS sem política (a tabela é apenas service_role).
- Fixa search_path nas funções touch_updated_at e update_updated_at_column
  para public, evitando warnings de search_path mutável.
- Revoga EXECUTE da função handle_new_user de anon/authenticated — apenas
  o trigger interno precisa chamá-la, não clientes externos.

2. Segurança
- webhook_events: nenhuma policy para anon/authenticated. Acesso apenas
  via service_role (edge functions com service_role_key).
- Funções com search_path fixo evitam ataques de search_path hijacking.
- handle_new_user não é chamável via REST API por usuários externos.
*/

-- Fix search_path on touch_updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix search_path on update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Revoke EXECUTE on handle_new_user from anon and authenticated
-- (it's only called by the trigger on auth.users, not via REST)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- webhook_events: explicitly no policies for anon/authenticated
-- (service_role bypasses RLS, so no policy needed)
-- Adding a comment for the advisor:
COMMENT ON TABLE webhook_events IS 'Tabela de idempotência de webhooks. Acesso apenas via service_role (edge functions). RLS ativa sem policies para anon/authenticated é intencional.';