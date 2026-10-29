/*
# Fase 5 — Assinaturas, pagamentos Asaas e controle de uso

1. Visão geral
Adiciona o sistema de assinaturas pagas do LB Assist Chess usando o Asaas
como provedor de pagamentos. Cria tabelas para vincular usuários a clientes
Asaas, registrar assinaturas, processar webhooks de forma idempotente e
controlar o consumo de análises por mês.

2. Novas tabelas
- `asaas_customers`: vincula user_id ao customer_id do Asaas (1:1).
  - `user_id` (uuid, PK, FK profiles, DEFAULT auth.uid())
  - `asaas_customer_id` (text, UNIQUE) — ID retornado pelo Asaas (cus_xxx)
  - `created_at` (timestamptz)
- `subscriptions`: assinaturas ativas/inativas/canceladas/expiradas dos usuários.
  - `id` (uuid, PK)
  - `user_id` (uuid, FK profiles, DEFAULT auth.uid())
  - `plan_id` (text) — referência ao id do plano em app_config
  - `asaas_subscription_id` (text, UNIQUE) — ID da assinatura no Asaas (sub_xxx)
  - `status` (text: pendente | ativa | cancelada | expirada)
  - `billing_type` (text: BOLETO | CREDIT_CARD | PIX | UNDEFINED)
  - `current_period_start` (date) — início do ciclo atual
  - `current_period_end` (date) — fim do ciclo atual
  - `canceled_at` (timestamptz, nullable)
  - `created_at`, `updated_at` (timestamptz)
- `webhook_events`: log de eventos recebidos do Asaas para idempotência.
  - `id` (text, PK) — event id do Asaas (evt_xxx)
  - `event_type` (text) — PAYMENT_RECEIVED, PAYMENT_OVERDUE, etc.
  - `payload` (jsonb) — corpo completo do evento
  - `processed_at` (timestamptz)
  - `created_at` (timestamptz)
- `usage_tracking`: controle de consumo mensal de análises por usuário.
  - `id` (uuid, PK)
  - `user_id` (uuid, FK profiles, DEFAULT auth.uid())
  - `period` (text) — formato YYYY-MM
  - `analyses_count` (int, default 0) — análises concluídas no período
  - `created_at`, `updated_at` (timestamptz)
  - UNIQUE (user_id, period)

3. Tabelas modificadas
- `app_config`: atualizada para incluir `asaas_plan_id` em cada plano
  (identificador do plano no provedor, se aplicável). O valor já é JSONB,
  então nenhuma alteração de coluna é necessária — apenas os dados seed.

4. Segurança
- RLS habilitado em todas as novas tabelas.
- `asaas_customers`: owner-scoped CRUD (user_id = auth.uid()).
- `subscriptions`: SELECT apenas para o dono. INSERT/UPDATE/DELETE bloqueados
  para authenticated — alterações só via service_role (edge functions).
  Isso impede que o usuário altere seu próprio plano ou status pelo frontend.
- `webhook_events`: sem acesso a authenticated/anon — apenas service_role.
- `usage_tracking`: SELECT para o dono. INSERT/UPDATE apenas via service_role.
  O usuário pode ver seu consumo mas não pode modificar.
- `asaas_customers.user_id` e `subscriptions.user_id` têm DEFAULT auth.uid().
- Índices em user_id para queries frequentes.
- GRANT seletivo: apenas os roles e verbos necessários.

5. Política de uso
- Análises canceladas ou falhas NÃO consomem limite (não foram concluídas).
- Uma análise concluída e reutilizada (mesmo game_id) NÃO conta novamente.
- O limite é por mês calendário (period YYYY-MM).
- A verificação de limite é feita no backend (edge function), não no frontend.

6. Notas
- O webhook valida o header `asaas-access-token` contra o secret armazenado.
- Eventos duplicados (mesmo id) são ignorados via PK em webhook_events.
- Assinaturas só são ativadas após webhook PAYMENT_RECEIVED confirmado.
- Nenhum dado de cartão de crédito é armazenado no banco do projeto.
*/

