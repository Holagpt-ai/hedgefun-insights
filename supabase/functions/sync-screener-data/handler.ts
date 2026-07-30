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
  allHaveProviderAsOf,
  normalizeSymbol,
  type PolygonTicker,
  selectForTab,
} from "../_shared/screeners/selection.ts";
import {
  type GenerationMeta,
  mapTabRows,
  type ScreenerResultRow,
} from "../_shared/screeners/rows.ts";

const BASE = "https://api.polygon.io";
export const REPLACE_GENERATION_RPC = "replace_screener_results_generation_v1";

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
  };
  rpc: (
    fn: string,
    args: {
      p_rows: ScreenerResultRow[];
      p_sync_run_id: string;
      p_synced_at: string;
    },
  ) => Promise<{ data: number | null; error: { message: string } | null }>;
};

export type SyncDeps = {
  env: EnvReader;
  fetch: FetchLike;
  createClient: (url: string, key: string) => DbClient;
  nowIso: () => string;
  /** Injectable for deterministic tests; defaults to Date.now(). */
  nowMs?: () => number;
  /** Injectable for deterministic tests; defaults to crypto.randomUUID(). */
  newSyncRunId?: () => string;
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

function selectedSymbolUnion(...groups: PolygonTicker[][]): string[] {
  const set = new Set<string>();
  for (const group of groups) {
    for (const t of group) {
      const s = normalizeSymbol(t?.ticker);
      if (s) set.add(s);
    }
  }
  return [...set].sort();
}

function providerAsOfBounds(
  rows: ScreenerResultRow[],
): { min: string | null; max: string | null } {
  if (rows.length === 0) return { min: null, max: null };
  let min = rows[0].provider_as_of;
  let max = rows[0].provider_as_of;
  for (const r of rows) {
    if (r.provider_as_of < min) min = r.provider_as_of;
    if (r.provider_as_of > max) max = r.provider_as_of;
  }
  return { min, max };
}

/**
 * Full Screener sync request handler with injectable dependencies.
 * Auth runs before any provider or database work.
 * Required provider evidence + selected-row freshness must succeed
 * before any database read or mutation.
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

  // ── Required provider evidence (fail closed — zero DB work) ─────────────
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

  // ── Volume-first tab selection before enrichment / freshness / DB ───────
  const dayTradeSelected = selectForTab("day_trade_radar", allTickers);
  const gapperSelected = selectForTab("gappers", allTickers);
  const volumeSpikeSelected = selectForTab("volume_spikes", allTickers);
  const gainersLosersSelected = selectForTab("gainers_losers", [
    ...gainers,
    ...losers,
  ]);
  const unusualSelected = selectForTab("unusual_volume", allTickers);

  const selectedAll = [
    ...dayTradeSelected,
    ...gapperSelected,
    ...volumeSpikeSelected,
    ...gainersLosersSelected,
    ...unusualSelected,
  ];

  const nowMs = (deps.nowMs ?? (() => Date.now()))();
  const syncedAt = deps.nowIso();
  const syncRunId = (deps.newSyncRunId ?? (() => crypto.randomUUID()))();

  // Selected rows must carry verifiable Polygon observation timestamps.
  if (!allHaveProviderAsOf(selectedAll, nowMs)) {
    return json({ error: "provider_freshness_unavailable" }, 503);
  }

  const selectedSymbols = selectedSymbolUnion(
    dayTradeSelected,
    gapperSelected,
    volumeSpikeSelected,
    gainersLosersSelected,
    unusualSelected,
  );

  // ── Database work begins only after freshness evidence is verified ──────
  const sb = deps.createClient(supabaseUrl, serviceRole);
  const nameMap = await loadNameMapFromStocks(sb, selectedSymbols);
  const getName = (ticker: string) => nameMap[ticker] ?? ticker;

  const meta: GenerationMeta = { syncedAt, syncRunId, nowMs };

  const dayTradeRows = mapTabRows(
    "day_trade_radar",
    dayTradeSelected,
    getName,
    meta,
  );
  const gapperRows = mapTabRows("gappers", gapperSelected, getName, meta);
  const volumeSpikeRows = mapTabRows(
    "volume_spikes",
    volumeSpikeSelected,
    getName,
    meta,
  );
  const gainersLosersRows = mapTabRows(
    "gainers_losers",
    gainersLosersSelected,
    getName,
    meta,
  );
  const unusualVolumeRows = mapTabRows(
    "unusual_volume",
    unusualSelected,
    getName,
    meta,
  );

  // New Highs/Lows remains intentionally empty; RPC still clears that tab.
  const allRows = [
    ...dayTradeRows,
    ...gapperRows,
    ...volumeSpikeRows,
    ...gainersLosersRows,
    ...unusualVolumeRows,
  ];

  const { data: rowsInserted, error: rpcError } = await sb.rpc(
    REPLACE_GENERATION_RPC,
    {
      p_rows: allRows,
      p_sync_run_id: syncRunId,
      p_synced_at: syncedAt,
    },
  );
  if (rpcError) {
    console.error("[sync-screener-data] replace generation failed");
    return json({ error: "database_error" }, 500);
  }
  if (
    typeof rowsInserted !== "number" ||
    !Number.isInteger(rowsInserted) ||
    rowsInserted < 0 ||
    rowsInserted !== allRows.length
  ) {
    console.error("[sync-screener-data] replace generation count mismatch");
    return json({ error: "database_error" }, 500);
  }

  const bounds = providerAsOfBounds(allRows);

  return json({
    ok: true,
    sync_run_id: syncRunId,
    tickers_scanned: allTickers.length,
    rows_inserted: rowsInserted,
    tabs: {
      day_trade_radar: dayTradeRows.length,
      gappers: gapperRows.length,
      volume_spikes: volumeSpikeRows.length,
      gainers_losers: gainersLosersRows.length,
      unusual_volume: unusualVolumeRows.length,
    },
    provider_as_of_min: bounds.min,
    provider_as_of_max: bounds.max,
    synced_at: syncedAt,
  });
}
