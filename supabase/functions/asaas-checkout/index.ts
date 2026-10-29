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
    const body: { plan_id: string; billing_type: string } = await req.json();
        const allowedBillingTypes = ["PIX", "CREDIT_CARD"];

    if (!allowedBillingTypes.includes(body.billing_type)) {
      return new Response(
        JSON.stringify({
          error: "Forma de pagamento inválida. Escolha PIX ou cartão de crédito.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Load plans from app_config
    const { data: configRow } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "plans")
      .maybeSingle();

    const plans = (configRow?.value ?? []) as Array<{
      id: string; name: string; price_monthly: number; currency: string;
      asaas_plan_id: string | null; limits: { analyses_per_month: number };
    }>;

    const plan = plans.find((p) => p.id === body.plan_id);
    if (!plan) {
      return new Response(JSON.stringify({ error: "Plano não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already has an active subscription
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["ativa", "pendente"])
      .maybeSingle();

        if (existingSub) {
          const message =
            existingSub.status === "ativa"
              ? "Você já possui uma assinatura ativa"
              : "Você já possui uma assinatura pendente";

          return new Response(JSON.stringify({ error: message }), {
            status: 409,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          });
        }

    // Get or create Asaas customer
    const { data: existingCustomer } = await supabase
      .from("asaas_customers")
      .select("asaas_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existingCustomer?.asaas_customer_id;

    if (!customerId) {
      const customerPayload = {
        name: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Cliente",
        email: user.email,
        externalReference: user.id,
      };

      const { status: custStatus, data: custData } = await asaasFetch("/customers", {
        method: "POST",
        body: JSON.stringify(customerPayload),
      });

      if (custStatus >= 400) {
        return new Response(JSON.stringify({ error: "Falha ao criar cliente no Asaas", details: custData }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      customerId = (custData as { id: string }).id;

      await supabase.from("asaas_customers").insert({
        user_id: user.id,
        asaas_customer_id: customerId,
      });
    }

    // Create subscription in Asaas
    const today = new Date();
    const nextDueDate = today.toISOString().split("T")[0];

    const subscriptionPayload = {
      customer: customerId,
      billingType: body.billing_type ?? "BOLETO",
      nextDueDate,
      value: plan.price_monthly,
      cycle: "MONTHLY",
      description: plan.name,
    };

    const { status: subStatus, data: subData } = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify(subscriptionPayload),
    });

    if (subStatus >= 400) {
      return new Response(JSON.stringify({ error: "Falha ao criar assinatura no Asaas", details: subData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subResult = subData as { id: string };

    // Create pending subscription record
    await supabase.from("subscriptions").insert({
      user_id: user.id,
      plan_id: plan.id,
      asaas_subscription_id: subResult.id,
      status: "pendente",
      billing_type: body.billing_type ?? "BOLETO",
    });

    // Get the first payment from the subscription for checkout URL
    const { status: payStatus, data: payData } = await asaasFetch(
      `/subscriptions/${subResult.id}/payments`,
      { method: "GET" },
    );

    let checkoutUrl: string | null = null;
    let invoiceId: string | null = null;

    if (payStatus < 400) {
      const payments = (payData as { data: Array<{ id: string; invoiceUrl: string | null }> }).data;
      if (payments && payments.length > 0) {
        invoiceId = payments[0].id;
        checkoutUrl = payments[0].invoiceUrl ?? null;
      }
    }

    return new Response(JSON.stringify({
      subscription_id: subResult.id,
      checkout_url: checkoutUrl,
      invoice_id: invoiceId,
      billing_type: body.billing_type ?? "BOLETO",
    }), {
      status: 200,
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
