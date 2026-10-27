import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const ASAAS_API_URL =
    Deno.env.get("ASAAS_API_URL") ?? "https://api.asaas.com/v3";
  const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY") ?? "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  async function asaasFetch(path: string, options: RequestInit = {}): Promise<{ status: number; data: unknown }> {
    if (!ASAAS_API_KEY) {
      return { status: 503, data: { error: "ASAAS_API_KEY not configured" } };
    }
    const response = await fetch(`${ASAAS_API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "access_token": ASAAS_API_KEY,
        ...(options.headers ?? {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = authData.user;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // GET: return subscription status + usage
    if (req.method === "GET") {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentPeriod = new Date().toISOString().slice(0, 7);
      const { data: usage } = await supabase
        .from("usage_tracking")
        .select("analyses_count, period")
        .eq("user_id", user.id)
        .eq("period", currentPeriod)
        .maybeSingle();

      const { data: configRow } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "plans")
        .maybeSingle();

      const plans = (configRow?.value ?? []) as Array<{
        id: string; name: string; price_monthly: number;
        limits: { analyses_per_month: number }; features: string[];
      }>;

      const plan = subscription
        ? plans.find((p) => p.id === subscription.plan_id)
        : null;

      return new Response(JSON.stringify({
        subscription: subscription
          ? {
              status: subscription.status,
              plan_id: subscription.plan_id,
              plan_name: plan?.name ?? subscription.plan_id,
              plan_price: plan?.price_monthly ?? 0,
              billing_type: subscription.billing_type,
              current_period_start: subscription.current_period_start,
              current_period_end: subscription.current_period_end,
              canceled_at: subscription.canceled_at,
            }
          : null,
        plan: plan
          ? {
              name: plan.name,
              price_monthly: plan.price_monthly,
              features: plan.features,
              limits: plan.limits,
            }
          : null,
        usage: {
          period: currentPeriod,
          analyses_count: usage?.analyses_count ?? 0,
          analyses_limit: plan?.limits?.analyses_per_month ?? 0,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST with action=cancel: cancel subscription
    if (req.method === "POST" && action === "cancel") {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["ativa", "pendente"])
        .maybeSingle();

      if (!subscription) {
        return new Response(JSON.stringify({ error: "Nenhuma assinatura ativa encontrada" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!ASAAS_API_KEY) {
        return new Response(JSON.stringify({ error: "ASAAS_API_KEY not configured" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { status: asaasStatus } = await asaasFetch(
        `/subscriptions/${subscription.asaas_subscription_id}`,
        { method: "DELETE" },
      );

      if (asaasStatus >= 400) {
        return new Response(JSON.stringify({ error: "Falha ao cancelar assinatura no Asaas" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("subscriptions")
        .update({ status: "cancelada", canceled_at: new Date().toISOString() })
        .eq("id", subscription.id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