-- =========================================================
-- ASAAS CUSTOMERS (vincula user_id → customer_id Asaas)
-- =========================================================
CREATE TABLE IF NOT EXISTS asaas_customers (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  asaas_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE asaas_customers ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON asaas_customers TO authenticated;

DROP POLICY IF EXISTS "select_own_customer" ON asaas_customers;
CREATE POLICY "select_own_customer"
ON asaas_customers FOR SELECT
TO authenticated USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE apenas via service_role (edge functions)
GRANT INSERT, UPDATE, DELETE ON asaas_customers TO service_role;

CREATE INDEX IF NOT EXISTS idx_asaas_customers_customer_id ON asaas_customers(asaas_customer_id);

-- =========================================================
-- SUBSCRIPTIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id text NOT NULL,
  asaas_subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'ativa', 'cancelada', 'expirada')),
  billing_type text DEFAULT 'UNDEFINED'
    CHECK (billing_type IN ('BOLETO', 'CREDIT_CARD', 'PIX', 'UNDEFINED')),
  current_period_start date,
  current_period_end date,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- O usuário pode apenas LER sua assinatura — não pode criar/alterar/cancelar pelo frontend
GRANT SELECT ON subscriptions TO authenticated;

DROP POLICY IF EXISTS "select_own_subscription" ON subscriptions;
CREATE POLICY "select_own_subscription"
ON subscriptions FOR SELECT
TO authenticated USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE apenas via service_role (edge functions com API key)
GRANT INSERT, UPDATE, DELETE ON subscriptions TO service_role;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_asaas_sub ON subscriptions(asaas_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Trigger updated_at
DROP TRIGGER IF EXISTS subscriptions_touch ON subscriptions;
CREATE TRIGGER subscriptions_touch
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- WEBHOOK EVENTS (idempotência — apenas service_role)
-- =========================================================
CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Sem grants para authenticated/anon — apenas service_role
GRANT SELECT, INSERT, UPDATE ON webhook_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed_at);

-- =========================================================
-- USAGE TRACKING (controle de consumo mensal)
-- =========================================================
CREATE TABLE IF NOT EXISTS usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  period text NOT NULL,
  analyses_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period)
);

ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- O usuário pode ver seu consumo, mas não alterar
GRANT SELECT ON usage_tracking TO authenticated;

DROP POLICY IF EXISTS "select_own_usage" ON usage_tracking;
CREATE POLICY "select_own_usage"
ON usage_tracking FOR SELECT
TO authenticated USING (auth.uid() = user_id);

-- INSERT/UPDATE apenas via service_role (edge functions)
GRANT INSERT, UPDATE, DELETE ON usage_tracking TO service_role;

CREATE INDEX IF NOT EXISTS idx_usage_user_period ON usage_tracking(user_id, period);

DROP TRIGGER IF EXISTS usage_tracking_touch ON usage_tracking;
CREATE TRIGGER usage_tracking_touch
BEFORE UPDATE ON usage_tracking
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- Atualizar planos em app_config para incluir asaas_plan_id
-- =========================================================
UPDATE app_config SET value = '[
  {
    "id":"pro",
    "name":"LB Assist Chess Pro",
    "price_monthly":19.99,
    "currency":"BRL",
    "asaas_plan_id":null,
    "features":[
      "Importação ilimitada de partidas (Chess.com, Lichess e PGN)",
      "Análise com Stockfish Ilimitadas",
      "Diagnóstico personalizado e relatório consolidado",
      "Treinamento adaptativo com repetição espaçada",
      "Plano semanal de estudo personalizado",
      "Histórico completo de evolução",
      "Repertório de aberturas"
    ],
    "limits":{"analyses_per_month":40,"daily_exercises":30}
  }
]'::jsonb
WHERE key = 'plans' AND value->0->>'id' = 'pro';