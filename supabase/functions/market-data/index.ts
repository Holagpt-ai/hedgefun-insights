import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const POLYGON_BASE = "https://api.polygon.io";

const NAME_SUFFIXES = [
  /\s+Common\s+Stock$/i, /\s+Common\s+Shares$/i, /\s+Ordinary\s+Shares?$/i,
  /\s+Class\s+[A-Z]\d?.*$/i, /\s+Warrants?$/i, /\s+Warrant$/i,
  /\s+Rights?\s*\(.*?\)$/i, /\s+Rights?$/i, /\s+Units?$/i,
  /\s+American\s+Depositary\s+Shares?$/i, /\s+Depositary\s+Shares?$/i,
  /\s+Subordinate\s+Voting\s+Shares?$/i, /\s+Multiple\s+Voting\s+Shares?$/i,
  /\s+Trust$/i,
  /,?\s+Inc\.?$/i, /,?\s+Corp\.?$/i, /,?\s+Ltd\.?$/i, /,?\s+LLC$/i,
  /,?\s+plc$/i, /,?\s+N\.?V\.?$/i, /,?\s+S\.?A\.?$/i, /,?\s+Co\.?$/i,
  /\s+\(.*?\)\s*$/,
];

function cleanName(name: string): string {
  let cleaned = name;
  for (let i = 0; i < 3; i++) {
    for (const re of NAME_SUFFIXES) {
      cleaned = cleaned.replace(re, "");
    }
  }
  return cleaned.trim() || name;
}

function polyUrl(path: string, params: Record<string, string> = {}): string {
  const API_KEY = Deno.env.get("POLYGON_API_KEY")!;
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set("apiKey", API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

// --- Retry helper for upstream API resilience ---
async function fetchWithRetry(
  url: string,
  retries = 3,
  delayMs = 500
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return res;
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, delayMs * 3));
        continue;
      }
      if (i === retries - 1) return res;
    } catch (err) {
      if (i === retries - 1) throw err;
    }
    await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
  }
  throw new Error("Max retries exceeded");
}

