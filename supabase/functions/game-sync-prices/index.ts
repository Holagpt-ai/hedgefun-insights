import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeMatchAny } from "../_shared/timing-safe.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── Auth — SYNC_SECRET only ───────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
  const syncSecretNext = Deno.env.get("SYNC_SECRET_NEXT") ?? "";
  const okAuth = await timingSafeMatchAny(authHeader, [
    syncSecret ? `Bearer ${syncSecret}` : "",
    syncSecretNext ? `Bearer ${syncSecretNext}` : "",
  ]);
  if (!okAuth) {
    return json({ error: "Forbidden" }, 403);
  }

  const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
  if (!POLYGON_API_KEY) return json({ error: "POLYGON_API_KEY not configured" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Find active season ────────────────────────────────
  const { data: season } = await supabase
    .from("game_seasons")
    .select("id")
    .eq("status", "active")
    .maybeSingle();

  if (!season) return json({ ok: true, message: "No active season" });

  const seasonId = season.id;

  // ── Get all open positions for active season ──────────
  const { data: positions, error: posError } = await supabase
    .from("game_positions")
    .select("id, portfolio_id, user_id, symbol, shares, avg_cost_price")
    .eq("season_id", seasonId);

  if (posError || !positions?.length) {
    return json({ ok: true, message: "No open positions", season_id: seasonId });
  }

  // ── Deduplicate symbols ───────────────────────────────
  const uniqueSymbols = [...new Set(positions.map((p: any) => p.symbol))];

  // ── Fetch prices in batches of 100 ───────────────────
  const priceMap: Record<string, number> = {};
  const BATCH_SIZE = 100;

  for (let i = 0; i < uniqueSymbols.length; i += BATCH_SIZE) {
    const batch = uniqueSymbols.slice(i, i + BATCH_SIZE);
    const tickersParam = batch.join(",");

    try {
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${POLYGON_API_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const data = await res.json();

      for (const t of data.tickers ?? []) {
        const price =
          (t.day?.c > 0 ? t.day.c : null) ??
          (t.min?.c > 0 ? t.min.c : null) ??
          (t.lastTrade?.p > 0 ? t.lastTrade.p : null) ??
          (t.prevDay?.c > 0 ? t.prevDay.c : null) ??
          null;
        if (price && t.ticker) priceMap[t.ticker] = price;
      }
    } catch (e) {
      console.error(`[game-sync-prices] batch ${i} failed:`, e);
    }

    if (i + BATCH_SIZE < uniqueSymbols.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // ── Update each position ──────────────────────────────
  let updatedPositions = 0;

  for (const pos of positions) {
    const price = priceMap[pos.symbol];
    if (!price) continue;

    const marketValue = pos.shares * price;
    const unrealizedPnl = marketValue - pos.shares * pos.avg_cost_price;

    await supabase
      .from("game_positions")
      .update({
        current_price: price,
        market_value: marketValue,
        unrealized_pnl: unrealizedPnl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pos.id);

    updatedPositions++;
  }

  // ── Rebuild portfolio totals ──────────────────────────
  const { data: portfolios } = await supabase
    .from("game_portfolios")
    .select("id, user_id, cash_balance, realized_pnl")
    .eq("season_id", seasonId);

  const STARTING_AUM = 5000000;
  let updatedPortfolios = 0;

  for (const port of portfolios ?? []) {
    const { data: portPositions } = await supabase
      .from("game_positions")
      .select("market_value, unrealized_pnl")
      .eq("portfolio_id", port.id);

    const totalPositionsValue = (portPositions ?? []).reduce(
      (sum: number, p: any) => sum + (p.market_value ?? 0), 0
    );
    const totalUnrealizedPnl = (portPositions ?? []).reduce(
      (sum: number, p: any) => sum + (p.unrealized_pnl ?? 0), 0
    );
    const totalValue = port.cash_balance + totalPositionsValue;

    await supabase
      .from("game_portfolios")
      .update({
        total_value: totalValue,
        unrealized_pnl: totalUnrealizedPnl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", port.id);

    // Update leaderboard row
    const totalPnl = totalValue - STARTING_AUM;
    const pnlPct = (totalPnl / STARTING_AUM) * 100;

    const { count: posCount } = await supabase
      .from("game_positions")
      .select("id", { count: "exact", head: true })
      .eq("portfolio_id", port.id);

    const { data: portData } = await supabase
      .from("game_portfolios")
      .select("display_name")
      .eq("id", port.id)
      .single();

    await supabase
      .from("game_leaderboard")
      .upsert({
        season_id: seasonId,
        user_id: port.user_id,
        display_name: portData?.display_name ?? "Anonymous",
        total_value: totalValue,
        cash_balance: port.cash_balance,
        total_pnl: totalPnl,
        pnl_pct: pnlPct,
        position_count: posCount ?? 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: "season_id,user_id" });

    updatedPortfolios++;
  }

  // ── Rebuild leaderboard ranks ─────────────────────────
  const { data: allLeaderboard } = await supabase
    .from("game_leaderboard")
    .select("id, total_value")
    .eq("season_id", seasonId)
    .order("total_value", { ascending: false });

  for (let i = 0; i < (allLeaderboard ?? []).length; i++) {
    await supabase
      .from("game_leaderboard")
      .update({ rank: i + 1 })
      .eq("id", allLeaderboard![i].id);
  }

  return json({
    ok: true,
    season_id: seasonId,
    symbols_priced: Object.keys(priceMap).length,
    positions_updated: updatedPositions,
    portfolios_updated: updatedPortfolios,
    leaderboard_rows: allLeaderboard?.length ?? 0,
  });
});
