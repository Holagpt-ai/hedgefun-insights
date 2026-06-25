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

async function getPolygonPrice(symbol: string, apiKey: string): Promise<number | null> {
  try {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const snap = data?.ticker;
    if (!snap) return null;
    const price =
      (snap.day?.c > 0 ? snap.day.c : null) ??
      (snap.min?.c > 0 ? snap.min.c : null) ??
      (snap.lastTrade?.p > 0 ? snap.lastTrade.p : null) ??
      (snap.prevDay?.c > 0 ? snap.prevDay.c : null) ??
      null;
    return price;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

  let body: { action: string; symbol: string; shares: number; season_id: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { action, symbol, shares, season_id } = body;

  if (!action || !symbol || !shares || !season_id) {
    return json({ error: "Missing required fields: action, symbol, shares, season_id" }, 400);
  }

  const sym = symbol.toUpperCase().trim();

  if (!["buy", "sell"].includes(action)) {
    return json({ error: "action must be 'buy' or 'sell'" }, 400);
  }

  const { data: configRows } = await supabase
    .from("game_config")
    .select("key, value")
    .is("season_id", null);

  const config: Record<string, string> = {};
  (configRows ?? []).forEach((r: any) => { config[r.key] = r.value; });

  const STARTING_AUM = parseFloat(config.starting_aum ?? "5000000");
  const MIN_SHARES = parseFloat(config.min_shares ?? "100");
  const MIN_PRICE = parseFloat(config.min_price ?? "5");
  const MAX_POSITION_PCT = parseFloat(config.max_position_pct ?? "0.20");
  const MAX_POSITIONS = parseInt(config.max_positions ?? "20");

  const { data: season, error: seasonError } = await supabase
    .from("game_seasons")
    .select("id, status, starts_at, ends_at")
    .eq("id", season_id)
    .single();

  if (seasonError || !season) return json({ error: "Season not found" }, 404);
  if (season.status !== "active") return json({ error: "Season is not active" }, 400);

  const { data: portfolio, error: portfolioError } = await supabase
    .from("game_portfolios")
    .select("id, cash_balance, total_value, realized_pnl, unrealized_pnl")
    .eq("season_id", season_id)
    .eq("user_id", user.id)
    .single();

  if (portfolioError || !portfolio) {
    return json({ error: "You have not joined this season yet" }, 400);
  }

  if (typeof shares !== "number" || shares < MIN_SHARES || shares % 1 !== 0) {
    return json({ error: `Minimum ${MIN_SHARES} shares per trade. Shares must be a whole number.` }, 400);
  }

  const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
  if (!POLYGON_API_KEY) return json({ error: "Price service unavailable" }, 500);

  const currentPrice = await getPolygonPrice(sym, POLYGON_API_KEY);
  if (!currentPrice || currentPrice <= 0) {
    return json({ error: `Unable to fetch price for ${sym}. Try again.` }, 400);
  }

  const { data: existingPosition } = await supabase
    .from("game_positions")
    .select("id, shares, avg_cost_price, market_value")
    .eq("portfolio_id", portfolio.id)
    .eq("symbol", sym)
    .maybeSingle();

  if (action === "buy") {
    if (currentPrice < MIN_PRICE) {
      return json({ error: `${sym} price $${currentPrice.toFixed(2)} is below the $${MIN_PRICE} minimum.` }, 400);
    }

    const totalCost = shares * currentPrice;

    if (portfolio.cash_balance < totalCost) {
      return json({
        error: `Insufficient cash. Cost: $${totalCost.toLocaleString()} — Available: $${portfolio.cash_balance.toLocaleString()}`,
      }, 400);
    }

    const existingValue = existingPosition ? existingPosition.market_value : 0;
    const newPositionValue = existingValue + totalCost;
    const concentrationPct = newPositionValue / STARTING_AUM;

    if (concentrationPct > MAX_POSITION_PCT) {
      const maxAllowed = Math.floor((STARTING_AUM * MAX_POSITION_PCT - existingValue) / currentPrice);
      return json({
        error: `Concentration limit: max ${MAX_POSITION_PCT * 100}% of AUM per ticker. Max additional shares: ${maxAllowed}.`,
      }, 400);
    }

    if (!existingPosition) {
      const { count } = await supabase
        .from("game_positions")
        .select("id", { count: "exact", head: true })
        .eq("portfolio_id", portfolio.id);

      if ((count ?? 0) >= MAX_POSITIONS) {
        return json({ error: `Maximum ${MAX_POSITIONS} positions allowed per portfolio.` }, 400);
      }
    }

    const newCashBalance = portfolio.cash_balance - totalCost;

    if (existingPosition) {
      const totalShares = existingPosition.shares + shares;
      const newAvgCost =
        (existingPosition.shares * existingPosition.avg_cost_price + shares * currentPrice) / totalShares;
      const newMarketValue = totalShares * currentPrice;
      const newUnrealizedPnl = newMarketValue - totalShares * newAvgCost;

      await supabase
        .from("game_positions")
        .update({
          shares: totalShares,
          avg_cost_price: newAvgCost,
          current_price: currentPrice,
          market_value: newMarketValue,
          unrealized_pnl: newUnrealizedPnl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPosition.id);
    } else {
      const marketValue = shares * currentPrice;
      await supabase.from("game_positions").insert({
        portfolio_id: portfolio.id,
        season_id,
        user_id: user.id,
        symbol: sym,
        shares,
        avg_cost_price: currentPrice,
        current_price: currentPrice,
        market_value: marketValue,
        unrealized_pnl: 0,
      });
    }

    const newTotalValue = newCashBalance + await getTotalPositionsValue(supabase, portfolio.id);

    await supabase
      .from("game_portfolios")
      .update({
        cash_balance: newCashBalance,
        total_value: newTotalValue,
        updated_at: new Date().toISOString(),
      })
      .eq("id", portfolio.id);

    await supabase.from("game_trades").insert({
      portfolio_id: portfolio.id,
      season_id,
      user_id: user.id,
      symbol: sym,
      action: "buy",
      shares,
      price_at_execution: currentPrice,
      total_value: totalCost,
      cash_before: portfolio.cash_balance,
      cash_after: newCashBalance,
    });

    await upsertLeaderboard(supabase, season_id, user.id, portfolio.id, newTotalValue, newCashBalance);

    return json({
      ok: true,
      action: "buy",
      symbol: sym,
      shares,
      price: currentPrice,
      total_cost: totalCost,
      cash_balance: newCashBalance,
      total_value: newTotalValue,
    });
  }

  if (action === "sell") {
    if (!existingPosition) {
      return json({ error: `No position found for ${sym}` }, 400);
    }

    if (shares > existingPosition.shares) {
      return json({ error: `Cannot sell ${shares} shares — you only hold ${existingPosition.shares}` }, 400);
    }

    const proceeds = shares * currentPrice;
    const realizedPnl = shares * (currentPrice - existingPosition.avg_cost_price);
    const newCashBalance = portfolio.cash_balance + proceeds;

    if (shares === existingPosition.shares) {
      await supabase.from("game_positions").delete().eq("id", existingPosition.id);
    } else {
      const remainingShares = existingPosition.shares - shares;
      const newMarketValue = remainingShares * currentPrice;
      const newUnrealizedPnl = newMarketValue - remainingShares * existingPosition.avg_cost_price;

      await supabase
        .from("game_positions")
        .update({
          shares: remainingShares,
          current_price: currentPrice,
          market_value: newMarketValue,
          unrealized_pnl: newUnrealizedPnl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPosition.id);
    }

    const newTotalValue = newCashBalance + await getTotalPositionsValue(supabase, portfolio.id);
    const newRealizedPnl = portfolio.realized_pnl + realizedPnl;

    await supabase
      .from("game_portfolios")
      .update({
        cash_balance: newCashBalance,
        total_value: newTotalValue,
        realized_pnl: newRealizedPnl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", portfolio.id);

    await supabase.from("game_trades").insert({
      portfolio_id: portfolio.id,
      season_id,
      user_id: user.id,
      symbol: sym,
      action: "sell",
      shares,
      price_at_execution: currentPrice,
      total_value: proceeds,
      cash_before: portfolio.cash_balance,
      cash_after: newCashBalance,
    });

    await upsertLeaderboard(supabase, season_id, user.id, portfolio.id, newTotalValue, newCashBalance);

    return json({
      ok: true,
      action: "sell",
      symbol: sym,
      shares,
      price: currentPrice,
      proceeds,
      realized_pnl: realizedPnl,
      cash_balance: newCashBalance,
      total_value: newTotalValue,
    });
  }

  return json({ error: "Invalid action" }, 400);
});

async function getTotalPositionsValue(supabase: any, portfolioId: string): Promise<number> {
  const { data } = await supabase
    .from("game_positions")
    .select("market_value")
    .eq("portfolio_id", portfolioId);
  return (data ?? []).reduce((sum: number, p: any) => sum + (p.market_value ?? 0), 0);
}

async function upsertLeaderboard(
  supabase: any,
  seasonId: string,
  userId: string,
  portfolioId: string,
  totalValue: number,
  cashBalance: number
) {
  const STARTING_AUM = 5000000;
  const totalPnl = totalValue - STARTING_AUM;
  const pnlPct = (totalPnl / STARTING_AUM) * 100;

  const { count } = await supabase
    .from("game_positions")
    .select("id", { count: "exact", head: true })
    .eq("portfolio_id", portfolioId);

  const { data: portfolio } = await supabase
    .from("game_portfolios")
    .select("display_name")
    .eq("id", portfolioId)
    .single();

  await supabase
    .from("game_leaderboard")
    .upsert({
      season_id: seasonId,
      user_id: userId,
      display_name: portfolio?.display_name ?? "Anonymous",
      total_value: totalValue,
      cash_balance: cashBalance,
      total_pnl: totalPnl,
      pnl_pct: pnlPct,
      position_count: count ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "season_id,user_id" });

  const { data: allRows } = await supabase
    .from("game_leaderboard")
    .select("id, total_value")
    .eq("season_id", seasonId)
    .order("total_value", { ascending: false });

  if (allRows) {
    for (let i = 0; i < allRows.length; i++) {
      await supabase
        .from("game_leaderboard")
        .update({ rank: i + 1 })
        .eq("id", allRows[i].id);
    }
  }
}
