import type { BehaviorProfileSampleQuality } from "@/config/behavior-profile.config";
import type { RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";
import type { RadarRepeatMoverProfileFreshnessState } from "@/lib/radar/radar-repeat-movers-types";
import type { SecurityId } from "@/types/security-identity";

export const HISTORICAL_WORKFLOW_SOURCES = [
  "radar",
  "repeat_movers",
  "watchlist",
  "action_center",
  "journal",
  "inbox",
  "ai_analyst",
  "unknown",
] as const;

export type HistoricalWorkflowSource = (typeof HISTORICAL_WORKFLOW_SOURCES)[number];

/** Compact cross-surface handoff — not a prediction or score payload. */
export interface HistoricalWorkflowContext {
  securityId: SecurityId | null;
  symbol: string;
  historicalContextAvailable: boolean;
  evidenceLabels: readonly RepeatMoverEvidenceLabel[];
  sampleSizeQuality: BehaviorProfileSampleQuality | null;
  comparableEpisodeCount: number;
  mostRecentComparableDate: string | null;
  profileFreshness: RadarRepeatMoverProfileFreshnessState;
  sourceSurface: HistoricalWorkflowSource;
  handoffAt: string;
  /** RepeatMoverContext.assembledAt when loaded; used for freshness/dedupe. */
  contextAssembledAt: string | null;
}

export interface ResolvedWorkflowHistoricalContext {
  workflow: HistoricalWorkflowContext;
  /** Full same-security context when available (for AI reuse). */
  repeatMoverContextLoaded: boolean;
}
