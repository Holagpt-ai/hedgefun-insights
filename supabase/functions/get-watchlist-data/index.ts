import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { ticker } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sym = ticker.toUpperCase();
    const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${POLYGON_API_KEY}`;
    const detailsUrl = `https://api.polygon.io/v3/reference/tickers/${sym}?apiKey=${POLYGON_API_KEY}`;

    const [snapRes, detailsRes] = await Promise.all([
      fetch(snapshotUrl, { signal: AbortSignal.timeout(8000) }),
      fetch(detailsUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null),
    ]);

    const snapJson = await snapRes.json();
    const snap = snapJson?.ticker ?? {};

    let market_cap: number | null = null;
    if (detailsRes && detailsRes.ok) {
      const detailsJson = await detailsRes.json();
      market_cap = detailsJson?.results?.market_cap ?? null;
    }

    console.log(`[get-watchlist-data] ${sym}: price=${snap?.day?.c ?? "n/a"}, mc=${market_cap ?? "n/a"}`);

    return new Response(JSON.stringify({ ...snap, market_cap }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[get-watchlist-data] error:", e);
    return new Response(JSON.stringify({ error: "Failed to fetch snapshot" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
