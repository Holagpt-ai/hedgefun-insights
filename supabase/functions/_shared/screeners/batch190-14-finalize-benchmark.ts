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
import { resolveSyncSessionKind } from "./session-sync-context.ts";
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
  return Date.UTC(y, m - 1, d, hour + 4, minute, 0, 0);
}

function sessionNowMs(session: "pre-market" | "regular" | "after-hours"): number {
  return session === "pre-market"
    ? etMs("2026-10-28", 9, 35)
    : session === "after-hours"
    ? etMs("2026-10-28", 16, 20)
    : etMs("2026-10-28", 16, 45);
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
  const universe = buildRepresentativeUniverse(
    REPRESENTATIVE_UNIVERSE_SIZE,
    session,
    nowMs,
  );
  const extendedSession = session !== "regular";
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
  if (use19014Fixes) {
    buildTabEvaluationEvidenceFromChunkAccums({
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
    buildTabEvaluationEvidenceFromChunkAccums({
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

  t0 = performance.now();
  void JSON.stringify({
    p_rows: [],
    p_sync_run_id: "11111111-2222-3333-4444-555555555555",
    p_synced_at: new Date(nowMs).toISOString(),
    p_nhl_baseline_status: "available",
    p_tab_evaluation_evidence: {},
  }).length;
  const rpcMs = performance.now() - t0;

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
