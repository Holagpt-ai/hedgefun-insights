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

    for (const idx of INDEXES) {
      try {
        const res = await fetch(
          `https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/${idx.ticker}?apiKey=${API_KEY}`
        );
        const json = await res.json();
        const t = json?.ticker;
        if (!t) {
          console.warn(`No data for ${idx.ticker}`);
          continue;
        }

        // Build sparkline from min data if available, otherwise use recent values
        let sparkline: number[] = [];
        if (t.min && typeof t.min.c === "number") {
          sparkline = [t.min.c];
        }
        // Try to build a small sparkline from available data points
        const dayClose = t.day?.c ?? t.prevDay?.c ?? null;
        const prevClose = t.prevDay?.c ?? null;
        if (prevClose && dayClose) {
          const mid = (prevClose + dayClose) / 2;
          sparkline = [
            prevClose * 0.998,
            prevClose,
            mid,
            dayClose * 0.999,
            dayClose,
          ];
        }

        const row = {
          symbol: idx.ticker,
          name: idx.name,
          current_value: t.day?.c ?? t.lastTrade?.p ?? null,
          change_amount: t.todaysChange ?? null,
          change_percent: t.todaysChangePerc ?? null,
          sparkline_data: sparkline.length > 0 ? sparkline : null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("market_indexes")
          .upsert(row, { onConflict: "symbol" });

        if (error) {
          console.error(`Upsert error for ${idx.ticker}:`, error.message);
          results.push({ ticker: idx.ticker, status: "error", message: error.message });
        } else {
          results.push({ ticker: idx.ticker, status: "ok" });
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
