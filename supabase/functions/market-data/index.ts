import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigins = [
    "https://www.hedgefun.fun",
    "https://hedgefun.fun",
  ];
  const resolvedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": resolvedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

const POLYGON_BASE = "https://api.polygon.io";

function polyUrl(path: string, params: Record<string, string> = {}): string {
  const API_KEY = Deno.env.get("POLYGON_API_KEY")!;
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set("apiKey", API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const res = await fetch(polyUrl(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`));
        const json = await res.json();
        data = json.ticker ?? null;
        break;
      }
      case "details": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const multiplier = searchParams.get("multiplier") ?? "1";
        const timespan = searchParams.get("timespan") ?? "day";
        const from = searchParams.get("from") ?? "";
        const to = searchParams.get("to") ?? "";
        if (!from || !to) return new Response(JSON.stringify({ error: "from and to required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const res = await fetch(polyUrl(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, { adjusted: "true", sort: "asc", limit: "365" }));
        const json = await res.json();
        data = json.results ?? [];
        break;
      }
      case "prev-close": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const res = await fetch(polyUrl(`/v2/aggs/ticker/${ticker}/prev`));
        const json = await res.json();
        data = json.results?.[0] ?? null;
        break;
      }
      default:
        return new Response(JSON.stringify({ error: "Invalid type. Use: gainers, losers, snapshot, details, news, aggregates, prev-close" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("market-data error:", e);
    return new Response(JSON.stringify({ error: "Market data unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
