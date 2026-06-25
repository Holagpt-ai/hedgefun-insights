import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DISPLAY_NAME_RE = /^[a-zA-Z0-9 _]{2,20}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Auth ─────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await anonClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // ── Parse body ────────────────────────────────────────
  let body: { season_id: string; display_name: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { season_id, display_name } = body;

  if (!season_id || !display_name) {
    return json({ error: "Missing required fields: season_id, display_name" }, 400);
  }

  // ── Validate display name ─────────────────────────────
  const trimmedName = display_name.trim();
  if (!DISPLAY_NAME_RE.test(trimmedName)) {
    return json({
      error: "Display name must be 2–20 characters. Letters, numbers, spaces, and underscores only.",
    }, 400);
  }

  // ── Validate season ───────────────────────────────────
  const { data: season, error: seasonError } = await supabase
    .from("game_seasons")
    .select("id, status, prize_description")
    .eq("id", season_id)
    .single();

  if (seasonError || !season) return json({ error: "Season not found" }, 404);

  if (!["active", "upcoming"].includes(season.status)) {
    return json({ error: "This season is closed and no longer accepting players" }, 400);
  }

  // ── Check if already joined (idempotent) ──────────────
  const { data: existing } = await supabase
    .from("game_portfolios")
    .select("id, display_name, cash_balance, total_value, realized_pnl, unrealized_pnl, rank, joined_at")
    .eq("season_id", season_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return json({
      ok: true,
      already_joined: true,
      portfolio: existing,
    });
  }

  // ── Load starting AUM from config ─────────────────────
  const { data: configRows } = await supabase
    .from("game_config")
    .select("key, value")
    .is("season_id", null);

  const config: Record<string, string> = {};
  (configRows ?? []).forEach((r: any) => { config[r.key] = r.value; });

  const startingAum = parseFloat(config.starting_aum ?? "5000000");

  // ── Create portfolio ──────────────────────────────────
  const { data: portfolio, error: portfolioError } = await supabase
    .from("game_portfolios")
    .insert({
      season_id,
      user_id: user.id,
      display_name: trimmedName,
      cash_balance: startingAum,
      total_value: startingAum,
      realized_pnl: 0,
      unrealized_pnl: 0,
    })
    .select()
    .single();

  if (portfolioError || !portfolio) {
    console.error("[game-join] portfolio insert error:", portfolioError);
    return json({ error: "Failed to create portfolio" }, 500);
  }

  // ── Seed leaderboard row ──────────────────────────────
  await supabase.from("game_leaderboard").insert({
    season_id,
    user_id: user.id,
    display_name: trimmedName,
    rank: null,
    total_value: startingAum,
    cash_balance: startingAum,
    total_pnl: 0,
    pnl_pct: 0,
    position_count: 0,
  });

  return json({
    ok: true,
    already_joined: false,
    portfolio: {
      id: portfolio.id,
      display_name: portfolio.display_name,
      cash_balance: portfolio.cash_balance,
      total_value: portfolio.total_value,
      realized_pnl: portfolio.realized_pnl,
      unrealized_pnl: portfolio.unrealized_pnl,
      rank: portfolio.rank,
      joined_at: portfolio.joined_at,
    },
  });
});
