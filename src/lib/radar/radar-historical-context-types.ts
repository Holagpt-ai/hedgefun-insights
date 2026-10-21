import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

export type RadarHistoricalContextLoadStatus =
  | "pending"
  | "loading"
  | "available"
  | "empty"
  | "limited"
  | "unavailable"
  | "failed";

/** Optional Radar candidate fields — attached after rank/selection. */
export interface RadarHistoricalContextFields {
  securityId?: SecurityId | null;
  historicalContext?: RepeatMoverContext | null;
  /** Distinguishes unloaded rows from genuine empty history. */
  historicalContextLoadStatus?: RadarHistoricalContextLoadStatus;
}

export interface RadarHistoricalContextEnrichmentRequest {
  symbol: string;
  securityId?: SecurityId | null;
  movePct?: number | null;
  volume?: number | null;
  rvol?: number | null;
  dollarVolume?: number | null;
  direction?: string | null;
  tier?: string | null;
  sessionDate?: string | null;
  recordedAt?: string | null;
}

export type RadarHistoricalContextEnrichmentResult = {
  symbol: string;
  securityId: SecurityId | null;
  historicalContext: RepeatMoverContext | null;
};
