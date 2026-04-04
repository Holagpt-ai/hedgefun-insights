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
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  const symbols = tickers.map((t) => t.symbol).join(",");

  // Fetch snapshot for all 100 tickers in one API call
  const url =
    `https://api.polygon.io/v2/snapshot/locale/us/` +
    `markets/stocks/tickers?tickers=${symbols}` +
    `&apiKey=${POLYGON_API_KEY}`;

  const res = await fetch(url);
  const json = await res.json();
  const snaps = json?.tickers ?? [];

  let updated = 0;

  for (const snap of snaps) {
    const symbol = snap.ticker;
    // market_cap = shares outstanding * current price
    const price = snap?.day?.c || snap?.prevDay?.c || 0;
    const shares = snap?.shareClassSharesOutstanding || 0;
    const market_cap =
      price > 0 && shares > 0 ? Math.round(price * shares) : null;

    if (market_cap && market_cap > 0) {
      await supabase
        .from("ticker_search")
        .update({ market_cap })
        .eq("symbol", symbol);
      updated++;
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
    }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
});
