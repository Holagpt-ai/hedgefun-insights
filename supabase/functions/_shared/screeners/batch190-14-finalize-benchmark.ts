/**
 * Batch 190.14 staged finalize CPU path (local wall-clock; not Edge billed CPU).
 * Compares pre-190.14 finalize behavior vs this PR on the same 13,262-symbol fixture.
 */

import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import { buildTabEvaluationEvidenceFromChunkAccums } from "./evaluation-evidence-chunk.ts";
import { evaluateGenericTabEvidence } from "./evaluation-evidence.ts";
import { processUniverseChunk } from "./sync-chunk-processor.ts";
import {
  buildRepresentativeUniverse,
  REPRESENTATIVE_UNIVERSE_SIZE,
} from "./sync-screener-cpu-benchmark.ts";
import { isExtendedSyncSession, resolveSyncSessionKind } from "./session-sync-context.ts";
import {
  attachRvol20dToRows,
  easternTradingDateFromMs,
  mapTabRows,
  type GenerationMeta,
} from "./rows.ts";
import {
  finalizeMainUniverseSelections,
  selectGainersLosersFromUniverse,
  selectGainersLosersRanked,
  TAB_QUALIFIERS,
  type PolygonTicker,
  type TabSelectionOpts,
} from "./selection.ts";
import {
  createSessionVolumeCache,
  volumeContextFromOpts,
} from "./session-volume.ts";
import {
  emptyChunkArtifacts,
  mergeChunkArtifacts,
  type StagedChunkArtifacts,
} from "./sync-staging-types.ts";

export type Batch19014FinalizeTimings = {
  merge_selections_ms: number;
  gl_selection_ms: number;
  build_evidence_ms: number;
  rpc_payload_ms: number;
  total_finalize_cpu_path_ms: number;
};

export type Batch19014FinalizeBenchmarkResult = {
  session: "pre-market" | "regular" | "after-hours";
  universe_size: number;
  before_pr216: Batch19014FinalizeTimings;
  after_pr216: Batch19014FinalizeTimings;
};

function etMs(isoDate: string, hour: number, minute: number): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  // 2026-10-28 is EDT (UTC-4).
  return Date.UTC(y, m - 1, d, hour + 4, minute, 0, 0);
}

const FIXTURE_DATE = "2026-10-28";

/** Clock times are America/New_York. `market` is the regular-session kind. */
export const BATCH19014_SESSION_FIXTURES = [
  {
    session: "pre-market" as const,
    labelEt: "07:35",
    nowMs: etMs(FIXTURE_DATE, 7, 35),
    expectedSyncSessionKind: "pre-market" as const,
  },
  {
    session: "regular" as const,
    labelEt: "12:45",
    nowMs: etMs(FIXTURE_DATE, 12, 45),
    expectedSyncSessionKind: "market" as const,
  },
  {
    session: "after-hours" as const,
    labelEt: "16:20",
    nowMs: etMs(FIXTURE_DATE, 16, 20),
    expectedSyncSessionKind: "after-hours" as const,
  },
];

function sessionNowMs(session: "pre-market" | "regular" | "after-hours"): number {
  const fixture = BATCH19014_SESSION_FIXTURES.find((row) => row.session === session);
  if (!fixture) throw new Error(`missing fixture ${session}`);
  return fixture.nowMs;
}

/** Pre-190.14: redundant qualify buffer before rank. */
function selectGainersLosersLegacyQualifyLoop(
  universe: readonly PolygonTicker[],
  limit: number,
  opts?: TabSelectionOpts,
): { selected: PolygonTicker[]; qualifiedCount: number } {
  const qualify = TAB_QUALIFIERS.gainers_losers;
  const qualified: PolygonTicker[] = [];
  for (const t of universe) {
    if (qualify(t)) qualified.push(t);
  }
  return {
    selected: selectGainersLosersRanked(qualified, limit, opts),
    qualifiedCount: qualified.length,
  };
}

function buildMergedFromChunks(
  universe: PolygonTicker[],
  extendedTabOpts: TabSelectionOpts,
): StagedChunkArtifacts {
  const merged = emptyChunkArtifacts();
  const chunkSize = 2000;
  const syncSessionKind = resolveSyncSessionKind(extendedTabOpts.nowMs ?? Date.now());
  for (let i = 0; i < universe.length; i += chunkSize) {
    const slice = universe.slice(i, i + chunkSize);
    const chunk = processUniverseChunk(slice, {
      ...extendedTabOpts,
      syncSessionKind,
      coverage: {
        baselineSymbols: new Set<string>(),
        policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
      },
      nhlBaselines: new Map(),
      policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
    });
    mergeChunkArtifacts(merged, chunk);
  }
  return merged;
}

