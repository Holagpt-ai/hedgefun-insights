import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  const cors = getCorsHeaders(req);

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const ticker = searchParams.get("ticker")?.toUpperCase();

    let data: unknown;

    switch (type) {
      case "gainers": {
        const res = await fetch(polyUrl("/v2/snapshot/locale/us/markets/stocks/gainers"));
        const json = await res.json();
        data = json.tickers ?? [];
        break;
      }
      case "losers": {
        const res = await fetch(polyUrl("/v2/snapshot/locale/us/markets/stocks/losers"));
        const json = await res.json();
        data = json.tickers ?? [];
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
