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

  // Parse optional cursor from request body for pagination
  let nextUrl: string | null = null;
  try {
    const body = await req.json();
    nextUrl = body?.next_url || null;
  } catch {
    // No body, start from beginning
  }

  // Use Polygon reference tickers endpoint which returns market_cap directly
  // Fetch 1000 tickers per call with pagination support
  const url = nextUrl ||
    `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&order=asc&limit=1000&sort=ticker&apiKey=${POLYGON_API_KEY}`;

  const res = await fetch(url);
  const json = await res.json();
  const results = json?.results ?? [];
  const polygonNextUrl = json?.next_url
    ? `${json.next_url}&apiKey=${POLYGON_API_KEY}`
    : null;

  let updated = 0;
  let skipped = 0;

  // Batch upsert market caps
  for (const ticker of results) {
    const symbol = ticker.ticker;
    const market_cap = ticker.market_cap;

    if (!symbol || !market_cap || market_cap <= 0) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from("ticker_search")
      .update({ market_cap: Math.round(market_cap) })
      .eq("symbol", symbol);

    if (!error) updated++;
  }

  // Count remaining nulls
  const { count } = await supabase
    .from("ticker_search")
    .select("symbol", { count: "exact", head: true })
    .is("market_cap", null)
    .eq("active", true);

  return new Response(
    JSON.stringify({
      updated,
      skipped,
      fetched: results.length,
      remaining_null: count,
      has_more: !!polygonNextUrl,
      next_url: polygonNextUrl,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
