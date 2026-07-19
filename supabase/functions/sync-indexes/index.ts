import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeMatchAny } from "../_shared/timing-safe.ts";

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

// Sanitize any error string so Polygon URLs / apiKey query params never leak to logs or responses.
function sanitize(msg: string): string {
  return String(msg)
    .replace(/apiKey=[^&\s"']+/gi, "apiKey=***")
    .replace(/https?:\/\/api\.polygon\.io[^\s"']*/gi, "https://api.polygon.io/***");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Restrict to service-role or the cron-signing SYNC_SECRET. Server-only; no browser access.
  const auth = req.headers.get("Authorization") ?? "";
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
  const syncSecretNext = Deno.env.get("SYNC_SECRET_NEXT") ?? "";
  const okAuth = await timingSafeMatchAny(auth, [
    srk ? `Bearer ${srk}` : "",
    syncSecret ? `Bearer ${syncSecret}` : "",
    syncSecretNext ? `Bearer ${syncSecretNext}` : "",
  ]);
  if (!okAuth) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const API_KEY = Deno.env.get("POLYGON_API_KEY");
    if (!API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "POLYGON_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const results: Array<{ ticker: string; status: "ok" | "error"; points?: number; message?: string }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const idx of INDEXES) {
      try {
        const snapRes = await fetch(
          `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${idx.ticker}?apiKey=${API_KEY}`,
        );
        if (!snapRes.ok) {
          throw new Error(`snapshot http ${snapRes.status}`);
        }
        const snapJson = await snapRes.json();
        if (snapJson?.status && String(snapJson.status).toUpperCase() === "ERROR") {
          throw new Error(`snapshot polygon error`);
        }
        const t = snapJson?.ticker;

        const aggRes = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${idx.ticker}/range/1/day/${thirtyDaysAgo}/${today}?adjusted=true&sort=asc&limit=50&apiKey=${API_KEY}`,
        );
        if (!aggRes.ok) {
          throw new Error(`aggregates http ${aggRes.status}`);
        }
        const aggJson = await aggRes.json();
        if (aggJson?.status && String(aggJson.status).toUpperCase() === "ERROR") {
          throw new Error(`aggregates polygon error`);
        }
        const aggResults: any[] = Array.isArray(aggJson?.results) ? aggJson.results : [];
        const sparklineData: number[] = aggResults
          .map((r: any) => r?.c)
          .filter((v: any) => typeof v === "number" && Number.isFinite(v));

        // Price fallback chain (mirrors resolveCurrentPrice)
        const dayClose = t?.day?.c;
        const minClose = t?.min?.c;
        const lastTrade = t?.lastTrade?.p;
        const prevClose = t?.prevDay?.c;
        const currentPrice =
          dayClose && dayClose > 0 ? dayClose
          : minClose && minClose > 0 ? minClose
          : lastTrade && lastTrade > 0 ? lastTrade
          : prevClose && prevClose > 0 ? prevClose
          : null;

        // Never write null/invalid market data.
        if (typeof currentPrice !== "number" || !Number.isFinite(currentPrice) || currentPrice <= 0) {
          throw new Error("invalid current_value");
        }
        if (sparklineData.length < 2) {
          throw new Error("missing sparkline data");
        }

        const changeAmount = prevClose && prevClose > 0 ? currentPrice - prevClose : null;
        const changePercent =
          prevClose && prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : null;

        if (changePercent === null) {
          throw new Error("missing change_percent");
        }

        const row = {
          symbol: idx.ticker,
          name: idx.name,
          current_value: currentPrice,
          change_amount: changeAmount,
          change_percent: changePercent,
          sparkline_data: sparklineData,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("market_indexes")
          .upsert(row, { onConflict: "symbol" });

        if (error) {
          throw new Error(`upsert: ${error.message}`);
        }

        console.log(`${idx.ticker}: ok, sparkline=${sparklineData.length}, value=${currentPrice}`);
        results.push({ ticker: idx.ticker, status: "ok", points: sparklineData.length });
        successCount++;
      } catch (e) {
        const msg = sanitize((e as Error).message ?? "unknown");
        console.error(`${idx.ticker}: ${msg}`);
        results.push({ ticker: idx.ticker, status: "error", message: msg });
        failureCount++;
      }
    }

    // Response contract:
    //   all 4 ok   -> 200 success:true
    //   partial    -> 207 success:false partial:true
    //   all failed -> 502 success:false
    if (successCount === INDEXES.length) {
      return new Response(
        JSON.stringify({ success: true, successCount, failureCount, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (successCount === 0) {
      return new Response(
        JSON.stringify({ success: false, successCount, failureCount, results }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ success: false, partial: true, successCount, failureCount, results }),
      { status: 207, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = sanitize(e instanceof Error ? e.message : "Unknown error");
    console.error("sync-indexes error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
