/**
 * Process one bounded universe slice for staged sync-screener-data execution.
 */

import {
  accumulateRadarDiagnostic,
  createEmptyRadarRejectionSummary,
} from "./diagnostics.ts";
import {
  accumulateGappersEvidenceChunk,
  accumulateNhlEvidenceChunk,
  accumulatePrimaryQualifiedChunk,
  createEmptyGappersEvidenceAccum,
  createEmptyNhlEvidenceAccum,
  createEmptyPrimaryQualifiedAccum,
} from "./evaluation-evidence-chunk.ts";
import type { HistoricalCoverageEvidence } from "./evaluation-evidence.ts";
import type { PolicyExclusionEvidence } from "./baseline-coverage.ts";
import {
  collectNhlCandidates,
  type NhlBaselineQuote,
} from "./new-highs-lows.ts";
import {
  collectMainUniverseQualified,
  type PolygonTicker,
  type TabSelectionOpts,
} from "./selection.ts";
import {
  emptyChunkArtifacts,
  mergeChunkArtifacts,
  type StagedChunkArtifacts,
} from "./sync-staging-types.ts";
import { volumeContextFromOpts } from "./session-volume.ts";

export function processUniverseChunk(
  slice: readonly PolygonTicker[],
  opts: TabSelectionOpts & {
    syncSessionKind: import("./session-sync-context.ts").SyncSessionKind;
    coverage: HistoricalCoverageEvidence;
    nhlBaselines: ReadonlyMap<string, NhlBaselineQuote>;
    policyExclusions: PolicyExclusionEvidence;
  },
): StagedChunkArtifacts {
  const out = emptyChunkArtifacts();
  const nowMs = opts.nowMs ?? Date.now();
  for (const t of slice) {
    accumulateRadarDiagnostic(out.radar, t, nowMs, {
      syncSessionKind: opts.syncSessionKind,
    });
  }
  out.mainQualified = collectMainUniverseQualified([...slice], opts);
  const volumeCtx = volumeContextFromOpts(opts);
  accumulatePrimaryQualifiedChunk(out.primaryAccum, slice, volumeCtx);
  accumulateGappersEvidenceChunk(
    out.gappersAccum,
    slice,
    opts.coverage,
    opts.extendedSession ?? false,
    nowMs,
    opts.observationSessionFields ?? false,
    opts.sessionVolumeCache,
  );
  accumulateNhlEvidenceChunk(
    out.nhlEvidenceAccum,
    slice,
    opts.nhlBaselines,
    opts.policyExclusions,
    opts.extendedSession ?? false,
    nowMs,
    opts.observationSessionFields ?? false,
    opts.sessionVolumeCache,
  );
  out.nhlCandidates = collectNhlCandidates(
    [...slice],
    opts.nhlBaselines,
    opts.extendedSession ?? false,
    nowMs,
    opts.observationSessionFields ?? false,
    opts.sessionVolumeCache,
  );
  return out;
}

export function foldChunkIntoMerged(
  merged: StagedChunkArtifacts,
  chunk: StagedChunkArtifacts,
): void {
  mergeChunkArtifacts(merged, chunk);
}
