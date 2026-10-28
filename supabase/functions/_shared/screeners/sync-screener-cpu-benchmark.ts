/**
 * Representative synchronous CPU path for sync-screener-data (local wall-clock only).
 * Does NOT measure Supabase Edge billed CPU; use for regression deltas only.
 */

import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import {
  accumulateRadarDiagnostic,
  createEmptyRadarRejectionSummary,
} from "./diagnostics.ts";
import { buildTabEvaluationEvidence } from "./evaluation-evidence.ts";
import {
  attachRvol20dToRows,
  easternTradingDateFromMs,
  mapNewHighsLows,
  mapTabRows,
  type GenerationMeta,
  type ScreenerResultRow,
} from "./rows.ts";
import { selectNewHighsLows, type NhlBaselineQuote } from "./new-highs-lows.ts";
import {
  selectForTab,
  selectMainUniverseTabs,
  type PolygonTicker,
  type TabSelectionOpts,
} from "./selection.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import {
  createSessionVolumeCache,
  type SessionVolumeCacheBinding,
} from "./session-volume.ts";

export const REPRESENTATIVE_UNIVERSE_SIZE = 13_262;

export type SyncCpuStageTimings = {
  radar_diagnostics_ms: number;
  tab_selection_ms: number;
  nhl_selection_ms: number;
  row_mapping_ms: number;
  evidence_ms: number;
  rpc_payload_ms: number;
  total_sync_cpu_path_ms: number;
};

export type SyncCpuBenchmarkResult = {
  universe_size: number;
  session: "pre-market" | "regular" | "after-hours";
  optimized: SyncCpuStageTimings;
  legacy_multi_pass?: SyncCpuStageTimings;
  row_count: number;
  rpc_payload_bytes: number;
};

function etMs(isoDate: string, hour: number, minute: number): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour + 4, minute, 0, 0);
}

export function buildRepresentativeUniverse(
  size: number,
  session: "pre-market" | "regular" | "after-hours",
  serverNowMs: number,
): PolygonTicker[] {
  let obsOffsetMin: number;
  if (session === "pre-market") obsOffsetMin = -15;
  else if (session === "after-hours") obsOffsetMin = -15;
  else obsOffsetMin = -5;
  const obsMs = serverNowMs + obsOffsetMin * 60_000;

  const out: PolygonTicker[] = [];
  for (let i = 0; i < size; i++) {
    const sym = `T${String(i).padStart(5, "0")}`;
    const price = 10 + (i % 50) / 10;
    const dayV = session === "pre-market" ? 0 : 100_000 + (i % 10_000);
    const minAv = session === "pre-market"
      ? 100_000 + (i % 10_000)
      : session === "after-hours"
      ? dayV + 500 + (i % 100)
      : dayV + 1_000;
    out.push({
      ticker: sym,
      updated: obsMs * 1_000_000,
      day: {
        c: price,
        o: price - 0.1,
        v: dayV,
        h: price + 1,
        l: price - 1,
      },
      prevDay: { c: price - 0.5, v: 50_000 },
      min: { av: minAv, v: 1_000, t: obsMs },
      lastTrade: { p: price + (session === "pre-market" ? 0.5 : 0), t: obsMs },
    });
  }
  return out;
}

export function buildRepresentativeNhlBaselines(
  universe: PolygonTicker[],
  coverageEvery: number,
): Map<string, NhlBaselineQuote> {
  const map = new Map<string, NhlBaselineQuote>();
  for (let i = 0; i < universe.length; i += coverageEvery) {
    const t = universe[i];
    const sym = String(t.ticker);
    map.set(sym, {
      symbol: sym,
      high_52w: 200,
      low_52w: 5,
      sessions_observed: 200,
    });
  }
  return map;
}

