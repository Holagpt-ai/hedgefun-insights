import type {
  IntradayBarGranularity,
  IntradayCompletenessState,
  IntradayHodSessionPhase,
} from "@/config/intraday-reconstruction.config";
import type { EpisodeEventType } from "@/config/security-intelligence.config";
import type { SecurityId } from "@/types/security-identity";

export type IntradaySessionSegment = "PREMARKET" | "REGULAR" | "AFTER_HOURS" | "OTHER";

export interface NormalizedIntradayBar {
  tsMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  segment: IntradaySessionSegment;
}

export interface EpisodeIntradayReconstructionInput {
  episodeId: string;
  securityId: SecurityId;
  sessionDate: string;
  direction: "POSITIVE" | "NEGATIVE" | "MIXED";
  dailyOpen: number | null;
  dailyHigh: number | null;
  dailyLow: number | null;
  dailyClose: number | null;
  dailyVolume: number | null;
  bars: readonly NormalizedIntradayBar[];
  barGranularity: IntradayBarGranularity;
  source: string;
  sourceAsOf: string | null;
  fetchedAt: string;
  computedAt: string;
}

export interface EpisodeIntradayTimelineEvent {
  episodeEventId: string;
  episodeId: string;
  securityId: SecurityId;
  eventType: EpisodeEventType;
  eventAt: string;
  price: number | null;
  volume: number | null;
  metadata: Record<string, unknown>;
}

export interface EpisodeIntradayReconstructionFacts {
  episodeId: string;
  securityId: SecurityId;
  sessionDate: string;
  completenessState: IntradayCompletenessState;
  barGranularity: IntradayBarGranularity;
  barsExpected: number | null;
  barsAvailable: number | null;
  regBarsExpected: number | null;
  regBarsAvailable: number | null;
  sessionCoveragePct: number | null;
  provider: string;
  source: string;
  sourceAsOf: string | null;
  fetchedAt: string;
  computedAt: string;
  sessionOpenAt: string | null;
  hodAt: string | null;
  lodAt: string | null;
  firstMajorMoveAt: string | null;
  largestVolumeBurstAt: string | null;
  closeAt: string | null;
  openPrice: number | null;
  hodPrice: number | null;
  lodPrice: number | null;
  closePrice: number | null;
  moveOpenToHodPct: number | null;
  maxDrawdownFromHodPct: number | null;
  largestPullbackPct: number | null;
  recoveredFromPullback: boolean | null;
  closeVsHodPct: number | null;
  closePosition: number | null;
  totalIntradayVolume: number | null;
  largestBarVolume: number | null;
  volumeBeforeHod: number | null;
  volumeAfterHod: number | null;
  volumeConcentrationTop5Pct: number | null;
  premarketHigh: number | null;
  premarketLow: number | null;
  regularHigh: number | null;
  regularLow: number | null;
  afterHoursHigh: number | null;
  afterHoursLow: number | null;
  momentumLegCount: number | null;
  majorPullbackCount: number | null;
  hodSessionPhase: IntradayHodSessionPhase | null;
  vwapAtClose: number | null;
  firstVwapBreakAt: string | null;
  vwapReclaimCount: number | null;
  secondsAboveVwap: number | null;
  secondsBelowVwap: number | null;
  hodVsVwapPct: number | null;
  haltCount: number | null;
  firstHaltAt: string | null;
  haltDataAvailable: boolean;
  timeline: readonly EpisodeIntradayTimelineEvent[];
}

/** Compact evidence for Repeat Movers / AI (no prediction fields). */
export interface RepeatMoverIntradayEvidence {
  hodAt: string | null;
  closeVsHodPct: number | null;
  largestPullbackPct: number | null;
  recoveredFromPullback: boolean | null;
  haltCount: number | null;
  vwapReclaimCount: number | null;
  largestVolumeBurstAt: string | null;
  completenessState: IntradayCompletenessState;
}

export interface EpisodeIntradayReconstructionResult {
  facts: EpisodeIntradayReconstructionFacts;
}
