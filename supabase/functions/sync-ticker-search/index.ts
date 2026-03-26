import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const POLYGON_BASE = "https://api.massive.com";
const API_KEY = Deno.env.get("POLYGON_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function polyUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set("apiKey", API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let totalSynced = 0;
  let cursor: string | null = null;
  const batchSize = 1000;

  try {
    do {
      const params: Record<string, string> = {
        active: "true",
        market: "stocks",
        locale: "us",
        limit: String(batchSize),
        sort: "ticker",
        order: "asc",
      };
      if (cursor) params.cursor = cursor;

      const res = await fetch(polyUrl("/v3/reference/tickers", params));
      const json = await res.json();
      const results = json.results ?? [];

      if (results.length === 0) break;

      const rows = results.map((r: any) => ({
        symbol: r.ticker,
        name: r.name ?? r.ticker,
        exchange: r.primary_exchange ?? null,
        market: r.market ?? "stocks",
        type: r.type ?? "CS",
        active: r.active ?? true,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("ticker_search")
        .upsert(rows, { onConflict: "symbol", ignoreDuplicates: false });

      if (error) console.error("Upsert error:", error);

      totalSynced += results.length;

      if (json.next_url) {
        const nextUrl = new URL(json.next_url);
        cursor = nextUrl.searchParams.get("cursor");
      } else {
        cursor = null;
      }

      // Rate limit delay
      await new Promise((r) => setTimeout(r, 250));
    } while (cursor);

    return new Response(JSON.stringify({ synced: totalSynced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-ticker-search error:", err);
    return new Response(JSON.stringify({ error: String(err), synced: totalSynced }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
