import type { LateSessionSourceCategory } from "@/config/late-session-handoff.config";
import type { ContinuationCategory } from "@/config/continuation.config";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import type { RadarRepeatMoverProfileFreshnessState } from "@/lib/radar/radar-repeat-movers-types";
import type { BehaviorProfileSampleQuality } from "@/config/behavior-profile.config";
import type { RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";
import type { SecurityId } from "@/types/security-identity";

export type ContinuationRvolMetricKind = "rvol_20d" | "time_adjusted" | "rvol_5m";

export type LateSessionHandoffExpiryState = "active" | "expired";

export interface LateSessionContinuationContext {
  securityId: SecurityId | null;
  symbol: string;
  sourceSessionDate: string;
  sourceTimestamp: string;
  sourceCategory: LateSessionSourceCategory;
  lastPrice: number | null;
  sessionMovePct: number | null;
  volume: number | null;
  /** Raw RVOL ratio at capture (typically rvol_20d from screener/Radar). */
  rvol: number | null;
  /** Metric kind for `rvol` when baseline metadata is present. */
  rvolMetricKind?: ContinuationRvolMetricKind | null;
  /** Historical/reference volume baseline for `rvol`, never current session volume. */
  rvolBaselineVolume?: number | null;
  rvolBaselineSampleSize?: number | null;
  dollarVolume: number | null;
  closeDistanceFromHodPct: number | null;
  afterHoursExtends: boolean | null;
  catalystPresent: boolean | null;
  floatTurnover: number | null;
  historicalContextAvailable: boolean;
  evidenceLabels: readonly RepeatMoverEvidenceLabel[];
  sampleSizeQuality: BehaviorProfileSampleQuality | null;
  comparableEpisodeCount: number;
  mostRecentComparableDate: string | null;
  profileFreshness: RadarRepeatMoverProfileFreshnessState;
  /** First AM session date when this handoff may appear. */
  validFromSessionDate: string;
  /** Last AM session date (inclusive) when this handoff remains visible. */
  validThroughSessionDate: string;
  expiryState: LateSessionHandoffExpiryState;
}

export interface StoredLateSessionHandoff {
  context: LateSessionContinuationContext;
  storedAt: string;
}

/** AM Inbox row model — data for existing renderers; not a ranking score. */
export interface AmInboxLateSessionCandidate {
  context: LateSessionContinuationContext;
  workflow: HistoricalWorkflowContext | null;
  /** Preserved continuation categories from source evaluation (deterministic). */
  sourceCategories: readonly ContinuationCategory[];
}

export interface LateSessionContinuationFunnel {
  detectedCount: number;
  qualifiedCount: number;
  priorityCount: number;
  displayedCount: number;
  /** True when default list shows ranked qualified names because no priority band matched. */
  displayUsesQualifiedFallback: boolean;
}

export interface AmInboxLateSessionView {
  asOfSessionDate: string;
  /** Default Late-Session module rows (priority band, or volume-ranked qualified fallback). */
  candidates: readonly AmInboxLateSessionCandidate[];
  /** Full qualified pool (priority first, then qualified non-priority) for View All. */
  qualifiedCandidates: readonly AmInboxLateSessionCandidate[];
  expiredCount: number;
  funnel: LateSessionContinuationFunnel;
}
