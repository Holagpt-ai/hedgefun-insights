import type { AiTraderAssetClass } from "@/lib/ai-trader/domain/instrument";

export const MARKET_CANDIDATE_SOURCE = "radar_v22_board" as const;

export interface MarketIntelligenceCapabilities {
  volumeFirstRank: true;
  bidAsk: false;
  spread: false;
  level2: false;
  timesAndSales: false;
  verifiedHaltFeed: false;
  vwapVerified: false;
  embeddings: false;
}

export const MARKET_INTELLIGENCE_CAPABILITIES: MarketIntelligenceCapabilities = {
  volumeFirstRank: true,
  bidAsk: false,
  spread: false,
  level2: false,
  timesAndSales: false,
  verifiedHaltFeed: false,
  vwapVerified: false,
  embeddings: false,
};

export interface MarketCatalystRef {
  id: string | null;
  symbol: string;
  eventType: string;
  verificationState: string | null;
  publishedAt: string | null;
  eventDate: string | null;
  title: string | null;
  source: "catalyst_events";
}

export interface MarketHistoricalRef {
  id: string;
  kind: "market_behavior_episode" | "security_behavior_profile" | "forward_outcome";
  symbol: string;
}

export interface MarketCandidateQuality {
  feedStatus: string;
  missingFields: readonly string[];
  capabilities: MarketIntelligenceCapabilities;
}

export interface MarketCandidateProvenance {
  generationId: string | null;
  providerAsOf: string | null;
  radarUpdatedAt: string | null;
  table: typeof MARKET_CANDIDATE_SOURCE;
}

export interface MarketCandidate {
  symbol: string;
  securityId: string | null;
  assetClass: AiTraderAssetClass;
  source: typeof MARKET_CANDIDATE_SOURCE;
  sourceRank: number;
  sourceSession: string | null;
  surveillanceDate: string | null;
  lifecycle: string | null;
  lastPrice: number | null;
  volume: number | null;
  shortWindowVolume: number | null;
  dollarVolume: number | null;
  sessionHigh: number | null;
  sessionLow: number | null;
  sessionVwap: number | null;
  rvol5m: number | null;
  scannerEvents: unknown;
  catalystRefs: readonly MarketCatalystRef[];
  historicalRefs: readonly MarketHistoricalRef[];
  quality: MarketCandidateQuality;
  provenance: MarketCandidateProvenance;
}

export interface MarketSymbolContext extends MarketCandidate {
  screener: {
    gapPercent: number | null;
    floatShares: number | null;
    rvol: number | null;
    available: boolean;
  };
}

export function candidatesPreserveSourceRank(candidates: readonly MarketCandidate[]): boolean {
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].sourceRank < candidates[i - 1].sourceRank) return false;
  }
  return true;
}
