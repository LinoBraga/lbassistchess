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

  const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    // Validate webhook authenticity via asaas-access-token header
    const authToken = req.headers.get("asaas-access-token");
    if (!ASAAS_WEBHOOK_TOKEN) {
      return new Response(JSON.stringify({ error: "Webhook token not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!authToken || authToken !== ASAAS_WEBHOOK_TOKEN) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: {
      id: string;
      event: string;
      payment?: { id: string; subscription?: string; status: string; value: number };
      subscription?: { id: string; status: string };
    } = await req.json();

    // Idempotency: check if event already processed
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("id", body.id)
      .maybeSingle();

    if (existingEvent) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist event
    await supabase.from("webhook_events").insert({
      id: body.id,
      event_type: body.event,
      payload: body,
    });

    // Process payment events
    if (body.event === "PAYMENT_RECEIVED" && body.payment) {
      const subscriptionId = body.payment.subscription;

      if (subscriptionId) {
        const today = new Date();
        const periodEnd = new Date(today);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await supabase
          .from("subscriptions")
          .update({
            status: "ativa",
            current_period_start: today.toISOString().split("T")[0],
            current_period_end: periodEnd.toISOString().split("T")[0],
          })
          .eq("asaas_subscription_id", subscriptionId);
      }
    }

    if (body.event === "PAYMENT_OVERDUE" && body.payment) {
      const subscriptionId = body.payment.subscription;

      if (subscriptionId) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("status")
          .eq("asaas_subscription_id", subscriptionId)
          .maybeSingle();

        if (sub?.status === "ativa") {
          await supabase
            .from("subscriptions")
            .update({ status: "expirada" })
            .eq("asaas_subscription_id", subscriptionId);
        }
      }
    }

    if (body.event === "PAYMENT_REFUNDED" && body.payment) {
      const subscriptionId = body.payment.subscription;

      if (subscriptionId) {
        await supabase
          .from("subscriptions")
          .update({ status: "cancelada", canceled_at: new Date().toISOString() })
          .eq("asaas_subscription_id", subscriptionId);
      }
    }

    if (body.event === "PAYMENT_DELETED" && body.payment) {
      const subscriptionId = body.payment.subscription;

      if (subscriptionId) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("status")
          .eq("asaas_subscription_id", subscriptionId)
          .maybeSingle();

        if (sub?.status === "pendente") {
          await supabase
            .from("subscriptions")
            .update({ status: "cancelada", canceled_at: new Date().toISOString() })
            .eq("asaas_subscription_id", subscriptionId);
        }
      }
    }

    // Process subscription events
    if (body.event === "SUBSCRIPTION_DEACTIVATED" && body.subscription) {
      await supabase
        .from("subscriptions")
        .update({ status: "cancelada", canceled_at: new Date().toISOString() })
        .eq("asaas_subscription_id", body.subscription.id);
    }

    if (body.event === "SUBSCRIPTION_DELETED" && body.subscription) {
      await supabase
        .from("subscriptions")
        .update({ status: "cancelada", canceled_at: new Date().toISOString() })
        .eq("asaas_subscription_id", body.subscription.id);
    }

    return new Response(JSON.stringify({ received: true }), {
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
