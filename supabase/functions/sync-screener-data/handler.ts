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
import { shouldPreservePriorScreenerGeneration } from "../_shared/screeners/generation-preserve.ts";
import {
  isExtendedSyncSession,
  resolveSyncSessionKind,
} from "../_shared/screeners/session-sync-context.ts";
import {
  allHaveProviderAsOf,
  normalizeSymbol,
  type PolygonTicker,
  selectForTab,
  selectGainersLosersFromSnapshot,
} from "../_shared/screeners/selection.ts";
import {
  evaluateDayTradeRadar,
  formatRadarRejectionLog,
  summarizeRadarDiagnostics,
} from "../_shared/screeners/diagnostics.ts";
import {
  type GenerationMeta,
  mapNewHighsLows,
  mapTabRows,
  type ScreenerResultRow,
} from "../_shared/screeners/rows.ts";
import {
  buildTabEvaluationEvidence,
  type TabEvaluationEvidenceMap,
} from "../_shared/screeners/evaluation-evidence.ts";
import {
  POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
  parseStatePolicyExclusionFields,
  validatePolicyExclusionEvidence,
  type PolicyExclusionEvidence,
} from "../_shared/screeners/baseline-coverage.ts";
import {
  isValidBaselineQuote,
  type NhlBaselineQuote,
  type NhlBaselineStatus,
  selectNewHighsLows,
} from "../_shared/screeners/new-highs-lows.ts";

const BASE = "https://api.polygon.io";
export const REPLACE_GENERATION_RPC = "replace_screener_results_generation_v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type DbSelectResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

