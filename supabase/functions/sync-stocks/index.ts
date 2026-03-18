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
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const limit = parseInt(searchParams.get("limit") ?? "5", 10);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: stocks } = await supabase
      .from("stocks")
      .select("symbol")
      .order("symbol")
      .range(offset, offset + limit - 1);

    const symbols = (stocks ?? []).map((s: { symbol: string }) => s.symbol);
    if (symbols.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No more stocks", updated: 0, errors: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Batch ${offset}-${offset + symbols.length - 1}: ${symbols.join(", ")}`);

    let updated = 0;
    let errors = 0;

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        const json = await fetchJson(polyUrl(`/v3/reference/tickers/${symbol}`, API_KEY));
        const d = json?.results;
        if (!d) { errors++; continue; }

        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
          market_cap: d.market_cap ? Math.round(d.market_cap) : null,
          description: d.description ?? null,
          website: d.homepage_url ?? null,
          exchange: d.primary_exchange ?? null,
        };
        if (d.name) updateData.name = d.name;
        if (d.sic_description) {
          updateData.sector = d.sic_description;
          updateData.industry = d.sic_description;
        }
        if (d.branding?.icon_url) {
          updateData.logo_url = `${d.branding.icon_url}?apiKey=${API_KEY}`;
        }

        const { error: ue } = await supabase.from("stocks").update(updateData).eq("symbol", symbol);
        if (ue) { console.error(`DB err ${symbol}:`, ue.message); errors++; }
        else { updated++; console.log(`✓ ${symbol}`); }
      } catch (err) {
        console.error(`✗ ${symbol}:`, (err as Error).message);
        errors++;
      }

      // Wait between requests to avoid rate limits
      if (i < symbols.length - 1) await delay(13000);
    }

    return new Response(
      JSON.stringify({ success: true, updated, errors, symbols, nextOffset: offset + limit }),
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
