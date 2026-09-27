import { RADAR_CAPABILITIES } from "@/features/day-trade-radar-v2/radar-capabilities";
import { fallbackOpenSchedule, sessionKindAtMsOfDay } from "@/lib/equities-session-calendar";
import {
  MARKET_CANDIDATE_SOURCE,
  MARKET_INTELLIGENCE_CAPABILITIES,
  type MarketCandidate,
  type MarketSymbolContext,
} from "@/lib/ai-trader/market/candidate";
import type {
  CandidateBoardRequest,
  IntelligenceSnapshot,
  MarketIntelligenceAdapter,
  SymbolContextRequest,
} from "@/lib/ai-trader/market/intelligence-adapter";
import { easternParts } from "@/lib/market-session";
import { viewRadarV22Generation, type RadarV22BoardRow } from "@/lib/radar-v22";
import { surveillanceTradingDateFromMs } from "@/lib/screeners/screener-session";

function missingFields(row: RadarV22BoardRow): string[] {
  const missing: string[] = [];
  if (row.session_vwap == null || !Number.isFinite(row.session_vwap)) missing.push("session_vwap");
  if (row.acceleration_5m == null) missing.push("rvol_5m");
  missing.push("bid", "ask", "spread", "level2", "times_and_sales", "verified_halt");
  return missing;
}

function sourceSessionLabel(asOfMs: number, radarSessionDate: string | null): string | null {
  const parts = easternParts(asOfMs);
  if (!parts || !radarSessionDate) return radarSessionDate;
  const kind = sessionKindAtMsOfDay(parts.msOfDay, fallbackOpenSchedule(radarSessionDate));
  return `${radarSessionDate}:${kind}`;
}

function mapBoardRow(
  row: RadarV22BoardRow,
  input: {
    feedStatus: string;
    generationId: string | null;
    sourceSession: string | null;
    surveillanceDate: string | null;
    snapshot: IntelligenceSnapshot;
  },
): MarketCandidate {
  const symbol = row.symbol.toUpperCase();
  const screener = input.snapshot.screenerBySymbol?.[symbol];
  return {
    symbol,
    securityId: null,
    assetClass: "US_EQUITY",
    source: MARKET_CANDIDATE_SOURCE,
    sourceRank: row.rank,
    sourceSession: input.sourceSession,
    surveillanceDate: input.surveillanceDate,
    lifecycle: row.lifecycle,
    lastPrice: row.price,
    volume: row.volume,
    shortWindowVolume: row.rolling_volume_60s,
    dollarVolume: Number.isFinite(row.rolling_dollar_volume_60s) ? row.rolling_dollar_volume_60s : null,
    sessionHigh: row.day_high,
    sessionLow: row.day_low,
    sessionVwap: row.session_vwap,
    rvol5m: screener?.rvol5m ?? null,
    scannerEvents: null,
    catalystRefs: input.snapshot.catalystsBySymbol?.[symbol] ?? [],
    historicalRefs: input.snapshot.historicalRefsBySymbol?.[symbol] ?? [],
    quality: {
      feedStatus: input.feedStatus,
      missingFields: missingFields(row),
      capabilities: {
        ...MARKET_INTELLIGENCE_CAPABILITIES,
        volumeFirstRank: RADAR_CAPABILITIES.volumeFirstRank,
      },
    },
    provenance: {
      generationId: input.generationId,
      providerAsOf: row.provider_as_of,
      radarUpdatedAt: row.updated_at,
      table: MARKET_CANDIDATE_SOURCE,
    },
  };
}

export function createStocksistMarketIntelligenceAdapter(
  loadSnapshot: () => Promise<IntelligenceSnapshot> | IntelligenceSnapshot,
): MarketIntelligenceAdapter {
  async function resolveBoard(input: CandidateBoardRequest): Promise<readonly MarketCandidate[]> {
    const snapshot = await loadSnapshot();
    const view = viewRadarV22Generation(
      snapshot.radarState ? [snapshot.radarState] : null,
      [...snapshot.radarBoard],
      input.todayEt,
    );
    if (!view.valid || !view.generationId) return [];
    const generationId = view.generationId;
    const ordered = snapshot.radarBoard
      .filter((row) => row.generation_id === generationId)
      .slice()
      .sort((a, b) => a.rank - b.rank);
    const surveillanceDate = surveillanceTradingDateFromMs(input.asOfMs);
    const session = sourceSessionLabel(input.asOfMs, view.sessionDate);
    return ordered.map((row) =>
      mapBoardRow(row, {
        feedStatus: view.status,
        generationId,
        sourceSession: session,
        surveillanceDate,
        snapshot,
      }),
    );
  }

  return {
    getCandidateBoard: resolveBoard,
    async getSymbolContext(input: SymbolContextRequest): Promise<MarketSymbolContext | null> {
      const board = await resolveBoard(input);
      const candidate = board.find((row) => row.symbol === input.symbol.toUpperCase()) ?? null;
      if (!candidate) return null;
      const snapshot = await loadSnapshot();
      const screener = snapshot.screenerBySymbol?.[candidate.symbol];
      return {
        ...candidate,
        screener: {
          gapPercent: screener?.gapPercent ?? null,
          floatShares: screener?.floatShares ?? null,
          rvol: screener?.rvol ?? null,
          available: Boolean(screener),
        },
      };
    },
  };
}
