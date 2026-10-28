import { mergeRadarRejectionSummaries, type RadarRejectionSummary } from "./diagnostics.ts";
import {
  mergeGappersEvidenceAccums,
  mergeNhlEvidenceAccums,
  mergePrimaryQualifiedAccums,
  type GappersEvidenceAccum,
  type NhlEvidenceAccum,
  type PrimaryQualifiedAccum,
} from "./evaluation-evidence-chunk.ts";
import { mergeNhlCandidateMaps, type NhlCandidateRow } from "./new-highs-lows.ts";
import {
  mergeMainUniverseQualified,
  type MainUniverseQualified,
  type PolygonTicker,
} from "./selection.ts";
import type { SyncSessionKind } from "./session-sync-context.ts";

export const SCREENER_SYNC_CHUNK_SIZE = 2_200;
export const SCREENER_SYNC_LEASE_MS = 12 * 60_000;
export const SCREENER_SYNC_JOB_TTL_MS = 25 * 60_000;

export type StagedGenerationStatus =
  | "chunking"
  | "finalizing"
  | "published"
  | "failed"
  | "aborted";

export type StagedObservationContext = {
  nowMs: number;
  sessionKind: SyncSessionKind;
  extendedSession: boolean;
  observationSessionFields: boolean;
  syncedAt: string;
  syncRunId: string;
};

export type StagedChunkArtifacts = {
  radar: RadarRejectionSummary;
  mainQualified: MainUniverseQualified;
  gappersAccum: GappersEvidenceAccum;
  primaryAccum: PrimaryQualifiedAccum;
  nhlEvidenceAccum: NhlEvidenceAccum;
  nhlCandidates: Map<string, NhlCandidateRow>;
};

export type StagedGenerationJob = {
  id: string;
  status: StagedGenerationStatus;
  observation: StagedObservationContext;
  allTickers: PolygonTicker[];
  gainers: PolygonTicker[];
  losers: PolygonTicker[];
  chunkSize: number;
  nextChunkIndex: number;
  totalChunks: number;
  merged: StagedChunkArtifacts;
  leaseToken: string | null;
  leaseExpiresMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  nhlBaselineLoaded: boolean;
};

export type StagedSyncRequest =
  | { action: "cron" }
  | { action: "continue"; generation_id: string }
  | { action: "finalize"; generation_id: string };

export function emptyChunkArtifacts(): StagedChunkArtifacts {
  return {
    radar: {
      evaluated: 0,
      qualified: 0,
      rejected: 0,
      counts: {
        missing_invalid_snapshot: 0,
        price_range_failure: 0,
        minimum_volume_failure: 0,
        percentage_move_failure: 0,
        volume_ratio_failure: 0,
      },
    },
    mainQualified: {
      day_trade_radar: [],
      gappers: [],
      volume_spikes: [],
      unusual_volume: [],
    },
    gappersAccum: {
      volume_positive_count: 0,
      gap_calculable_count: 0,
      no_prior_session_count: 0,
      unresolved_gap_input_count: 0,
      qualified_count: 0,
    },
    primaryAccum: { dayTrade: 0, volumeSpikes: 0, unusual: 0, volumeActive: 0 },
    nhlEvidenceAccum: {
      eligible_count: 0,
      evaluated_count: 0,
      policy_excluded_count: 0,
      no_history_count: 0,
      unresolved_count: 0,
      qualified_count: 0,
      unresolvedSymbols: [],
      noHistorySymbols: [],
    },
    nhlCandidates: new Map(),
  };
}

export function mergeChunkArtifacts(
  into: StagedChunkArtifacts,
  chunk: StagedChunkArtifacts,
): void {
  into.radar = mergeRadarRejectionSummaries(into.radar, chunk.radar);
  into.mainQualified = mergeMainUniverseQualified(
    into.mainQualified,
    chunk.mainQualified,
  );
  into.gappersAccum = mergeGappersEvidenceAccums(
    into.gappersAccum,
    chunk.gappersAccum,
  );
  into.primaryAccum = mergePrimaryQualifiedAccums(
    into.primaryAccum,
    chunk.primaryAccum,
  );
  into.nhlEvidenceAccum = mergeNhlEvidenceAccums(
    into.nhlEvidenceAccum,
    chunk.nhlEvidenceAccum,
  );
  into.nhlCandidates = mergeNhlCandidateMaps(
    into.nhlCandidates,
    chunk.nhlCandidates,
  );
}
