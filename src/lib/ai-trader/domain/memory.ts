import type { ContextSnapshotId, EpisodeId, ObservationId, TradeId } from "@/lib/ai-trader/domain/ids";
import type { AiTraderInstrument } from "@/lib/ai-trader/domain/instrument";

export const MEMORY_KINDS = ["OBSERVATION", "LEARNED_BELIEF"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const EPISODE_TYPES = [
  "TRADE",
  "PASS",
  "WAIT",
  "RISK_REJECTION",
  "WATCHLIST_PROMOTION",
  "WATCHLIST_REMOVAL",
  "MISSED_OPPORTUNITY",
  "EXECUTION_EVENT",
  "MARKET_REFERENCE",
] as const;
export type EpisodeType = (typeof EPISODE_TYPES)[number];

export interface MemoryProvenance {
  source: string;
  sourceType: string;
  sourceId: string;
  sourceTimestamp: string | null;
  retrievedAt: string | null;
  verificationState: string;
}

/** Verified or raw fact. Never a rolling inference. */
export interface AiTraderObservation {
  kind: "OBSERVATION";
  id: ObservationId;
  instrument: AiTraderInstrument;
  observedAt: string;
  observationType: string;
  value: Record<string, unknown>;
  provenance: MemoryProvenance;
  qualityScore: number | null;
}

/** Derived profile. Must carry sample metadata. */
export interface AiTraderLearnedBelief {
  kind: "LEARNED_BELIEF";
  profileVersion: string;
  lookbackWindow: string;
  sampleSize: number;
  confidence: number | null;
  evidenceObservationIds: readonly ObservationId[];
  behaviorSummary: string | null;
  derivedMetrics: Record<string, unknown>;
  isCurrent: boolean;
  supersedesId: string | null;
  updatedAt: string;
}

export interface AiTraderSymbolProfile extends AiTraderLearnedBelief {
  instrument: AiTraderInstrument;
}

export interface AiTraderSetupProfile extends AiTraderLearnedBelief {
  setupKey: string;
  strategyVersion: string | null;
}

export interface AiTraderRegimeProfile extends AiTraderLearnedBelief {
  regimeKey: string;
}

export interface AiTraderEpisode {
  id: EpisodeId;
  instrument: AiTraderInstrument;
  sessionDate: string;
  episodeType: EpisodeType;
  setupType: string | null;
  strategyVersion: string | null;
  marketRegime: string | null;
  startedAt: string;
  endedAt: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  mfe: number | null;
  mae: number | null;
  realizedPnl: number | null;
  netPnl: number | null;
  featureSnapshot: Record<string, unknown>;
  outcome: string | null;
  contextSnapshotId: ContextSnapshotId | null;
  tradeId: TradeId | null;
  marketEpisodeId: string | null;
}

export function isObservation(value: { kind?: string }): value is AiTraderObservation {
  return value.kind === "OBSERVATION";
}

export function isLearnedBelief(value: { kind?: string }): value is AiTraderLearnedBelief {
  return value.kind === "LEARNED_BELIEF";
}

export function learnedBeliefHasRequiredEvidence(belief: AiTraderLearnedBelief): boolean {
  return (
    Number.isFinite(belief.sampleSize) &&
    belief.sampleSize > 0 &&
    belief.lookbackWindow.length > 0 &&
    belief.evidenceObservationIds.length > 0
  );
}
