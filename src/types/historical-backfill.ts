import type { DataValue } from "@/types/data-quality";
import type { EpisodeDirection, EpisodeTier } from "@/config/security-intelligence.config";
import type { SecurityId } from "@/types/security-identity";

export const PROVIDER_COVERAGE_STATES = [
  "SUPPORTED",
  "PARTIAL",
  "UNAVAILABLE",
  "ENTITLEMENT_UNKNOWN",
] as const;
export type ProviderCoverage = (typeof PROVIDER_COVERAGE_STATES)[number];

export interface EligibleSecurity {
  securityId: SecurityId;
}

export interface DailyBarsRequest {
  securityId: SecurityId;
  symbol: string;
  exchange: string | null;
  dateFrom: string;
  dateTo: string;
}

export interface ProviderDailyBar {
  sessionDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface DailyBarsResult {
  coverage: ProviderCoverage;
  bars: readonly ProviderDailyBar[];
  source: string;
  sourceAsOf: string | null;
  fetchedAt: string | null;
  error: string | null;
  complete: boolean;
}

/**
 * Provider-neutral historical bars. Business logic must not depend on Polygon.
 * fetchMinuteBars is optional and the V1 engine does not call it.
 */
export interface HistoricalMarketDataProvider {
  fetchDailyBars(request: DailyBarsRequest): Promise<DailyBarsResult>;
  fetchMinuteBars?(request: DailyBarsRequest): Promise<DailyBarsResult>;
}

export interface NormalizedDailyBar {
  securityId: SecurityId;
  sessionDate: string;
  observedSymbol: string;
  exchange: string | null;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dollarVolume: number | null;
  previousClose: number | null;
  movePct: number | null;
  dollarVolumeValue: DataValue<number> | null;
  movePctValue: DataValue<number> | null;
  source: string;
  sourceAsOf: string | null;
  fetchedAt: string | null;
  computedAt: string | null;
}

export interface DailyNormalizationRejection {
  ok: false;
  reason: string;
}

export interface DailyNormalizationSuccess {
  ok: true;
  bar: NormalizedDailyBar;
}

export type DailyNormalization = DailyNormalizationSuccess | DailyNormalizationRejection;

export interface DailyEpisodeDetection {
  tier: EpisodeTier | "NORMAL";
  direction: EpisodeDirection;
  reasons: string[];
  maxPositiveMovePct: number | null;
  maxNegativeMovePct: number | null;
  rangePct: number | null;
}

export interface DeepReconstructionCandidate {
  episodeId: string;
  tier: EpisodeTier;
  securityId: SecurityId;
  sessionDate: string;
  reasons: string[];
  eligible: boolean;
}

export interface BackfillCheckpoint {
  securityIndex: number;
  nextChunkFrom: string;
  securitiesTotal: number;
  securitiesProcessed: number;
  sessionsProcessed: number;
  rowsWritten: number;
  duplicateRows: number;
  invalidRows: number;
  providerErrors: number;
  episodesByTier: Record<"NOTABLE" | "SIGNIFICANT" | "EXTREME", number>;
  coverage: ProviderCoverage | null;
  deepReconstruction: DeepReconstructionCandidate[];
  lastSuccessfulSecurityIndex: number;
  lastSuccessfulChunkFrom: string;
}

export interface BackfillJobStats {
  state: string;
  dateFrom: string;
  dateTo: string;
  cursorDate: string | null;
  cursorToken: string | null;
  securitiesTotal: number;
  securitiesProcessed: number;
  sessionsProcessed: number;
  rowsWritten: number;
  duplicateRows: number;
  invalidRows: number;
  providerErrors: number;
  episodesByTier: Record<"NOTABLE" | "SIGNIFICANT" | "EXTREME", number>;
  coverage: ProviderCoverage | null;
  deepReconstruction: readonly DeepReconstructionCandidate[];
  elapsedMs: number | null;
}
