import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYGON_BASE = "https://api.polygon.io";

function polyUrl(path: string, apiKey: string, params: Record<string, string> = {}): string {
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set("apiKey", apiKey);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

    const { data: stocks, error: fetchErr } = await supabase.from("stocks").select("symbol");
    if (fetchErr) throw fetchErr;
    const symbols = (stocks ?? []).map((s: { symbol: string }) => s.symbol);
    console.log(`Syncing ${symbols.length} stocks...`);

    let updated = 0;
    let errors = 0;

    // Process ONE symbol at a time with delays to stay under 5 req/min free tier
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        // Only use the free-tier endpoint: ticker details (includes market_cap, name, sector, etc.)
        const detailsJson = await fetchJson(
          polyUrl(`/v3/reference/tickers/${symbol}`, API_KEY)
        );
        const d = detailsJson?.results;
        if (!d) {
          console.warn(`No details for ${symbol}`);
          errors++;
          continue;
        }

        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
          name: d.name ?? undefined,
          market_cap: d.market_cap ? Math.round(d.market_cap) : null,
          description: d.description ?? null,
          website: d.homepage_url ?? null,
          exchange: d.primary_exchange ?? null,
        };

        // Map SIC description to sector/industry
        if (d.sic_description) {
          updateData.sector = d.sic_description;
          updateData.industry = d.sic_description;
        }

        // Logo
        if (d.branding?.icon_url) {
          updateData.logo_url = `${d.branding.icon_url}?apiKey=${API_KEY}`;
        }

        // Remove undefined
        Object.keys(updateData).forEach((k) => {
          if (updateData[k] === undefined) delete updateData[k];
        });

        const { error: updateErr } = await supabase
          .from("stocks")
          .update(updateData)
          .eq("symbol", symbol);

        if (updateErr) {
          console.error(`DB error ${symbol}:`, updateErr.message);
          errors++;
        } else {
          updated++;
          console.log(`Updated ${symbol} (${i + 1}/${symbols.length})`);
        }
      } catch (err) {
        console.error(`Error ${symbol}:`, (err as Error).message);
        errors++;
      }

      // Free tier: 5 requests/minute → 1 request every 13 seconds
      // But edge functions timeout at 60s, so we do 1 req/sec and accept some 429s
      // For paid tier this delay can be removed
      if (i < symbols.length - 1) {
        await delay(800);
      }
    }

    console.log(`Done: ${updated} updated, ${errors} errors out of ${symbols.length}`);
    return new Response(
      JSON.stringify({ success: true, updated, errors, total: symbols.length }),
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
