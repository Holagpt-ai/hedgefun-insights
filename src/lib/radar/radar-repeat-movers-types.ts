import type {
  RadarRepeatMoverFilterId,
  RadarRepeatMoverPresentationSortKey,
  RadarRepeatMoversVersion,
} from "@/config/radar-repeat-movers.config";
import type { BehaviorProfileSampleQuality } from "@/config/behavior-profile.config";
import type { RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

export type RadarHistoricalAvailabilityState = "UNAVAILABLE" | "LIMITED" | "AVAILABLE";

export type RadarRepeatMoverEvidenceStrength = "STRONG" | "LIMITED" | "INSUFFICIENT";

export type RadarRepeatMoverProfileFreshnessState = "FRESH" | "STALE" | "UNKNOWN";

export interface RadarRepeatMoverWorkflowHandoffs {
  aiAnalyst: string;
  catalyst: string;
  watchlist: string;
  journal: string;
  actionCenter: string;
}

/** Deterministic display strings for UI — not marketing or predictive copy. */
export interface RadarRepeatMoverDisplayFacts {
  similarPriorMovesLabel: string | null;
  historicalEpisodesLabel: string | null;
  sampleQualityLabel: string | null;
  mostRecentComparableLabel: string | null;
  sessionsObservedLabel: string | null;
  lines: readonly string[];
}

export interface RadarRepeatMoverProfileCoverage {
  historyStartDate: string | null;
  historyEndDate: string | null;
  sessionsObserved: number | null;
  sourceDailyRowCount: number | null;
  sourceEpisodeCount: number | null;
}

export interface RadarRepeatMoverQualification {
  qualifies: boolean;
  reasons: readonly string[];
  evidenceStrength: RadarRepeatMoverEvidenceStrength;
}

/**
 * First-class Repeat Movers state for an active Radar candidate.
 * Preserves Discovery rank; does not introduce a historical score.
 */
export interface RadarRepeatMoverCandidate {
  discoveryRank: number;
  symbol: string;
  securityId: SecurityId | null;
  currentMovePct: number | null;
  volume: number | null;
  rvol: number | null;
  dollarVolume: number | null;
  lifecycle: string | null;
  signalStatus: string | null;
  historicalContext: RepeatMoverContext | null;
  evidenceLabels: readonly RepeatMoverEvidenceLabel[];
  sampleSizeQuality: BehaviorProfileSampleQuality | null;
  comparableEpisodeCount: number;
  mostRecentComparableDate: string | null;
  profileFreshness: RadarRepeatMoverProfileFreshnessState;
  profileCoverage: RadarRepeatMoverProfileCoverage;
  historicalAvailability: RadarHistoricalAvailabilityState;
  qualification: RadarRepeatMoverQualification;
  displayFacts: RadarRepeatMoverDisplayFacts;
  workflowHandoffs: RadarRepeatMoverWorkflowHandoffs;
  profileComputedAt: string | null;
  latestSourceHistoryDate: string | null;
}

export interface RadarRepeatMoversViewSummary {
  totalRadarRows: number;
  repeatMoverCount: number;
  unavailableHistoryCount: number;
  limitedHistoryCount: number;
  freshProfileCount: number;
  staleProfileCount: number;
}

export interface RadarRepeatMoversView {
  version: RadarRepeatMoversVersion;
  generatedAt: string;
  filtersAvailable: readonly RadarRepeatMoverFilterId[];
  presentationSortKeysAvailable: readonly RadarRepeatMoverPresentationSortKey[];
  summary: RadarRepeatMoversViewSummary;
  /** Qualified Repeat Movers in Discovery rank order (canonical). */
  repeatMovers: readonly RadarRepeatMoverCandidate[];
  /** All active Radar rows mapped to Repeat Mover shape (qualified or not). */
  candidates: readonly RadarRepeatMoverCandidate[];
}
