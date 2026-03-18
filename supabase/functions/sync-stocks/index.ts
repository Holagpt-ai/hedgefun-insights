import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYGON_BASE = "https://api.polygon.io";

function polyUrl(path: string, apiKey: string): string {
  return `${POLYGON_BASE}${path}?apiKey=${apiKey}`;
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const API_KEY = Deno.env.get("POLYGON_API_KEY");
    if (!API_KEY) throw new Error("POLYGON_API_KEY not configured");

    const { searchParams } = new URL(req.url);
    // offset/limit let you page through stocks across multiple calls
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const batchSize = parseInt(searchParams.get("limit") ?? "10", 10);
    // delayMs: 200 for paid (100 req/min), 13000 for free (5 req/min)
    const delayMs = parseInt(searchParams.get("delay") ?? "200", 10);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: stocks } = await supabase
      .from("stocks")
      .select("symbol")
      .order("symbol")
      .range(offset, offset + batchSize - 1);

    const symbols = (stocks ?? []).map((s: { symbol: string }) => s.symbol);
    if (symbols.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No more stocks to sync", updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Syncing batch: offset=${offset}, symbols=${symbols.join(",")}`);

    let updated = 0;
    let errors = 0;

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        // Fetch ticker details (free tier) and snapshot (paid tier)
        let detailsData = null;
        let snapData = null;

        try {
          const dJson = await fetchJson(polyUrl(`/v3/reference/tickers/${symbol}`, API_KEY));
          detailsData = dJson?.results;
        } catch (e) {
          console.warn(`Details failed for ${symbol}: ${(e as Error).message}`);
        }

        try {
          const sJson = await fetchJson(polyUrl(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`, API_KEY));
          snapData = sJson?.ticker;
        } catch {
          // Snapshot requires paid plan, silently skip
        }

        if (!detailsData && !snapData) { errors++; continue; }

        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (detailsData) {
          if (detailsData.name) updateData.name = detailsData.name;
          updateData.market_cap = detailsData.market_cap ? Math.round(detailsData.market_cap) : null;
          updateData.description = detailsData.description ?? null;
          updateData.website = detailsData.homepage_url ?? null;
          updateData.exchange = detailsData.primary_exchange ?? null;
          if (detailsData.sic_description) {
            updateData.sector = detailsData.sic_description;
            updateData.industry = detailsData.sic_description;
          }
          if (detailsData.branding?.icon_url) {
            updateData.logo_url = `${detailsData.branding.icon_url}?apiKey=${API_KEY}`;
          }
        }

        if (snapData) {
          const day = snapData.day ?? snapData.prevDay ?? {};
          updateData.price = day.c ?? snapData.lastTrade?.p ?? null;
          updateData.change_amount = snapData.todaysChange ?? null;
          updateData.change_percent = snapData.todaysChangePerc ?? null;
          updateData.volume = day.v ?? null;
        }

        const { error: ue } = await supabase.from("stocks").update(updateData).eq("symbol", symbol);
        if (ue) { console.error(`DB err ${symbol}:`, ue.message); errors++; }
        else { updated++; }
      } catch (err) {
        console.error(`${symbol}:`, (err as Error).message);
        errors++;
      }

      if (i < symbols.length - 1) await delay(delayMs);
    }

    return new Response(
      JSON.stringify({ success: true, updated, errors, total: symbols.length, nextOffset: offset + batchSize }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-stocks error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
