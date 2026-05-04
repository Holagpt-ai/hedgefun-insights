import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POLYGON_API_KEY = Deno.env.get("POLYGON_API_KEY");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { ticker } = await req.json();
    const sym = String(ticker ?? "").toUpperCase();
    if (!sym || !TICKER_RE.test(sym)) {
      return new Response(JSON.stringify({ error: "Invalid ticker" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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
