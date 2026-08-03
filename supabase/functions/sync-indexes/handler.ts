// Injectable market-index sync runner — used by the Edge entrypoint and Deno tests.
// Extracted so tests can mock fetch/DB without starting the HTTP server.

import { timingSafeMatchAny } from "../_shared/timing-safe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Complete displayed market-index universe (must match MarketTicker / DashboardIndexCards). */
export const INDEXES = [
  { ticker: "SPY", name: "S&P 500" },
  { ticker: "QQQ", name: "Nasdaq 100" },
  { ticker: "DIA", name: "Dow Jones" },
  { ticker: "IWM", name: "Russell 2000" },
  { ticker: "VIXY", name: "VIX" },
  { ticker: "GLD", name: "Gold" },
  { ticker: "SLV", name: "Silver" },
  { ticker: "IBIT", name: "Bitcoin" },
  { ticker: "BNO", name: "Brent Crude" },
  { ticker: "UNG", name: "Nat Gas" },
  { ticker: "TLT", name: "20Y Treasury" },
  { ticker: "UUP", name: "US Dollar" },
] as const;

export type IndexDefinition = (typeof INDEXES)[number];

export type MarketIndexRow = {
  symbol: string;
  name: string;
  current_value: number;
  change_amount: number | null;
  change_percent: number;
  sparkline_data: number[];
  updated_at: string;
};

export type DbClient = {
  from: (table: string) => {
    upsert: (
      row: MarketIndexRow,
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
};

export type EnvReader = (key: string) => string | undefined;

export type SyncDeps = {
  env: EnvReader;
  fetch: typeof fetch;
  createClient: (url: string, key: string) => DbClient;
  nowIso: () => string;
  nowMs?: () => number;
};

// Sanitize any error string so Polygon URLs / apiKey query params never leak to logs or responses.
export function sanitize(msg: string): string {
  return String(msg)
    .replace(/apiKey=[^&\s"']+/gi, "apiKey=***")
    .replace(/https?:\/\/api\.polygon\.io[^\s"']*/gi, "https://api.polygon.io/***");
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleSyncIndexes(req: Request, deps: SyncDeps): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Restrict to service-role or the cron-signing SYNC_SECRET. Server-only; no browser access.
  const auth = req.headers.get("Authorization") ?? "";
  const srk = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const syncSecret = deps.env("SYNC_SECRET") ?? "";
  const okAuth = await timingSafeMatchAny(auth, [
    srk ? `Bearer ${srk}` : "",
    syncSecret ? `Bearer ${syncSecret}` : "",
  ]);
  if (!okAuth) {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    const API_KEY = deps.env("POLYGON_API_KEY");
    if (!API_KEY) {
      return json({ success: false, error: "POLYGON_API_KEY not configured" }, 500);
    }

    const supabase = deps.createClient(
      deps.env("SUPABASE_URL")!,
      deps.env("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const nowMs = deps.nowMs ? deps.nowMs() : Date.now();
    const today = new Date(nowMs).toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(nowMs - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const results: Array<{ ticker: string; status: "ok" | "error"; points?: number; message?: string }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const idx of INDEXES) {
      try {
        const snapRes = await deps.fetch(
          `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${idx.ticker}?apiKey=${API_KEY}`,
        );
        if (!snapRes.ok) {
          throw new Error(`snapshot http ${snapRes.status}`);
        }
        const snapJson = await snapRes.json();
        if (snapJson?.status && String(snapJson.status).toUpperCase() === "ERROR") {
          throw new Error(`snapshot polygon error`);
        }
        const t = snapJson?.ticker;

        const aggRes = await deps.fetch(
          `https://api.polygon.io/v2/aggs/ticker/${idx.ticker}/range/1/day/${thirtyDaysAgo}/${today}?adjusted=true&sort=asc&limit=50&apiKey=${API_KEY}`,
        );
        if (!aggRes.ok) {
          throw new Error(`aggregates http ${aggRes.status}`);
        }
        const aggJson = await aggRes.json();
        if (aggJson?.status && String(aggJson.status).toUpperCase() === "ERROR") {
          throw new Error(`aggregates polygon error`);
        }
        const aggResults: Array<{ c?: unknown }> = Array.isArray(aggJson?.results)
          ? aggJson.results
          : [];
        const sparklineData: number[] = aggResults
          .map((r) => r?.c)
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

        // Price fallback chain (mirrors resolveCurrentPrice)
        const dayClose = t?.day?.c;
        const minClose = t?.min?.c;
        const lastTrade = t?.lastTrade?.p;
        const prevClose = t?.prevDay?.c;
        const currentPrice =
          dayClose && dayClose > 0 ? dayClose
          : minClose && minClose > 0 ? minClose
          : lastTrade && lastTrade > 0 ? lastTrade
          : prevClose && prevClose > 0 ? prevClose
          : null;

        // Never write null/invalid market data.
        if (typeof currentPrice !== "number" || !Number.isFinite(currentPrice) || currentPrice <= 0) {
          throw new Error("invalid current_value");
        }
        if (sparklineData.length < 2) {
          throw new Error("missing sparkline data");
        }

        const changeAmount = prevClose && prevClose > 0 ? currentPrice - prevClose : null;
        const changePercent =
          prevClose && prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : null;

        if (changePercent === null) {
          throw new Error("missing change_percent");
        }

        const row: MarketIndexRow = {
          symbol: idx.ticker,
          name: idx.name,
          current_value: currentPrice,
          change_amount: changeAmount,
          change_percent: changePercent,
          sparkline_data: sparklineData,
          updated_at: deps.nowIso(),
        };

        const { error } = await supabase
          .from("market_indexes")
          .upsert(row, { onConflict: "symbol" });

        if (error) {
          throw new Error(`upsert: ${error.message}`);
        }

        console.log(`${idx.ticker}: ok, sparkline=${sparklineData.length}, value=${currentPrice}`);
        results.push({ ticker: idx.ticker, status: "ok", points: sparklineData.length });
        successCount++;
      } catch (e) {
        const msg = sanitize((e as Error).message ?? "unknown");
        console.error(`${idx.ticker}: ${msg}`);
        results.push({ ticker: idx.ticker, status: "error", message: msg });
        failureCount++;
      }
    }

    // Response contract:
    //   all ok     -> 200 success:true
    //   partial    -> 207 success:false partial:true
    //   all failed -> 502 success:false
    if (successCount === INDEXES.length) {
      return json({ success: true, successCount, failureCount, results }, 200);
    }
    if (successCount === 0) {
      return json({ success: false, successCount, failureCount, results }, 502);
    }
    return json({ success: false, partial: true, successCount, failureCount, results }, 207);
  } catch (e) {
    const msg = sanitize(e instanceof Error ? e.message : "Unknown error");
    console.error("sync-indexes error:", msg);
    return json({ success: false, error: msg }, 500);
  }
}
