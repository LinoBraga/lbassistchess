
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, asaas-access-token",
};

type WebhookBody = {
  id: string;
  event: string;
  payment?: {
    id: string;
    subscription?: string;
    status: string;
    value: number;
  };
  subscription?: {
    id: string;
    status: string;
  };
};

class RetryableError extends Error {}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return reply({ error: "Method not allowed" }, 405);
  }

  const token = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!token || !url || !serviceKey) {
    return reply({ error: "Webhook configuration missing" }, 503);
  }

  if (req.headers.get("asaas-access-token") !== token) {
    return reply({ error: "Invalid token" }, 401);
  }

  const supabase = createClient(url, serviceKey);
  let eventId: string | null = null;
  let claimed = false;
  let claimToken = "";

  try {
    const body = await req.json() as WebhookBody;

    if (
      typeof body.id !== "string" || !body.id ||
      typeof body.event !== "string" || !body.event
    ) {
      return reply({ error: "Invalid webhook payload" }, 400);
    }

    eventId = body.id;
    claimToken = crypto.randomUUID();

    // Atomically claim this event. Only one concurrent request can claim it.
    const { data: claimResult, error: claimError } = await supabase.rpc(
      "claim_asaas_webhook_event",
      {
        p_id: body.id,
        p_event_type: body.event,
        p_payload: body,
        p_claim_token: claimToken,
      },
    );

    if (claimError) throw claimError;

    if (claimResult === "processed") {
      return reply({ received: true, duplicate: true });
    }

    if (claimResult !== "claimed") {
      return reply(
        { error: "Event is already being processed; retry later" },
        503,
      );
    }

    claimed = true;

    const paymentEvents = new Set([
      "PAYMENT_RECEIVED",
      "PAYMENT_OVERDUE",
      "PAYMENT_REFUNDED",
      "PAYMENT_DELETED",
    ]);

    const subscriptionEvents = new Set([
      "SUBSCRIPTION_DEACTIVATED",
      "SUBSCRIPTION_DELETED",
    ]);

    let subscriptionId: string | undefined;

    if (paymentEvents.has(body.event)) {
      if (!body.payment?.id || !body.payment.subscription) {
        throw new RetryableError("Payment event missing subscription details");
      }

      subscriptionId = body.payment.subscription;
    } else if (subscriptionEvents.has(body.event)) {
      if (!body.subscription?.id) {
        throw new RetryableError("Subscription event missing subscription ID");
      }

      subscriptionId = body.subscription.id;
    }

    if (subscriptionId) {
      const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .select("id, status")
        .eq("asaas_subscription_id", subscriptionId)
        .maybeSingle();

      if (subError) throw subError;

      if (!sub) {
        throw new RetryableError("Subscription not found yet");
      }

      let updates: Record<string, unknown> | null = null;

      switch (body.event) {
        case "PAYMENT_RECEIVED": {
          // A received payment event must explicitly report a received status.
          if (!["RECEIVED", "CONFIRMED"].includes(body.payment!.status)) {
            throw new RetryableError("Payment is not confirmed as received");
          }

          const start = new Date();
          const end = new Date(start);
          end.setMonth(end.getMonth() + 1);

          updates = {
            status: "ativa",
            current_period_start: start.toISOString().slice(0, 10),
            current_period_end: end.toISOString().slice(0, 10),
          };
          break;
        }

        case "PAYMENT_OVERDUE":
          if (sub.status === "ativa") {
            updates = { status: "expirada" };
          }
          break;

        case "PAYMENT_REFUNDED":
          updates = {
            status: "cancelada",
            canceled_at: new Date().toISOString(),
          };
          break;

        case "PAYMENT_DELETED":
          if (sub.status === "pendente") {
            updates = {
              status: "cancelada",
              canceled_at: new Date().toISOString(),
            };
          }
          break;

        case "SUBSCRIPTION_DEACTIVATED":
        case "SUBSCRIPTION_DELETED":
          updates = {
            status: "cancelada",
            canceled_at: new Date().toISOString(),
          };
          break;
      }

      if (updates) {
        const { error: updateError } = await supabase
          .from("subscriptions")
          .update(updates)
          .eq("id", sub.id);

        if (updateError) throw updateError;
      }
    }

    // Mark the event complete only after all required processing succeeds.
    const { data: finished, error: finishError } = await supabase.rpc(
      "finish_asaas_webhook_event",
      {
        p_id: body.id,
        p_claim_token: claimToken,
      },
    );

    if (finishError) throw finishError;
    if (finished !== true) {
      throw new Error("Could not confirm webhook event completion");
    }

    claimed = false;
    return reply({ received: true });
  } catch (err) {
    console.error("Asaas webhook failed:", err);

    if (claimed && eventId) {
      const { error: releaseError } = await supabase.rpc(
        "release_asaas_webhook_event",
        {
          p_id: eventId,
          p_claim_token: claimToken,
        },
      );

      if (releaseError) {
        console.error("Failed to release webhook event:", releaseError);
      }
    }

    if (err instanceof RetryableError) {
      return reply({ error: err.message, retry: true }, 503);
    }

    return reply({ error: "Webhook processing failed; retry later" }, 500);
  }
});
