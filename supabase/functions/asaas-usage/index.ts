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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

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

    // GET: check if user can start a new analysis
    if (req.method === "GET") {
      const currentPeriod = new Date().toISOString().slice(0, 7);

      const { data: usage } = await supabase
        .from("usage_tracking")
        .select("analyses_count")
        .eq("user_id", user.id)
        .eq("period", currentPeriod)
        .maybeSingle();

      const { data: configRow } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "plans")
        .maybeSingle();

      const plans = (configRow?.value ?? []) as Array<{
        id: string;
        limits: { analyses_per_month: number };
      }>;

      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("plan_id, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const activePlanId = subscription?.status === "ativa" ? subscription.plan_id : null;
      const plan = activePlanId
        ? plans.find((p) => p.id === activePlanId)
        : plans[0];

      const analysesLimit = plan?.limits?.analyses_per_month ?? 0;
      const currentCount = usage?.analyses_count ?? 0;

      const canAnalyze = analysesLimit === 0 || currentCount < analysesLimit;

      return new Response(JSON.stringify({
        can_analyze: canAnalyze,
        current_count: currentCount,
        limit: analysesLimit,
        remaining: analysesLimit === 0 ? -1 : Math.max(0, analysesLimit - currentCount),
        period: currentPeriod,
        has_active_subscription: subscription?.status === "ativa",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST with action=increment: atomic increment via RPC function
    if (req.method === "POST" && action === "increment") {
      const body: { game_id: string } = await req.json();

      // Verify game exists and belongs to user
      const { data: game } = await supabase
        .from("games")
        .select("analysis_status")
        .eq("id", body.game_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!game) {
        return new Response(JSON.stringify({ error: "Partida não encontrada" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (game.analysis_status !== "concluida") {
        return new Response(JSON.stringify({ error: "Análise não concluída" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get plan limit
      const { data: configRow } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "plans")
        .maybeSingle();

      const plans = (configRow?.value ?? []) as Array<{
        id: string;
        limits: { analyses_per_month: number };
      }>;

      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("plan_id, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const activePlanId = subscription?.status === "ativa" ? subscription.plan_id : null;
      const plan = activePlanId ? plans.find((p) => p.id === activePlanId) : plans[0];
      const limit = plan?.limits?.analyses_per_month ?? 0;

      // Call atomic RPC function
      const { data: result, error: rpcError } = await supabase.rpc("increment_usage", {
        p_user_id: user.id,
        p_game_id: body.game_id,
        p_limit: limit,
      });

      if (rpcError) {
        return new Response(JSON.stringify({ error: "Falha ao registrar consumo" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resultData = result as { success: boolean; already_counted?: boolean; reason?: string; new_count?: number };
      return new Response(JSON.stringify(resultData), {
        status: resultData.success ? 200 : 403,
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
