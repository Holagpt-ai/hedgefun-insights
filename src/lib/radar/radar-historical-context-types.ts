import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

/** Optional Radar candidate fields — attached after rank/selection. */
export interface RadarHistoricalContextFields {
  securityId?: SecurityId | null;
  historicalContext?: RepeatMoverContext | null;
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
