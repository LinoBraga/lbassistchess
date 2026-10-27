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
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }

    const url = new URL(req.url);
    const platform = url.searchParams.get("platform");
    const username = url.searchParams.get("username");
    const period = url.searchParams.get("period") ?? "all";

    if (!platform || !username) {
      return jsonResponse({ error: "Plataforma e username são obrigatórios" }, 400);
    }

    if (platform !== "lichess" && platform !== "chesscom") {
      return jsonResponse({ error: "Plataforma não suportada" }, 400);
    }

    const since = computeSinceTimestamp(period);

    if (platform === "lichess") {
      return await fetchLichessGames(username.trim(), since);
    } else {
      return await fetchChesscomGames(username.trim(), since);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function computeSinceTimestamp(period: string): number | null {
  if (period === "all") return null;
  const now = Date.now();
  if (period === "30d") return now - 30 * 86400000;
  if (period === "90d") return now - 90 * 86400000;
  return null;
}

// =========================================================
// LICHESS — official API: GET /api/games/user/{username}
// Returns NDJSON stream; we collect and return as array.
// =========================================================
async function fetchLichessGames(username: string, since: number | null): Promise<Response> {
  const params = new URLSearchParams();
  params.set("moves", "true");
  params.set("pgnInJson", "true");
  params.set("clocks", "false");
  params.set("evals", "false");
  params.set("opening", "true");
  if (since !== null) {
    params.set("since", String(since));
  }
  params.set("max", "100");

  let response: Response;
  try {
    response = await fetch(
      `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`,
      {
        headers: {
          "Accept": "application/x-ndjson",
        },
      },
    );
  } catch {
    return jsonResponse({ error: "Falha de conexão com a Lichess" }, 502);
  }

  if (response.status === 404) {
    return jsonResponse({ error: `Usuário '${username}' não encontrado na Lichess` }, 404);
  }
  if (response.status === 429) {
    return jsonResponse({ error: "Limite de requisições da Lichess atingido. Tente novamente em alguns minutos." }, 429);
  }
  if (!response.ok) {
    return jsonResponse({ error: `Erro da Lichess (${response.status})` }, 502);
  }

  const games: Array<{ pgn: string; source: string }> = [];
  const reader = response.body?.getReader();
  if (!reader) {
    return jsonResponse({ error: "Resposta vazia da Lichess" }, 502);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          if (obj.pgn) {
            games.push({ pgn: obj.pgn, source: "lichess" });
          }
        } catch {
          // Skip malformed lines
        }
      }
    }
    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const obj = JSON.parse(buffer.trim());
        if (obj.pgn) {
          games.push({ pgn: obj.pgn, source: "lichess" });
        }
      } catch {
        // Ignore
      }
    }
  } catch {
    // Return whatever we collected
  }

  return jsonResponse({ games, total: games.length, platform: "lichess" }, 200);
}

// =========================================================
// CHESS.COM — PubAPI: GET /pub/player/{username}/games/{year}/{month}
// Returns JSON with array of game objects containing PGN strings.
// We iterate months from the period start to now.
// =========================================================
async function fetchChesscomGames(username: string, since: number | null): Promise<Response> {
  // Validate user exists first
  let profileResponse: Response;
  try {
    profileResponse = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`,
      { headers: { "Accept": "application/json" } },
    );
  } catch {
    return jsonResponse({ error: "Falha de conexão com a Chess.com" }, 502);
  }

  if (profileResponse.status === 404) {
    return jsonResponse({ error: `Usuário '${username}' não encontrado na Chess.com` }, 404);
  }
  if (!profileResponse.ok) {
    return jsonResponse({ error: `Erro da Chess.com (${profileResponse.status})` }, 502);
  }

  // Compute list of months to fetch
  const months: { year: number; month: number }[] = [];
  const now = new Date();
  if (since === null) {
    // Default: last 12 months to avoid excessive requests
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
  } else {
    const sinceDate = new Date(since);
    let y = sinceDate.getFullYear();
    let m = sinceDate.getMonth() + 1;
    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
      months.push({ year: y, month: m });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    // Cap at 24 months to avoid abuse
    if (months.length > 24) months.length = 24;
  }

  const games: Array<{ pgn: string; source: string }> = [];

  for (const { year, month } of months) {
    const monthStr = String(month).padStart(2, "0");
    const url = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/${year}/${monthStr}`;

    let response: Response;
    try {
      response = await fetch(url, { headers: { "Accept": "application/json" } });
    } catch {
      // Network error for this month — skip, continue
      continue;
    }

    if (response.status === 429) {
      return jsonResponse({
        error: "Limite de requisições da Chess.com atingido. Tente novamente em alguns minutos.",
        games: games.length > 0 ? games : undefined,
        total: games.length,
        partial: true,
      }, 429);
    }

    if (!response.ok) continue;

    try {
      const data = await response.json();
      if (data.games && Array.isArray(data.games)) {
        for (const g of data.games) {
          if (g.pgn) {
            games.push({ pgn: g.pgn, source: "chesscom" });
          }
        }
      }
    } catch {
      // Skip malformed month
    }

    // Small delay to respect rate limits (~2 req/sec)
    await new Promise((r) => setTimeout(r, 300));
  }

  return jsonResponse({ games, total: games.length, platform: "chesscom" }, 200);
}