function runStages(input: {
  universe: PolygonTicker[];
  gainersLosersUniverse: PolygonTicker[];
  extendedTabOpts: TabSelectionOpts;
  cacheBinding: SessionVolumeCacheBinding;
  nhlBaselines: Map<string, NhlBaselineQuote>;
  useOptimizedSelection: boolean;
  useCache: boolean;
}): { timings: SyncCpuStageTimings; rows: ScreenerResultRow[]; rpcBytes: number } {
  const sessionVolumeCache = input.useCache
    ? createSessionVolumeCache(input.cacheBinding)
    : undefined;
  const extendedTabOpts: TabSelectionOpts = {
    ...input.extendedTabOpts,
    sessionVolumeCache,
  };
  const syncSessionKind = resolveSyncSessionKind(input.cacheBinding.nowMs);

  let t0 = performance.now();
  const radarSummary = createEmptyRadarRejectionSummary();
  for (const t of input.universe) {
    accumulateRadarDiagnostic(radarSummary, t, input.cacheBinding.nowMs, {
      syncSessionKind,
    });
  }
  const radarMs = performance.now() - t0;

  t0 = performance.now();
  let dayTradeSelected: PolygonTicker[];
  let gapperSelected: PolygonTicker[];
  let volumeSpikeSelected: PolygonTicker[];
  let unusualSelected: PolygonTicker[];
  if (input.useOptimizedSelection) {
    const sel = selectMainUniverseTabs(input.universe, extendedTabOpts);
    dayTradeSelected = sel.day_trade_radar;
    gapperSelected = sel.gappers;
    volumeSpikeSelected = sel.volume_spikes;
    unusualSelected = sel.unusual_volume;
  } else {
    dayTradeSelected = selectForTab("day_trade_radar", input.universe);
    gapperSelected = selectForTab("gappers", input.universe, 20, extendedTabOpts);
    volumeSpikeSelected = selectForTab(
      "volume_spikes",
      input.universe,
      20,
      extendedTabOpts,
    );
    unusualSelected = selectForTab(
      "unusual_volume",
      input.universe,
      20,
      extendedTabOpts,
    );
  }
  const gainersLosersSelected = selectForTab(
    "gainers_losers",
    input.gainersLosersUniverse,
    20,
    extendedTabOpts,
  );
  const tabMs = performance.now() - t0;

  t0 = performance.now();
  const nhlSelected = selectNewHighsLows(
    input.universe,
    input.nhlBaselines,
    20,
    input.cacheBinding.extendedSession,
    input.cacheBinding.nowMs,
    input.cacheBinding.observationSessionVolume,
    sessionVolumeCache,
  );
  const nhlMs = performance.now() - t0;

  const meta: GenerationMeta = {
    syncedAt: new Date(input.cacheBinding.nowMs).toISOString(),
    syncRunId: "11111111-2222-3333-4444-555555555555",
    nowMs: input.cacheBinding.nowMs,
    extendedSession: input.cacheBinding.extendedSession,
    observationSessionFields: input.cacheBinding.observationSessionVolume,
    sessionVolumeCache,
  };
  const getName = (s: string) => s;

  t0 = performance.now();
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
    new Map(),
    easternTradingDateFromMs(input.cacheBinding.nowMs),
  );
  const rowMs = performance.now() - t0;

  t0 = performance.now();
  buildTabEvaluationEvidence({
    universe: input.universe,
    dayTradeSelected,
    gapperSelected,
    volumeSpikeSelected,
    gainersLosersUniverse: input.gainersLosersUniverse,
    gainersLosersSelected,
    unusualSelected,
    nhlBaselineStatus: "available",
    nhlBaselines: input.nhlBaselines,
    nhlSelected,
    nhlPolicyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
    extendedSession: input.cacheBinding.extendedSession,
    observationSessionFields: input.cacheBinding.observationSessionVolume,
    nowMs: input.cacheBinding.nowMs,
    sessionVolumeCache,
  });
  const evidenceMs = performance.now() - t0;

  t0 = performance.now();
  const rpcPayload = {
    p_rows: allRows,
    p_sync_run_id: meta.syncRunId,
    p_synced_at: meta.syncedAt,
    p_nhl_baseline_status: "available",
  };
  const rpcBytes = JSON.stringify(rpcPayload).length;
  const rpcMs = performance.now() - t0;

  void radarSummary;

  const total = radarMs + tabMs + nhlMs + rowMs + evidenceMs + rpcMs;
  return {
    timings: {
      radar_diagnostics_ms: radarMs,
      tab_selection_ms: tabMs,
      nhl_selection_ms: nhlMs,
      row_mapping_ms: rowMs,
      evidence_ms: evidenceMs,
      rpc_payload_ms: rpcMs,
      total_sync_cpu_path_ms: total,
    },
    rows: allRows,
    rpcBytes,
  };
}

export function runRepresentativeSyncCpuBenchmark(
  session: "pre-market" | "regular" | "after-hours",
): SyncCpuBenchmarkResult {
  const serverNowMs = session === "pre-market"
    ? etMs("2026-10-28", 9, 35)
    : session === "after-hours"
    ? etMs("2026-10-28", 16, 20)
    : etMs("2026-10-28", 16, 45);
  const universe = buildRepresentativeUniverse(
    REPRESENTATIVE_UNIVERSE_SIZE,
    session,
    serverNowMs,
  );
  const nhlBaselines = buildRepresentativeNhlBaselines(universe, 26);
  const gainersLosersUniverse = universe.slice(0, 800);
  const cacheBinding: SessionVolumeCacheBinding = {
    nowMs: serverNowMs,
    observationSessionVolume: true,
    extendedSession: session !== "regular",
  };
  const extendedTabOpts: TabSelectionOpts = {
    extendedSession: cacheBinding.extendedSession,
    observationSessionFields: true,
    nowMs: serverNowMs,
  };

  const legacy = runStages({
    universe,
    gainersLosersUniverse,
    extendedTabOpts,
    cacheBinding,
    nhlBaselines,
    useOptimizedSelection: false,
    useCache: false,
  });

  const optimized = runStages({
    universe,
    gainersLosersUniverse,
    extendedTabOpts,
    cacheBinding,
    nhlBaselines,
    useOptimizedSelection: true,
    useCache: true,
  });

  return {
    universe_size: universe.length,
    session,
    optimized: optimized.timings,
    legacy_multi_pass: legacy.timings,
    row_count: optimized.rows.length,
    rpc_payload_bytes: optimized.rpcBytes,
  };
}
