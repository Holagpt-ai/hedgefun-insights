import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYGON_BASE = "https://api.polygon.io";

async function fetchJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
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
  // Auth: accept service role key OR anon key (dashboard + cron compatible)
  const authHeader = req.headers.get("Authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (
    authHeader !== `Bearer ${serviceKey}` &&
    authHeader !== `Bearer ${anonKey}`
  ) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const API_KEY = Deno.env.get("POLYGON_API_KEY");
    if (!API_KEY) throw new Error("POLYGON_API_KEY not configured");

    const { searchParams } = new URL(req.url);
    const maxPages = parseInt(searchParams.get("maxPages") ?? "20", 10); // 20 * 1000 = 20k tickers cap
    const pageDelayMs = parseInt(searchParams.get("delay") ?? "300", 10);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let nextUrl: string | null =
      `${POLYGON_BASE}/v3/reference/tickers?market=stocks&active=true&limit=1000&apiKey=${API_KEY}`;

    let totalUpserted = 0;
    let pages = 0;
    let errors = 0;

    while (nextUrl && pages < maxPages) {
      pages++;
      let json: any;
      try {
        json = await fetchJson(nextUrl);
      } catch (e) {
        console.error(`Page ${pages} fetch error:`, (e as Error).message);
        break;
      }

      const results: any[] = json.results ?? [];
      if (results.length === 0) break;

      // Map only fields available from the listing endpoint and present in our schema.
      // Per-symbol enrichment (market_cap, description, sic) is handled by sync-market-caps / backfill-sectors.
      const rows = results
        .filter((r) => r.ticker && r.name)
        .map((r) => ({
          symbol: r.ticker,
          name: r.name,
          exchange: r.primary_exchange ?? null,
          updated_at: new Date().toISOString(),
        }));

      // Upsert in chunks of 500 to keep payload sane
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from("stocks").upsert(chunk, { onConflict: "symbol" });
        if (error) {
          console.error(`Upsert error page ${pages} chunk ${i}:`, error.message);
          errors++;
        } else {
          totalUpserted += chunk.length;
        }
      }

      console.log(`Page ${pages}: fetched ${results.length}, upserted-so-far ${totalUpserted}`);

      nextUrl = json.next_url ? `${json.next_url}&apiKey=${API_KEY}` : null;
      if (nextUrl) await delay(pageDelayMs);
    }

    return new Response(
      JSON.stringify({ success: true, pages, upserted: totalUpserted, errors }),
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
