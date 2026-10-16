/**
 * Separates stored quote timestamps from intraday chart-bar evidence.
 */

import { formatMarketDataTrustLine, type MarketDataTrustState } from "@/lib/market-data/trust-states";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";
import {
  expectedWatchlistAnalysisSessionDate,
  latestCoherentIntradayBarMs,
  watchlistIntradayRelievesStaleSnapshot,
  watchlistQuoteDisplayTimestampMs,
} from "@/lib/watchlist-v2/watchlist-quote-coherence";

export interface WatchlistQuoteProvenance {
  quoteTimestampMs: number | null;
  quoteIso: string | null;
  quoteAsOfLabel: string | null;
  trustLine: string;
  chartBarTimestampMs: number | null;
  chartEvidenceLabel: string | null;
  intradayRelievesStaleSnapshot: boolean;
}

export function buildWatchlistQuoteProvenance(input: {
  snapshotMs: number | null;
  trust: MarketDataTrustState;
  analysisPresentation: "live" | "last_completed" | null | undefined;
  analysisSessionDate: string | null | undefined;
  intradayBars: readonly { t: number }[];
  nowMs?: number;
}): WatchlistQuoteProvenance {
  const nowMs = input.nowMs ?? Date.now();
  const quoteTimestampMs = watchlistQuoteDisplayTimestampMs(input.snapshotMs);
  const quoteIso =
    quoteTimestampMs !== null ? new Date(quoteTimestampMs).toISOString() : null;
  const trustLine = formatMarketDataTrustLine(input.trust, quoteIso, nowMs);

  const intradayRelievesStaleSnapshot = watchlistIntradayRelievesStaleSnapshot({
    analysisPresentation: input.analysisPresentation,
    analysisSessionDate: input.analysisSessionDate,
    snapshotMs: input.snapshotMs,
    intradayBars: input.intradayBars,
    nowMs,
  });

  const sessionDate = expectedWatchlistAnalysisSessionDate({
    analysisSessionDate: input.analysisSessionDate,
    snapshotMs: input.snapshotMs,
  });
  const chartBarTimestampMs =
    sessionDate !== null
      ? latestCoherentIntradayBarMs({
          intradayBars: input.intradayBars,
          expectedSessionDate: sessionDate,
          snapshotMs: input.snapshotMs,
          nowMs,
        })
      : null;

  const quoteClock = quoteTimestampMs !== null ? formatEtClock(quoteIso) : null;
  const quoteAsOfLabel = quoteClock ? `Quote as of ${quoteClock}` : "Quote timestamp unavailable";

  let chartEvidenceLabel: string | null = null;
  if (chartBarTimestampMs !== null) {
    const barClock = formatEtClock(new Date(chartBarTimestampMs).toISOString());
    chartEvidenceLabel = barClock
      ? `Chart bars through ${barClock} (session evidence; quote time unchanged)`
      : null;
  }

  return {
    quoteTimestampMs,
    quoteIso,
    quoteAsOfLabel,
    trustLine,
    chartBarTimestampMs,
    chartEvidenceLabel,
    intradayRelievesStaleSnapshot,
  };
}
