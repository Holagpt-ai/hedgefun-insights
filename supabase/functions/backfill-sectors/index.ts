import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIC_TO_SECTOR: Record<string, string> = {
  "Technology": "Technology",
  "Consumer Cyclical": "Consumer Discretionary",
  "Consumer Defensive": "Consumer Staples",
  "Financial Services": "Financials",
  "Healthcare": "Healthcare",
  "Industrials": "Industrials",
  "Communication Services": "Communication Services",
  "Energy": "Energy",
  "Utilities": "Utilities",
  "Real Estate": "Real Estate",
  "Basic Materials": "Materials",
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const API_KEY = Deno.env.get("POLYGON_API_KEY")!;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get offset from query params for pagination
  const { searchParams } = new URL(req.url);
  const offset = parseInt(searchParams.get("offset") || "0");
  const limit = parseInt(searchParams.get("limit") || "50");

  const { data: missing } = await supabase
    .from("stocks")
    .select("symbol")
    .or("sector.is.null,industry.is.null")
    .order("symbol")
    .range(offset, offset + limit - 1);

  const tickers = (missing ?? []).map((r) => r.symbol);
  let updated = 0;
  let errors = 0;

  const BATCH = 5;
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const fetches = batch.map(async (ticker) => {
      try {
        const res = await fetch(
          `https://api.massive.com/v3/reference/tickers/${ticker}?apiKey=${API_KEY}`
        );
        if (!res.ok) { errors++; return; }
        const json = await res.json();
        const r = json.results;
        if (!r) return;

        const updateData: Record<string, unknown> = {};
        if (r.sic_description) updateData.industry = r.sic_description;
        const rawSector = r.sector || "";
        if (rawSector) updateData.sector = SIC_TO_SECTOR[rawSector] || rawSector;
        if (r.market_cap) updateData.market_cap = Math.round(r.market_cap);
        if (r.name) updateData.name = r.name;

        if (Object.keys(updateData).length > 0) {
          const { error } = await supabase
            .from("stocks")
            .update(updateData)
            .eq("symbol", ticker);
          if (error) { errors++; } else { updated++; }
        }
      } catch { errors++; }
    });
    await Promise.all(fetches);
    if (i + BATCH < tickers.length) await delay(1200);
  }

  const { count } = await supabase
    .from("stocks")
    .select("symbol", { count: "exact", head: true })
    .or("sector.is.null,industry.is.null");

  return new Response(
    JSON.stringify({ updated, errors, remaining: count, nextOffset: offset + limit }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