function runFinalizePath(
  session: "pre-market" | "regular" | "after-hours",
  use19014Fixes: boolean,
): Batch19014FinalizeTimings {
  const nowMs = sessionNowMs(session);
  const syncSessionKind = resolveSyncSessionKind(nowMs);
  const universe = buildRepresentativeUniverse(
    REPRESENTATIVE_UNIVERSE_SIZE,
    session,
    nowMs,
  );
  const extendedSession = isExtendedSyncSession(syncSessionKind);
  const sessionVolumeCache = createSessionVolumeCache({
    nowMs,
    observationSessionVolume: true,
    extendedSession,
  });
  const extendedTabOpts: TabSelectionOpts = {
    extendedSession,
    observationSessionFields: true,
    nowMs,
    sessionVolumeCache,
  };
  const merged = buildMergedFromChunks(universe, extendedTabOpts);
  const gainersLosersUniverse = universe;

  let t0 = performance.now();
  const mainTabSelections = finalizeMainUniverseSelections(
    merged.mainQualified,
    extendedTabOpts,
  );
  const mergeMs = performance.now() - t0;

  t0 = performance.now();
  const glPick = use19014Fixes
    ? selectGainersLosersFromUniverse(
      gainersLosersUniverse,
      20,
      extendedTabOpts,
    )
    : selectGainersLosersLegacyQualifyLoop(
      gainersLosersUniverse,
      20,
      extendedTabOpts,
    );
  const glMs = performance.now() - t0;

  t0 = performance.now();
  let evidence: ReturnType<typeof buildTabEvaluationEvidenceFromChunkAccums>;
  if (use19014Fixes) {
    evidence = buildTabEvaluationEvidenceFromChunkAccums({
      universe,
      gappersAccum: merged.gappersAccum,
      primaryAccum: merged.primaryAccum,
      nhlAccum: merged.nhlEvidenceAccum,
      nhlBaselineStatus: "available",
      nhlBaselines: new Map(),
      dayTradeSelected: mainTabSelections.day_trade_radar,
      gapperSelected: mainTabSelections.gappers,
      volumeSpikeSelected: mainTabSelections.volume_spikes,
      gainersLosersUniverse,
      gainersLosersSelected: glPick.selected,
      gainersLosersQualifiedCount: glPick.qualifiedCount,
      gainersLosersVolumeActiveCount: extendedSession
        ? merged.primaryAccum.volumeActive
        : undefined,
      unusualSelected: mainTabSelections.unusual_volume,
      nhlSelected: [],
      extendedSession,
      observationSessionFields: true,
      nowMs,
      sessionVolumeCache,
    });
  } else {
    evaluateGenericTabEvidence(
      "gainers_losers",
      gainersLosersUniverse,
      glPick.selected,
      {
        extendedSession,
        observationSessionFields: true,
        nowMs,
        sessionVolumeCache,
      },
    );
    evidence = buildTabEvaluationEvidenceFromChunkAccums({
      universe,
      gappersAccum: merged.gappersAccum,
      primaryAccum: merged.primaryAccum,
      nhlAccum: merged.nhlEvidenceAccum,
      nhlBaselineStatus: "available",
      nhlBaselines: new Map(),
      dayTradeSelected: mainTabSelections.day_trade_radar,
      gapperSelected: mainTabSelections.gappers,
      volumeSpikeSelected: mainTabSelections.volume_spikes,
      gainersLosersUniverse,
      gainersLosersSelected: glPick.selected,
      unusualSelected: mainTabSelections.unusual_volume,
      nhlSelected: [],
      extendedSession,
      observationSessionFields: true,
      nowMs,
      sessionVolumeCache,
    });
  }
  const evidenceMs = performance.now() - t0;

  const meta: GenerationMeta = {
    syncedAt: new Date(nowMs).toISOString(),
    syncRunId: "11111111-2222-3333-4444-555555555555",
    nowMs,
    extendedSession,
    observationSessionFields: true,
    sessionVolumeCache,
  };
  const getName = (symbol: string) => symbol;
  let publishedRows = [
    ...mapTabRows("day_trade_radar", mainTabSelections.day_trade_radar, getName, meta),
    ...mapTabRows("gappers", mainTabSelections.gappers, getName, meta),
    ...mapTabRows("volume_spikes", mainTabSelections.volume_spikes, getName, meta),
    ...mapTabRows("gainers_losers", glPick.selected, getName, meta),
    ...mapTabRows("unusual_volume", mainTabSelections.unusual_volume, getName, meta),
  ];
  publishedRows = attachRvol20dToRows(
    publishedRows,
    new Map(),
    easternTradingDateFromMs(nowMs),
  );

  t0 = performance.now();
  const rpcBytes = JSON.stringify({
    p_rows: publishedRows,
    p_sync_run_id: meta.syncRunId,
    p_synced_at: meta.syncedAt,
    p_nhl_baseline_status: "available",
    p_tab_evaluation_evidence: evidence,
  }).length;
  const rpcMs = performance.now() - t0;
  if (rpcBytes < 1) throw new Error("rpc payload empty");

  void mainTabSelections;

  return {
    merge_selections_ms: mergeMs,
    gl_selection_ms: glMs,
    build_evidence_ms: evidenceMs,
    rpc_payload_ms: rpcMs,
    total_finalize_cpu_path_ms: mergeMs + glMs + evidenceMs + rpcMs,
  };
}

export function runBatch19014StagedFinalizeBenchmark(
  session: "pre-market" | "regular" | "after-hours",
): Batch19014FinalizeBenchmarkResult {
  return {
    session,
    universe_size: REPRESENTATIVE_UNIVERSE_SIZE,
    before_pr216: runFinalizePath(session, false),
    after_pr216: runFinalizePath(session, true),
  };
}