export type DbQuery = {
  eq: (col: string, value: string) => DbQuery;
  in: (col: string, values: string[]) => DbQuery;
  limit: (n: number) => DbQuery;
  range: (from: number, to: number) => DbQuery;
  then: (
    onfulfilled?: ((value: DbSelectResult) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

export type DbClient = {
  from: (table: string) => {
    select: (cols: string) => DbQuery;
  };
  rpc: (
    fn: string,
    args: {
      p_rows: ScreenerResultRow[];
      p_sync_run_id: string;
      p_synced_at: string;
      p_nhl_baseline_status: NhlBaselineStatus;
      p_tab_evaluation_evidence?: TabEvaluationEvidenceMap;
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
    const symbol = typeof s.symbol === "string" ? s.symbol : "";
    const name = typeof s.name === "string" ? s.name : "";
    if (symbol && name) nameMap[symbol] = name;
  }
  return nameMap;
}

const BASELINE_PAGE = 1000;
const STATE_SELECT_WITH_POLICY =
  "current_generation_id,status,symbol_count,policy_min_sessions,policy_excluded_count";
const STATE_SELECT_BASE = "current_generation_id,status,symbol_count";
const FEED_EVIDENCE_SELECT = "tab_evaluation_evidence";

function unavailableBaseline(status: NhlBaselineStatus = "unavailable"): {
  status: NhlBaselineStatus;
  quotes: Map<string, NhlBaselineQuote>;
  policyExclusions: PolicyExclusionEvidence;
} {
  return {
    status,
    quotes: new Map(),
    policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
  };
}

async function loadPolicyExclusions(
  sb: DbClient,
  generationId: string,
  policyMinSessions: unknown,
  policyExcludedCount: unknown,
): Promise<PolicyExclusionEvidence> {
  const declared = parseStatePolicyExclusionFields({
    policy_min_sessions: policyMinSessions,
    policy_excluded_count: policyExcludedCount,
  });
  if (!declared) return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;

  const rows: Array<Record<string, unknown>> = [];
  let from = 0;
  while (true) {
    const page = await sb
      .from("screener_52w_baseline_exclusions")
      .select(
        "generation_id,symbol,reason,sessions_observed,min_sessions",
      )
      .eq("generation_id", generationId)
      .range(from, from + BASELINE_PAGE - 1);
    if (page.error || !page.data) {
      return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
    }
    for (const item of page.data) {
      rows.push(item);
    }
    if (page.data.length < BASELINE_PAGE) break;
    from += BASELINE_PAGE;
  }

  return validatePolicyExclusionEvidence({
    generationId,
    policyMinSessions: declared.min_sessions,
    policyExcludedCount: declared.excluded_count,
    rows,
  });
}

async function loadCurrentTabEvaluationEvidence(
  sb: DbClient,
): Promise<TabEvaluationEvidenceMap | null> {
  try {
    const res = await sb
      .from("screener_feed_state")
      .select(FEED_EVIDENCE_SELECT)
      .eq("state_key", "current")
      .limit(1);
    if (res.error || !res.data || res.data.length === 0) return null;
    const raw = res.data[0].tab_evaluation_evidence;
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as TabEvaluationEvidenceMap;
  } catch {
    return null;
  }
}

async function loadNhlBaseline(sb: DbClient): Promise<{
  status: NhlBaselineStatus;
  quotes: Map<string, NhlBaselineQuote>;
  policyExclusions: PolicyExclusionEvidence;
}> {
  try {
    let stateRes = await sb
      .from("screener_52w_baseline_state")
      .select(STATE_SELECT_WITH_POLICY)
      .eq("state_key", "current")
      .limit(1);
    if (stateRes.error) {
      stateRes = await sb
        .from("screener_52w_baseline_state")
        .select(STATE_SELECT_BASE)
        .eq("state_key", "current")
        .limit(1);
    }
    if (stateRes.error || !stateRes.data || stateRes.data.length === 0) {
      return unavailableBaseline("initializing");
    }
    const row = stateRes.data[0];
    const status = row.status;
    const generationId = row.current_generation_id;
    if (status === "unavailable") {
      return unavailableBaseline("unavailable");
    }
    if (status === "empty") {
      return unavailableBaseline("initializing");
    }
    if (
      status !== "available" || typeof generationId !== "string" ||
      !generationId
    ) {
      return unavailableBaseline("initializing");
    }

    const declaredSymbolCount = Number(row.symbol_count);
    if (
      !Number.isInteger(declaredSymbolCount) || declaredSymbolCount <= 0
    ) {
      return unavailableBaseline("initializing");
    }

    const quotes = new Map<string, NhlBaselineQuote>();
    let loadedRowCount = 0;
    let from = 0;
    while (true) {
      const page = await sb
        .from("screener_52w_baselines")
        .select("symbol,high_52w,low_52w,sessions_observed")
        .eq("generation_id", generationId)
        .range(from, from + BASELINE_PAGE - 1);
      if (page.error || !page.data) {
        return unavailableBaseline("unavailable");
      }
      loadedRowCount += page.data.length;
      for (const item of page.data) {
        const candidate: NhlBaselineQuote = {
          symbol: typeof item.symbol === "string" ? item.symbol : "",
          high_52w: Number(item.high_52w),
          low_52w: Number(item.low_52w),
          sessions_observed: Number(item.sessions_observed),
        };
        if (!isValidBaselineQuote(candidate)) continue;
        const sym = candidate.symbol;
        quotes.set(sym, candidate);
      }
      if (page.data.length < BASELINE_PAGE) break;
      from += BASELINE_PAGE;
    }
    // Fail closed unless every declared baseline row loaded and passed validation.
    // replace_screener_52w_baseline_generation_v1 sets symbol_count = inserted rows
    // under CHECK constraints aligned with isValidBaselineQuote().
    if (
      loadedRowCount !== declaredSymbolCount ||
      quotes.size !== declaredSymbolCount
    ) {
      return unavailableBaseline("initializing");
    }

    // Exclusion evidence is independent of quote validity. Malformed or
    // missing evidence must not invalidate an otherwise valid baseline.
    const policyExclusions = await loadPolicyExclusions(
      sb,
      generationId,
      row.policy_min_sessions,
      row.policy_excluded_count,
    );
    return { status: "available", quotes, policyExclusions };
  } catch {
    return unavailableBaseline("unavailable");
  }
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
  const nowMs = (deps.nowMs ?? (() => Date.now()))();
  const dayTradeDiagnostics = allTickers.map((t) => evaluateDayTradeRadar(t, nowMs));
  console.log(`[sync-screener-data] ${formatRadarRejectionLog(summarizeRadarDiagnostics(dayTradeDiagnostics))}`);

  const sessionKind = resolveSyncSessionKind(nowMs);
  const extendedSession = isExtendedSyncSession(sessionKind);

  const dayTradeSelected = selectForTab("day_trade_radar", allTickers);
  const gapperSelected = selectForTab("gappers", allTickers, undefined, {
    extendedSession,
  });
  const volumeSpikeSelected = selectForTab("volume_spikes", allTickers);
  const providerGainersLosers = [...gainers, ...losers];
  const gainersLosersUniverse = providerGainersLosers.length > 0
    ? providerGainersLosers
    : extendedSession
    ? selectGainersLosersFromSnapshot(allTickers, allTickers.length)
    : [];
  const gainersLosersSelected = providerGainersLosers.length > 0
    ? selectForTab("gainers_losers", providerGainersLosers)
    : extendedSession
    ? selectGainersLosersFromSnapshot(allTickers)
    : [];
  const unusualSelected = selectForTab("unusual_volume", allTickers);

  const selectedAll = [
    ...dayTradeSelected,
    ...gapperSelected,
    ...volumeSpikeSelected,
    ...gainersLosersSelected,
    ...unusualSelected,
  ];

  const syncedAt = deps.nowIso();
  const syncRunId = (deps.newSyncRunId ?? (() => crypto.randomUUID()))();

  // Selected rows must carry verifiable Polygon observation timestamps.
  if (!allHaveProviderAsOf(selectedAll, nowMs)) {
    return json({ error: "provider_freshness_unavailable" }, 503);
  }

  // ── Database reads begin only after freshness evidence is verified ──────
  const sb = deps.createClient(supabaseUrl, serviceRole);
  const nhlBaseline = await loadNhlBaseline(sb);
  const nhlSelected = nhlBaseline.status === "available"
    ? selectNewHighsLows(allTickers, nhlBaseline.quotes)
    : [];
  const nhlTickers = nhlSelected.map((item) => item.ticker);
  if (!allHaveProviderAsOf(nhlTickers, nowMs)) {
    return json({ error: "provider_freshness_unavailable" }, 503);
  }

  const selectedSymbols = selectedSymbolUnion(
    dayTradeSelected,
    gapperSelected,
    volumeSpikeSelected,
    gainersLosersSelected,
    unusualSelected,
    nhlTickers,
  );

  const nameMap = await loadNameMapFromStocks(sb, selectedSymbols);
  const getName = (ticker: string) => nameMap[ticker] ?? ticker;

  const meta: GenerationMeta = { syncedAt, syncRunId, nowMs, extendedSession };

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
  const nhlRows = mapNewHighsLows(nhlSelected, getName, meta);

  const allRows = [
    ...dayTradeRows,
    ...gapperRows,
    ...volumeSpikeRows,
    ...gainersLosersRows,
    ...unusualVolumeRows,
    ...nhlRows,
  ];

  const tabEvaluationEvidence = buildTabEvaluationEvidence({
    universe: allTickers,
    dayTradeSelected,
    gapperSelected,
    volumeSpikeSelected,
    gainersLosersUniverse,
    gainersLosersSelected,
    unusualSelected,
    nhlBaselineStatus: nhlBaseline.status,
    nhlBaselines: nhlBaseline.quotes,
    nhlSelected,
    nhlPolicyExclusions: nhlBaseline.policyExclusions,
    extendedSession,
  });

  const priorEvidence = await loadCurrentTabEvaluationEvidence(sb);
  if (
    shouldPreservePriorScreenerGeneration({
      priorEvidence,
      nextEvidence: tabEvaluationEvidence,
    })
  ) {
    return json({
      ok: true,
      preserved: true,
      reason: "prior_generation_retained",
      sync_run_id: syncRunId,
      tickers_scanned: allTickers.length,
      session_kind: sessionKind,
      synced_at: syncedAt,
    });
  }

  const rpcBase = {
    p_rows: allRows,
    p_sync_run_id: syncRunId,
    p_synced_at: syncedAt,
    p_nhl_baseline_status: nhlBaseline.status,
  };
  let rpcResult = await sb.rpc(REPLACE_GENERATION_RPC, {
    ...rpcBase,
    p_tab_evaluation_evidence: tabEvaluationEvidence,
  });
  if (rpcResult.error) {
    const message = String(rpcResult.error.message ?? "").toLowerCase();
    const missingEvidenceRpc =
      message.includes("p_tab_evaluation_evidence") ||
      message.includes("could not find the function") ||
      message.includes("function public.replace_screener_results_generation_v1(");
    if (missingEvidenceRpc) {
      rpcResult = await sb.rpc(REPLACE_GENERATION_RPC, rpcBase);
    }
  }
  const { data: rowsInserted, error: rpcError } = rpcResult;
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
    nhl_baseline_status: nhlBaseline.status,
    tabs: {
      day_trade_radar: dayTradeRows.length,
      gappers: gapperRows.length,
      volume_spikes: volumeSpikeRows.length,
      gainers_losers: gainersLosersRows.length,
      unusual_volume: unusualVolumeRows.length,
      new_highs_lows: nhlRows.length,
    },
    provider_as_of_min: bounds.min,
    provider_as_of_max: bounds.max,
    synced_at: syncedAt,
  });
}
