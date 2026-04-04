import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get 100 tickers that have no market_cap yet
  const { data: tickers, error } = await supabase
    .from("ticker_search")
    .select("symbol")
    .is("market_cap", null)
    .eq("active", true)
    .order("symbol", { ascending: true })
    .limit(100);

  if (error || !tickers?.length) {
    return new Response(
      JSON.stringify({ message: "No tickers to update", error }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  let updated = 0;
  const errors: string[] = [];

  // Fetch market_cap from Polygon reference tickers endpoint (one per ticker)
  // Process in parallel batches of 10 to stay within rate limits
  const batchSize = 10;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async ({ symbol }) => {
        try {
          const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
          const res = await fetch(url);
          if (!res.ok) return null;
          const json = await res.json();
          const market_cap = json?.results?.market_cap;
          if (market_cap && market_cap > 0) {
            await supabase
              .from("ticker_search")
              .update({ market_cap: Math.round(market_cap) })
              .eq("symbol", symbol);
            return true;
          }
          return null;
        } catch (e) {
          errors.push(`${symbol}: ${e.message}`);
          return null;
        }
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value === true) updated++;
    }
    // Small delay between batches to respect rate limits
    if (i + batchSize < tickers.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Count remaining
  const { count } = await supabase
    .from("ticker_search")
    .select("symbol", { count: "exact", head: true })
    .is("market_cap", null)
    .eq("active", true);

  return new Response(
    JSON.stringify({
      updated,
      remaining: count,
      processed: tickers.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
