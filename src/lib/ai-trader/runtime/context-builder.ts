import {
  AI_TRADER_CONTEXT_SCHEMA_VERSION,
  hashContextSnapshot,
  type AiTraderContextSnapshot,
} from "@/lib/ai-trader/domain/context";
import type { MarketCandidate } from "@/lib/ai-trader/market/candidate";
import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import { candidateObservedAt } from "@/lib/ai-trader/runtime/freshness";
import { evidenceIsNotFromFuture } from "@/lib/ai-trader/runtime/lookahead";
import type { AiTraderMarketSession } from "@/lib/ai-trader/runtime/contracts";

export function buildCandidateContextSnapshot(
  candidate: MarketCandidate,
  input: {
    operatingMode: AiTraderOperatingMode;
    marketSession: AiTraderMarketSession;
    cycleNowMs: number;
  },
): Omit<AiTraderContextSnapshot, "id"> | null {
  const observedAt = candidateObservedAt(candidate);
  if (!observedAt || !evidenceIsNotFromFuture(observedAt, input.cycleNowMs)) return null;
  const draft = {
    tradingSessionId: null,
    instrument: {
      symbol: candidate.symbol,
      assetClass: candidate.assetClass,
      venue: null,
    },
    observedAt,
    marketSession: input.marketSession,
    operatingMode: input.operatingMode,
    quoteTimestamp: observedAt,
    marketState: {
      last: candidate.lastPrice,
      volume: candidate.volume,
      sessionHigh: candidate.sessionHigh,
      sessionLow: candidate.sessionLow,
      sessionVwap: candidate.sessionVwap,
      sourceRank: candidate.sourceRank,
    },
    stocksistSignals: {
      lifecycle: candidate.lifecycle,
      rvol5m: candidate.rvol5m,
      scannerEvents: candidate.scannerEvents,
    },
    catalystRefs: candidate.catalystRefs.map((ref) => ({
      sourceType: "catalyst_events",
      sourceId: ref.id ?? ref.eventType,
      source: ref.source,
      sourceTimestamp: ref.publishedAt,
      retrievedAt: observedAt,
      verificationState: ref.verificationState ?? "UNVERIFIED",
    })),
    historicalRefs: [],
    sourceProvenance: [
      {
        sourceType: candidate.provenance.table,
        sourceId: candidate.provenance.generationId ?? candidate.symbol,
        source: candidate.source,
        sourceTimestamp: observedAt,
        retrievedAt: new Date(input.cycleNowMs).toISOString(),
        verificationState: "PROVIDER_REPORTED",
      },
    ],
    schemaVersion: AI_TRADER_CONTEXT_SCHEMA_VERSION,
  };
  return {
    ...draft,
    contextHash: hashContextSnapshot(draft),
  };
}
