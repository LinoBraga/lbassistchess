/*
# Fase 5 — Revogar grants excessivos e garantir isolamento

1. Visão geral
A migração 0006 criou as tabelas de assinaturas/pagamentos com grants
restritos, mas o estado atual do banco mostra que os roles anon e
authenticated receberam grants de CRUD em todas as tabelas novas.
Isso permite que o frontend (com a anon key) faça INSERT/UPDATE/DELETE
direto em subscriptions, asaas_customers, usage_tracking e webhook_events,
burlando a segurança. Esta migração revoga esses grants excessivos.

2. Tabelas afetadas
- `asaas_customers`: revoga CRUD de anon/authenticated. Mantém SELECT
  para authenticated (o usuário pode ver seu próprio vínculo). INSERT/UPDATE/DELETE
  apenas via service_role (edge functions).
- `subscriptions`: revoga CRUD de anon/authenticated. Mantém SELECT
  para authenticated (o usuário pode ver sua assinatura). INSERT/UPDATE/DELETE
  apenas via service_role.
- `usage_tracking`: revoga CRUD de anon/authenticated. Mantém SELECT
  para authenticated. INSERT/UPDATE/DELETE apenas via service_role.
- `webhook_events`: revoga CRUD de anon/authenticated. Apenas service_role.
- `app_config`: revoga INSERT/UPDATE/DELETE de anon/authenticated (já deveria
  ser apenas SELECT público). Mantém SELECT para leitura de planos.

3. Segurança
- O usuário NÃO pode criar, alterar ou cancelar assinaturas pelo frontend.
- O usuário NÃO pode modificar seu consumo de análises.
- Webhook events são inacessíveis pelo frontend.
- Planos não podem ser alterados pelo frontend.
- Todas as mutações passam por edge functions (service_role).
*/

-- Revoke all privileges from anon on Fase 5 tables
REVOKE ALL ON asaas_customers FROM anon;
REVOKE ALL ON subscriptions FROM anon;
REVOKE ALL ON usage_tracking FROM anon;
REVOKE ALL ON webhook_events FROM anon;

-- Revoke excess privileges from authenticated
-- asaas_customers: SELECT only
REVOKE INSERT, UPDATE, DELETE ON asaas_customers FROM authenticated;

-- subscriptions: SELECT only (no INSERT/UPDATE/DELETE from frontend)
REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM authenticated;

-- usage_tracking: SELECT only
REVOKE INSERT, UPDATE, DELETE ON usage_tracking FROM authenticated;

-- webhook_events: no access for authenticated
REVOKE ALL ON webhook_events FROM authenticated;

-- app_config: revoke write from anon and authenticated (only SELECT via public policy)
REVOKE INSERT, UPDATE, DELETE ON app_config FROM anon, authenticated;

-- Ensure service_role keeps full access (already granted, but be explicit)
GRANT SELECT, INSERT, UPDATE, DELETE ON asaas_customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON usage_tracking TO service_role;
GRANT SELECT, INSERT, UPDATE ON webhook_events TO service_role;