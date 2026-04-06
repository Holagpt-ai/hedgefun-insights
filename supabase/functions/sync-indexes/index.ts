import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INDEXES = [
  { ticker: "SPY", name: "S&P 500" },
  { ticker: "QQQ", name: "Nasdaq 100" },
  { ticker: "DIA", name: "Dow Jones" },
  { ticker: "IWM", name: "Russell 2000" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const API_KEY = Deno.env.get("POLYGON_API_KEY");
    if (!API_KEY) throw new Error("POLYGON_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results = [];

    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    for (const idx of INDEXES) {
      try {
        // Fetch snapshot for current price + change
        const snapRes = await fetch(
          `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${idx.ticker}?apiKey=${API_KEY}`
        );
        const snapJson = await snapRes.json();
        const t = snapJson?.ticker;

        // Fetch 30-day daily aggregates for sparkline (gives ~20 trading days)
        const aggRes = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${idx.ticker}/range/1/day/${thirtyDaysAgo}/${today}?adjusted=true&sort=asc&limit=50&apiKey=${API_KEY}`
        );
        const aggJson = await aggRes.json();
        const aggResults = aggJson?.results ?? [];

        const sparklineData = aggResults.map((r: any) => r.c).filter((v: any) => typeof v === "number");

        // Resolve current price with fallback chain (mirrors resolveCurrentPrice)
        const dayClose = t?.day?.c;
        const minClose = t?.min?.c;
        const lastTrade = t?.lastTrade?.p;
        const prevClose = t?.prevDay?.c;

        const currentPrice =
          (dayClose && dayClose > 0) ? dayClose
          : (minClose && minClose > 0) ? minClose
          : (lastTrade && lastTrade > 0) ? lastTrade
          : (prevClose && prevClose > 0) ? prevClose
          : null;

        const changeAmount = (currentPrice && prevClose)
          ? currentPrice - prevClose
          : null;
        const changePercent = (currentPrice && prevClose && prevClose > 0)
          ? ((currentPrice - prevClose) / prevClose) * 100
          : null;

        const row = {
          symbol: idx.ticker,
          name: idx.name,
          current_value: currentPrice,
          change_amount: changeAmount,
          change_percent: changePercent,
          sparkline_data: sparklineData.length > 0 ? sparklineData : null,
          updated_at: new Date().toISOString(),
        };

        console.log(`${idx.ticker}: sparkline points=${sparklineData.length}, value=${currentValue}`);

        const { error } = await supabase
          .from("market_indexes")
          .upsert(row, { onConflict: "symbol" });

        if (error) {
          console.error(`Upsert error for ${idx.ticker}:`, error.message);
          results.push({ ticker: idx.ticker, status: "error", message: error.message });
        } else {
          results.push({ ticker: idx.ticker, status: "ok", points: sparklineData.length });
        }
      } catch (e) {
        console.error(`Fetch error for ${idx.ticker}:`, (e as Error).message);
        results.push({ ticker: idx.ticker, status: "error", message: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-indexes error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
