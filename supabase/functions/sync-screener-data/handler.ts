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
import { isLiveSurveillanceSessionKind } from "../_shared/screeners/screener-session.ts";
import {
  allHaveProviderAsOf,
  normalizeSymbol,
  type PolygonTicker,
  selectForTab,
  selectMainUniverseTabs,
} from "../_shared/screeners/selection.ts";
import {
  accumulateRadarDiagnostic,
  createEmptyRadarRejectionSummary,
  formatRadarRejectionLog,
} from "../_shared/screeners/diagnostics.ts";
import { createSessionVolumeCache } from "../_shared/screeners/session-volume.ts";
import {
  attachRvol20dToRows,
  easternTradingDateFromMs,
  type GenerationMeta,
  mapNewHighsLows,
  mapTabRows,
  type ScreenerResultRow,
} from "../_shared/screeners/rows.ts";
import { loadVolumeBaselines } from "../_shared/screeners/load-volume-baselines.ts";
import { loadRadarPreviousCloseOverlay } from "../_shared/screeners/load-radar-previous-close-overlay.ts";
import { overlayVerifiedPreviousCloseOnUniverse } from "../_shared/screeners/normalized-market-snapshot.ts";
import type { VolumeBaselineQuote } from "../_shared/screeners/volume-baseline.ts";
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
import { captureDayTradeQualificationFromSync } from "../_shared/day-trade/capture-from-sync.ts";
import type { QualificationDb } from "../_shared/day-trade/persist-qualification-lifecycle.ts";

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
  then: <R1 = DbSelectResult, R2 = never>(
    onfulfilled?: ((value: DbSelectResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ) => Promise<R1 | R2>;
};

export type DbUpdateResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

export type DbUpdateQuery = {
  eq: (col: string, value: string) => DbUpdateQuery;
  select: (cols: string) => DbUpdateQuery;
  then: <R1 = DbUpdateResult, R2 = never>(
    onfulfilled?: ((value: DbUpdateResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ) => Promise<R1 | R2>;
};

export type DbClient = {
  from: (table: string) => {
    select: (cols: string) => DbQuery;
    update: (values: Record<string, unknown>) => DbUpdateQuery;
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

async function loadCurrentFeedGenerationRow(
  sb: DbClient,
  columns: string,
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  try {
    const res = await sb
      .from("screener_feed_state")
      .select(columns)
      .eq("state_key", "current")
      .limit(1);
    if (res.error || !res.data || res.data.length === 0) {
      return { data: null, error: res.error ?? { message: "missing_feed_state" } };
    }
    return { data: res.data[0], error: null };
  } catch {
    return { data: null, error: { message: "feed_state_query_failed" } };
  }
}

export type TabEvaluationEvidencePersistenceResult =
  | { mode: "atomic_rpc" }
  | { mode: "legacy_patch"; persisted: true }
  | { mode: "legacy_patch"; persisted: false; reason: string };

/** After 4-arg RPC only — never overwrites a newer generation. */
export async function persistTabEvaluationEvidenceAfterLegacyRpc(
  sb: DbClient,
  input: {
    syncRunId: string;
    expectedRowsInserted: number;
    tabEvaluationEvidence: TabEvaluationEvidenceMap;
  },
): Promise<TabEvaluationEvidencePersistenceResult> {
  const rowRes = await loadCurrentFeedGenerationRow(
    sb,
    "sync_run_id,rows_inserted",
  );
  const row = rowRes.data;
  if (!row) {
    return {
      mode: "legacy_patch",
      persisted: false,
      reason: "no_matching_generation",
    };
  }
  const feedSyncRunId = typeof row.sync_run_id === "string" ? row.sync_run_id : null;
  const feedRowsInserted = typeof row.rows_inserted === "number"
    ? row.rows_inserted
    : null;
  if (!feedSyncRunId || feedSyncRunId !== input.syncRunId) {
    return {
      mode: "legacy_patch",
      persisted: false,
      reason: "generation_sync_run_mismatch",
    };
  }
  if (
    feedRowsInserted === null ||
    !Number.isInteger(feedRowsInserted) ||
    feedRowsInserted !== input.expectedRowsInserted
  ) {
    return {
      mode: "legacy_patch",
      persisted: false,
      reason: "generation_row_count_mismatch",
    };
  }

  const patch = await sb
    .from("screener_feed_state")
    .update({ tab_evaluation_evidence: input.tabEvaluationEvidence })
    .eq("state_key", "current")
    .eq("sync_run_id", input.syncRunId)
    .eq("rows_inserted", String(input.expectedRowsInserted))
    .select("sync_run_id,rows_inserted");
  if (patch.error) {
    const patchMsg = String(patch.error.message ?? "").toLowerCase();
    if (patchMsg.includes("tab_evaluation_evidence")) {
      return {
        mode: "legacy_patch",
        persisted: false,
        reason: "evidence_column_unavailable",
      };
    }
    return {
      mode: "legacy_patch",
      persisted: false,
      reason: patch.error.message,
    };
  }
  const patched = patch.data ?? [];
  if (patched.length !== 1) {
    return {
      mode: "legacy_patch",
      persisted: false,
      reason: "patch_no_matching_row",
    };
  }
  const patchedRow = patched[0];
  const patchedRunId = typeof patchedRow.sync_run_id === "string"
    ? patchedRow.sync_run_id
    : null;
  const patchedRowsInserted = typeof patchedRow.rows_inserted === "number"
    ? patchedRow.rows_inserted
    : null;
  if (
    patchedRunId !== input.syncRunId ||
    patchedRowsInserted !== input.expectedRowsInserted
  ) {
    return {
      mode: "legacy_patch",
      persisted: false,
      reason: "patch_return_mismatch",
    };
  }
  return { mode: "legacy_patch", persisted: true };
}

async function loadCurrentFeedEvidenceContext(
  sb: DbClient,
): Promise<{
  evidence: TabEvaluationEvidenceMap | null;
  syncedAt: string | null;
}> {
  try {
    const rowRes = await loadCurrentFeedGenerationRow(
      sb,
      `${FEED_EVIDENCE_SELECT},synced_at`,
    );
    if (rowRes.error || !rowRes.data) {
      return { evidence: null, syncedAt: null };
    }
    const row = rowRes.data;
    const syncedAt = typeof row.synced_at === "string" ? row.synced_at : null;
    const raw = row.tab_evaluation_evidence;
    if (raw === null || raw === undefined) {
      return { evidence: null, syncedAt };
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
      return { evidence: null, syncedAt };
    }
    return { evidence: raw as TabEvaluationEvidenceMap, syncedAt };
  } catch {
    return { evidence: null, syncedAt: null };
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
    // Fail closed if pagination did not return every declared row. Individual
    // symbols that fail isValidBaselineQuote (e.g. mixed split-adjustment
    // extrema) are omitted so NHL stays honest for the rest of the universe.
    if (loadedRowCount !== declaredSymbolCount) {
      return unavailableBaseline("initializing");
    }
    if (quotes.size === 0) {
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
  const sessionKind = resolveSyncSessionKind(nowMs);
  const extendedSession = isExtendedSyncSession(sessionKind);
  const observationSessionFields = isLiveSurveillanceSessionKind(sessionKind);

  if (observationSessionFields) {
    const sbEarly = deps.createClient(supabaseUrl, serviceRole);
    const previousCloseOverlay = await loadRadarPreviousCloseOverlay(sbEarly);
    if (previousCloseOverlay.size > 0) {
      allTickers = overlayVerifiedPreviousCloseOnUniverse(allTickers, previousCloseOverlay);
    }
  }

  const sessionVolumeCache = createSessionVolumeCache({
    nowMs,
    observationSessionVolume: observationSessionFields,
    extendedSession,
  });
  const radarSummary = createEmptyRadarRejectionSummary();
  for (const t of allTickers) {
    accumulateRadarDiagnostic(radarSummary, t, nowMs, {
      syncSessionKind: sessionKind,
    });
  }
  console.log(`[sync-screener-data] ${formatRadarRejectionLog(radarSummary)}`);

  const extendedTabOpts = {
    extendedSession,
    observationSessionFields,
    nowMs,
    sessionVolumeCache,
  };
  const mainTabSelections = selectMainUniverseTabs(
    allTickers,
    extendedTabOpts,
  );
  const dayTradeSelected = mainTabSelections.day_trade_radar;
  const gapperSelected = mainTabSelections.gappers;
  const volumeSpikeSelected = mainTabSelections.volume_spikes;
  const unusualSelected = mainTabSelections.unusual_volume;
  const providerGainersLosers = [...gainers, ...losers];
  const gainersLosersUniverse = providerGainersLosers.length > 0
    ? providerGainersLosers
    : allTickers;
  const gainersLosersSelected = selectForTab(
    "gainers_losers",
    gainersLosersUniverse,
    undefined,
    extendedTabOpts,
  );

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
  const [nhlBaseline, volumeBaselines] = await Promise.all([
    loadNhlBaseline(sb),
    loadVolumeBaselines(sb),
  ]);
  const nhlSelected = nhlBaseline.status === "available"
    ? selectNewHighsLows(
      allTickers,
      nhlBaseline.quotes,
      undefined,
      extendedSession,
      nowMs,
      observationSessionFields,
      sessionVolumeCache,
    )
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

  const meta: GenerationMeta = {
    syncedAt,
    syncRunId,
    nowMs,
    extendedSession,
    observationSessionFields,
    sessionVolumeCache,
  };

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

  let allRows = [
    ...dayTradeRows,
    ...gapperRows,
    ...volumeSpikeRows,
    ...gainersLosersRows,
    ...unusualVolumeRows,
    ...nhlRows,
  ];

  allRows = attachRvol20dToRows(
    allRows,
    volumeBaselines,
    easternTradingDateFromMs(nowMs),
  );

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
    observationSessionFields,
    nowMs,
    sessionVolumeCache,
  });

  const nhlEvidence = tabEvaluationEvidence.new_highs_lows;
  if (
    nhlEvidence &&
    nhlEvidence.status === "not_evaluated" &&
    typeof nhlEvidence.unresolved_count === "number" &&
    nhlEvidence.unresolved_count > 0
  ) {
    console.log(
      `[sync-screener-data] nhl_unresolved count=${nhlEvidence.unresolved_count}` +
        (nhlEvidence.unresolved_symbols?.length
          ? ` sample=${JSON.stringify(nhlEvidence.unresolved_symbols)}`
          : ""),
    );
  }

  const priorFeed = await loadCurrentFeedEvidenceContext(sb);
  if (
    shouldPreservePriorScreenerGeneration({
      priorEvidence: priorFeed.evidence,
      nextEvidence: tabEvaluationEvidence,
      nowMs,
      priorSyncedAt: priorFeed.syncedAt,
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
  let evidencePersistence: TabEvaluationEvidencePersistenceResult = {
    mode: "atomic_rpc",
  };
  let legacyEvidenceRpcFallback = false;
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
      legacyEvidenceRpcFallback = !rpcResult.error;
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

  if (legacyEvidenceRpcFallback) {
    evidencePersistence = await persistTabEvaluationEvidenceAfterLegacyRpc(sb, {
      syncRunId,
      expectedRowsInserted: rowsInserted,
      tabEvaluationEvidence,
    });
    if (
      evidencePersistence.mode === "legacy_patch" &&
      !evidencePersistence.persisted
    ) {
      console.error(
        `[sync-screener-data] evidence legacy patch failed: ${evidencePersistence.reason}`,
      );
    }
  }

  const bounds = providerAsOfBounds(allRows);

  try {
    const sessionDate = easternTradingDateFromMs(nowMs);
    await captureDayTradeQualificationFromSync({
      db: sb as unknown as QualificationDb,
      sessionDate,
      syncRunId,
      dayTradeSymbols: dayTradeSelected.map((t) => String(t.ticker ?? "")),
      allTickers,
      volumeBaselines,
    });
  } catch {
    console.log("[sync-screener-data] day_trade_qualification_lifecycle_capture_failed");
  }

  return json({
    ok: true,
    sync_run_id: syncRunId,
    tickers_scanned: allTickers.length,
    rows_inserted: rowsInserted,
    tab_evaluation_evidence_persistence: evidencePersistence,
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
