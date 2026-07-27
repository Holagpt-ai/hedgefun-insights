// Injectable Screener sync runner — used by the Edge entrypoint and Deno tests.

import {
  authorizeScreenerSync,
  type EnvReader,
} from "../_shared/screeners/auth.ts";
import {
  fetchJsonBounded,
  type FetchLike,
  parseTickersPayload,
  ProviderUnavailableError,
} from "../_shared/screeners/provider.ts";
import {
  normalizeSymbol,
  type PolygonTicker,
  selectForTab,
} from "../_shared/screeners/selection.ts";
import {
  mapTabRows,
  type ScreenerResultRow,
} from "../_shared/screeners/rows.ts";

const BASE = "https://api.polygon.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type DbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      in: (
        col: string,
        values: string[],
      ) => Promise<{ data: Array<{ symbol: string; name: string }> | null }>;
    };
    upsert: (
      rows: ScreenerResultRow[],
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      lt: (
        col: string,
        value: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export type SyncDeps = {
  env: EnvReader;
  fetch: FetchLike;
  createClient: (url: string, key: string) => DbClient;
  nowIso: () => string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Load company names from stocks for the bounded selected-symbol set only. */
async function loadNameMapFromStocks(
  sb: DbClient,
  symbols: string[],
): Promise<Record<string, string>> {
  const nameMap: Record<string, string> = {};
  if (symbols.length === 0) return nameMap;

  const { data: stockRows } = await sb
    .from("stocks")
    .select("symbol, name")
    .in("symbol", symbols);
  for (const s of stockRows ?? []) {
    if (s.symbol && s.name) nameMap[s.symbol] = s.name;
  }
  return nameMap;
}

function selectedSymbolUnion(
  ...groups: PolygonTicker[][]
): string[] {
  const set = new Set<string>();
  for (const group of groups) {
    for (const t of group) {
      const s = normalizeSymbol(t?.ticker);
      if (s) set.add(s);
    }
  }
  return [...set].sort();
}

/**
 * Full Screener sync request handler with injectable dependencies.
 * Auth runs before any provider or database work.
 * Required provider evidence must succeed before any mutation.
 */
export async function handleSyncScreenerData(
  req: Request,
  deps: SyncDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const auth = await authorizeScreenerSync(
    req.headers.get("Authorization"),
    deps.env,
  );
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  const apiKey = deps.env("POLYGON_API_KEY") ?? "";
  const supabaseUrl = deps.env("SUPABASE_URL") ?? "";
  const serviceRole = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!apiKey || !supabaseUrl || !serviceRole) {
    return json({ error: "misconfigured" }, 500);
  }

  const headers = { Authorization: `Bearer ${apiKey}` };

  // ── Required provider evidence (fail closed — zero DB mutations) ────────
  let allTickers: PolygonTicker[];
  let gainers: PolygonTicker[];
  let losers: PolygonTicker[];
  try {
    const [snapBody, gainBody, lossBody] = await Promise.all([
      fetchJsonBounded(
        `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers?include_otc=false`,
        { headers },
        { fetchImpl: deps.fetch },
      ),
      fetchJsonBounded(
        `${BASE}/v2/snapshot/locale/us/markets/stocks/gainers?include_otc=false`,
        { headers },
        { fetchImpl: deps.fetch },
      ),
      fetchJsonBounded(
        `${BASE}/v2/snapshot/locale/us/markets/stocks/losers?include_otc=false`,
        { headers },
        { fetchImpl: deps.fetch },
      ),
    ]);
    allTickers = parseTickersPayload(snapBody) as PolygonTicker[];
    gainers = parseTickersPayload(gainBody) as PolygonTicker[];
    losers = parseTickersPayload(lossBody) as PolygonTicker[];
  } catch (e) {
    if (!(e instanceof ProviderUnavailableError)) {
      console.error("[sync-screener-data] provider error");
    }
    return json({ error: "provider_unavailable" }, 503);
  }

  // ── Volume-first tab selection before any company-name enrichment ───────
  const dayTradeSelected = selectForTab("day_trade_radar", allTickers);
  const gapperSelected = selectForTab("gappers", allTickers);
  const volumeSpikeSelected = selectForTab("volume_spikes", allTickers);
  const gainersLosersSelected = selectForTab("gainers_losers", [
    ...gainers,
    ...losers,
  ]);
  const unusualSelected = selectForTab("unusual_volume", allTickers);

  const selectedSymbols = selectedSymbolUnion(
    dayTradeSelected,
    gapperSelected,
    volumeSpikeSelected,
    gainersLosersSelected,
    unusualSelected,
  );

  // ── Database work: stocks name lookup for selected symbols only ─────────
  const sb = deps.createClient(supabaseUrl, serviceRole);
  const updatedAt = deps.nowIso();
  const nameMap = await loadNameMapFromStocks(sb, selectedSymbols);
  const getName = (ticker: string) => nameMap[ticker] ?? ticker;

  const dayTradeRows = mapTabRows(
    "day_trade_radar",
    dayTradeSelected,
    getName,
    updatedAt,
  );
  const gapperRows = mapTabRows("gappers", gapperSelected, getName, updatedAt);
  const volumeSpikeRows = mapTabRows(
    "volume_spikes",
    volumeSpikeSelected,
    getName,
    updatedAt,
  );
  const gainersLosersRows = mapTabRows(
    "gainers_losers",
    gainersLosersSelected,
    getName,
    updatedAt,
  );
  const unusualVolumeRows = mapTabRows(
    "unusual_volume",
    unusualSelected,
    getName,
    updatedAt,
  );

  // New Highs/Lows: intentionally unimplemented this sprint.
  const newHighsLowsRows: ScreenerResultRow[] = [];

  const allRows = [
    ...dayTradeRows,
    ...gapperRows,
    ...volumeSpikeRows,
    ...gainersLosersRows,
    ...unusualVolumeRows,
    ...newHighsLowsRows,
  ];

  let upserted = 0;
  const batchSize = 100;
  for (let i = 0; i < allRows.length; i += batchSize) {
    const batch = allRows.slice(i, i + batchSize);
    const { error } = await sb
      .from("screener_results")
      .upsert(batch, { onConflict: "tab_id,symbol" });
    if (error) {
      console.error("[sync-screener-data] upsert failed");
      return json({ error: "database_error" }, 500);
    }
    upserted += batch.length;
  }

  // Existing 30-minute stale cleanup — intentionally unchanged this sprint.
  await sb
    .from("screener_results")
    .delete()
    .lt("updated_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

  return json({
    ok: true,
    tickers_scanned: allTickers.length,
    upserted,
    tabs: {
      day_trade_radar: dayTradeRows.length,
      gappers: gapperRows.length,
      volume_spikes: volumeSpikeRows.length,
      gainers_losers: gainersLosersRows.length,
      unusual_volume: unusualVolumeRows.length,
    },
  });
}
