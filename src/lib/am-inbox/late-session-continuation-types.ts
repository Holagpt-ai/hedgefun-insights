import type { LateSessionSourceCategory } from "@/config/late-session-handoff.config";
import type { ContinuationCategory } from "@/config/continuation.config";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import type { RadarRepeatMoverProfileFreshnessState } from "@/lib/radar/radar-repeat-movers-types";
import type { BehaviorProfileSampleQuality } from "@/config/behavior-profile.config";
import type { RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";
import type { SecurityId } from "@/types/security-identity";

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
  rvol: number | null;
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

export interface AmInboxLateSessionView {
  asOfSessionDate: string;
  candidates: readonly AmInboxLateSessionCandidate[];
  expiredCount: number;
}
