import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const POLYGON_BASE = "https://api.massive.com";

function polyUrl(path: string, params: Record<string, string> = {}): string {
  const API_KEY = Deno.env.get("POLYGON_API_KEY")!;
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set("apiKey", API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cors = corsHeaders;

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const ticker = searchParams.get("ticker")?.toUpperCase();

    let data: unknown;

    switch (type) {
      case "gainers":
      case "losers": {
        const endpoint = type === "gainers" ? "gainers" : "losers";
        const res = await fetch(polyUrl(`/v2/snapshot/locale/us/markets/stocks/${endpoint}`));
        const json = await res.json();
        const tickers = (json.tickers ?? []).slice(0, 20);

        // Enrich with company names from stocks table first
        const symbols = tickers.map((t: any) => t.ticker).filter(Boolean);
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const { data: stockRows } = await supabase
          .from("stocks")
          .select("symbol, name")
          .in("symbol", symbols);
        const nameMap = new Map((stockRows ?? []).map((r: any) => [r.symbol, r.name]));

        // For tickers not in DB, batch-fetch names from Massive reference API
        const missing = symbols.filter((s: string) => !nameMap.has(s));
        if (missing.length > 0) {
          const fetches = missing.slice(0, 10).map(async (sym: string) => {
            try {
              const r = await fetch(polyUrl(`/v3/reference/tickers/${sym}`));
              if (r.ok) {
                const j = await r.json();
                if (j.results?.name) nameMap.set(sym, j.results.name);
              }
            } catch {}
          });
          await Promise.all(fetches);
        }

        data = tickers.map((t: any) => ({
          ...t,
          name: cleanName(nameMap.get(t.ticker) || t.ticker),
        }));
        break;
      }
      case "snapshot": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const res = await fetch(polyUrl(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`));
        const json = await res.json();
        data = json.ticker ?? null;
        break;
      }
      case "details": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const res = await fetch(polyUrl(`/v3/reference/tickers/${ticker}`));
        const json = await res.json();
        data = json.results ?? null;
        break;
      }
      case "news": {
        const limit = searchParams.get("limit") ?? "10";
        const newsTicker = ticker ?? "";
        const params: Record<string, string> = { limit, order: "desc" };
        if (newsTicker) params.ticker = newsTicker;
        const res = await fetch(polyUrl("/v2/reference/news", params));
        const json = await res.json();
        data = json.results ?? [];
        break;
      }
      case "aggregates": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const multiplier = searchParams.get("multiplier") ?? "1";
        const timespan = searchParams.get("timespan") ?? "day";
        const from = searchParams.get("from") ?? "";
        const to = searchParams.get("to") ?? "";
        if (!from || !to) return new Response(JSON.stringify({ error: "from and to required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const res = await fetch(polyUrl(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, { adjusted: "true", sort: "asc", limit: "365" }));
        const json = await res.json();
        data = json.results ?? [];
        break;
      }
      case "prev-close": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const res = await fetch(polyUrl(`/v2/aggs/ticker/${ticker}/prev`));
        const json = await res.json();
        data = json.results?.[0] ?? null;
        break;
      }
      default:
        return new Response(JSON.stringify({ error: "Invalid type. Use: gainers, losers, snapshot, details, news, aggregates, prev-close" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("market-data error:", e);
    return new Response(JSON.stringify({ error: "Market data unavailable" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
