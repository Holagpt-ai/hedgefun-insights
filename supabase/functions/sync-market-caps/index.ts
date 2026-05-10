import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const __auth = req.headers.get("Authorization") ?? "";
  const __srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!__srk || __auth !== `Bearer ${__srk}`) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Fetch 50 tickers with null market_cap
  const { data: tickers, error } = await supabase
    .from("ticker_search")
    .select("symbol")
    .is("market_cap", null)
    .limit(50);

  if (error || !tickers || tickers.length === 0) {
    return new Response(JSON.stringify({ message: "No tickers to update", updated: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let updated = 0;
  let skipped = 0;

  for (const { symbol } of tickers) {
    try {
      const res = await fetch(
        `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`
      );
      const json = await res.json();
      const market_cap = json?.results?.market_cap;

      if (!market_cap || market_cap <= 0) {
        await supabase.from("ticker_search").update({ market_cap: -1 }).eq("symbol", symbol);
        skipped++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("ticker_search")
        .update({ market_cap: Math.round(market_cap) })
        .eq("symbol", symbol);

      if (!updateError) updated++;
    } catch {
      skipped++;
    }
  }

  const { count } = await supabase
    .from("ticker_search")
    .select("symbol", { count: "exact", head: true })
    .is("market_cap", null);

  return new Response(
    JSON.stringify({ updated, skipped, remaining_null: count, has_more: (count ?? 0) > 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
