import type {
  MarketCandidate,
  MarketCatalystRef,
  MarketHistoricalRef,
  MarketSymbolContext,
} from "@/lib/ai-trader/market/candidate";
import type { RadarV22BoardRow, RadarV22FeedState } from "@/lib/radar-v22";

export interface CandidateBoardRequest {
  asOfMs: number;
  todayEt: string;
}

export interface SymbolContextRequest extends CandidateBoardRequest {
  symbol: string;
}

export interface ScreenerEnrichment {
  symbol: string;
  gapPercent: number | null;
  floatShares: number | null;
  rvol: number | null;
  rvol5m: number | null;
}

/**
 * Already-fetched Stocksist intelligence. The adapter does not create a
 * Supabase client and does not rank. Radar rank is consumed as-is.
 */
export interface IntelligenceSnapshot {
  radarState: RadarV22FeedState | null;
  radarBoard: readonly RadarV22BoardRow[];
  screenerBySymbol?: Readonly<Record<string, ScreenerEnrichment>>;
  catalystsBySymbol?: Readonly<Record<string, readonly MarketCatalystRef[]>>;
  historicalRefsBySymbol?: Readonly<Record<string, readonly MarketHistoricalRef[]>>;
}

export interface MarketIntelligenceAdapter {
  getCandidateBoard(input: CandidateBoardRequest): Promise<readonly MarketCandidate[]>;
  getSymbolContext(input: SymbolContextRequest): Promise<MarketSymbolContext | null>;
}