// --- In-memory cache (persists for edge function instance lifetime) ---
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const cors = corsHeaders;

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const ticker = searchParams.get("ticker")?.toUpperCase();

    console.log("[market-data] type:", type, "POLYGON_KEY:", Deno.env.get("POLYGON_API_KEY") ? "KEY_PRESENT" : "KEY_MISSING");

    let data: unknown;

    switch (type) {
      case "gainers":
      case "losers": {
        const cacheKey = type;
        const cached = getCached(cacheKey);
        if (cached) {
          data = cached;
          break;
        }

        const endpoint = type === "gainers" ? "gainers" : "losers";
        const res = await fetchWithRetry(polyUrl(`/v2/snapshot/locale/us/markets/stocks/${endpoint}`));
        const json = await res.json();
        console.log("[market-data] polygon response status:", res.status, "tickers count:", json.tickers?.length ?? 0);
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
              const r = await fetchWithRetry(polyUrl(`/v3/reference/tickers/${sym}`));
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
          price: t.day?.c > 0 ? t.day.c : (t.min?.c ?? t.prevDay?.c ?? 0),
        }));

        // Write to market_movers table for weekend/off-hours fallback
        if (tickers.length > 0) {
          const sessionDate = new Date().toISOString().split("T")[0];
          const rows = tickers.map((t: any) => ({
            symbol: t.ticker,
            name: cleanName(nameMap.get(t.ticker) || t.ticker),
            price: t.day?.c || t.prevDay?.c || 0,
            change_percent: t.todaysChangePerc ?? 0,
            volume: t.day?.v || t.min?.av || 0,
            type: type === "gainers" ? "gainer" : "loser",
            session_date: sessionDate,
            updated_at: new Date().toISOString(),
          }));
          await supabase
            .from("market_movers")
            .upsert(rows, {
              onConflict: "symbol,type,session_date",
              ignoreDuplicates: false,
            });
        }

        if ((data as any[]).length > 0) setCache(cacheKey, data);
        break;
      }
      case "snapshot": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const res = await fetchWithRetry(polyUrl(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`));
        const json = await res.json();
        data = json.ticker ?? null;
        break;
      }
      case "details": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const res = await fetchWithRetry(polyUrl(`/v3/reference/tickers/${ticker}`));
        const json = await res.json();
        data = json.results ?? null;
        break;
      }
      case "news": {
        const limit = searchParams.get("limit") ?? "10";
        const newsTicker = ticker ?? "";
        const params: Record<string, string> = { limit, order: "desc" };
        if (newsTicker) params.ticker = newsTicker;
        const res = await fetchWithRetry(polyUrl("/v2/reference/news", params));
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
        const res = await fetchWithRetry(polyUrl(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, { adjusted: "true", sort: "asc", limit: "365" }));
        const json = await res.json();
        data = json.results ?? [];
        break;
      }
      case "prev-close": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const res = await fetchWithRetry(polyUrl(`/v2/aggs/ticker/${ticker}/prev`));
        const json = await res.json();
        data = json.results?.[0] ?? null;
        break;
      }
      case "dividends": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const divLimit = searchParams.get("limit") ?? "20";
        const res = await fetchWithRetry(polyUrl(`/v3/reference/dividends`, { ticker, limit: divLimit, order: "desc" }));
        const json = await res.json();
        data = json.results ?? [];
        break;
      }
      case "splits": {
        if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const splitsLimit = searchParams.get("limit") ?? "20";
        const res = await fetchWithRetry(polyUrl(`/v3/reference/splits`, { ticker, limit: splitsLimit, order: "desc" }));
        const json = await res.json();
        data = json.results ?? [];
        break;
      }
      case "ipos": {
        const ipoStatus = searchParams.get("ipoStatus") ?? "history";
        const ipoLimit = searchParams.get("limit") ?? "20";
        const ipoParams: Record<string, string> = {
          status: ipoStatus,
          limit: ipoLimit,
          order: ipoStatus === "pending" ? "asc" : "desc",
          sort: "listing_date",
        };
        if (ipoStatus === "history") {
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          ipoParams.listing_date_gte = ninetyDaysAgo;
        }
        const ipoRes = await fetchWithRetry(polyUrl("/vX/reference/ipos", ipoParams));
        const ipoJson = await ipoRes.json();
        data = (ipoJson.results ?? []).map((r: any) => ({
          symbol: r.ticker ?? null,
          name: r.issuer_name ?? r.name ?? null,
          ipo_date: r.listing_date ?? r.announced_date ?? null,
          offer_price: r.final_issue_price ?? r.highest_offer_price ?? null,
          price_range: r.lowest_offer_price && r.highest_offer_price
            ? `$${r.lowest_offer_price} - $${r.highest_offer_price}` : null,
          status: ipoStatus === "pending" ? "upcoming" : "recent",
          exchange: r.primary_exchange ?? null,
          shares_offered: r.max_shares_offered ?? null,
          total_raised: r.total_offer_size ?? null,
        }));
        break;
      }
      case "search": {
        const query = searchParams.get("query")?.trim() ?? "";
        if (!query || query.length < 1) { data = []; break; }

        const supabaseSearch = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const upperQuery = query.toUpperCase();

        const [exactMatch, prefixMatch, nameMatch] = await Promise.all([
          supabaseSearch
            .from("ticker_search")
            .select("symbol, name, exchange, type")
            .eq("symbol", upperQuery)
            .eq("active", true)
            .limit(1),
          supabaseSearch
            .from("ticker_search")
            .select("symbol, name, exchange, type")
            .ilike("symbol", `${upperQuery}%`)
            .eq("active", true)
            .neq("symbol", upperQuery)
            .order("symbol")
            .limit(5),
          supabaseSearch
            .from("ticker_search")
            .select("symbol, name, exchange, type")
            .ilike("name", `%${query}%`)
            .eq("active", true)
            .order("symbol")
            .limit(5),
        ]);

        const seen = new Set<string>();
        const merged: any[] = [];
        const addResult = (r: any) => {
          if (!seen.has(r.symbol)) {
            seen.add(r.symbol);
            merged.push({ ticker: r.symbol, name: r.name, exchange: r.exchange, type: r.type });
          }
        };

        (exactMatch.data ?? []).forEach(addResult);
        (prefixMatch.data ?? []).forEach(addResult);
        (nameMatch.data ?? []).forEach(addResult);

        data = merged.slice(0, 8);
        break;
      }
      case "all-dividends": {
        const limit = searchParams.get("limit") ?? "50";
        const url = `https://api.polygon.io/vX/reference/dividends?limit=${limit}&sort=ex_dividend_date&order=desc&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const json = await res.json();
        return new Response(JSON.stringify(json.results ?? []), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      case "all-splits": {
        const limit = searchParams.get("limit") ?? "50";
        const url = `https://api.polygon.io/vX/reference/splits?limit=${limit}&sort=execution_date&order=desc&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const json = await res.json();
        return new Response(JSON.stringify(json.results ?? []), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      default:
        return new Response(JSON.stringify({ error: "Invalid type. Use: gainers, losers, snapshot, details, news, aggregates, prev-close, dividends, splits, ipos, search" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
    });
  } catch (e) {
    console.error("market-data error:", e);
    return new Response(
      JSON.stringify({
        status: "ERROR",
        message: "Data temporarily unavailable",
        tickers: [],
        results: [],
        data: [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
