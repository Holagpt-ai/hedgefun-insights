import { humanFailureReason } from "@/lib/watchlist-v2/parsers";
import {
  resolveWatchlistAnalysisFreshness,
  watchlistRowHasPriorAnalysisContent,
} from "@/lib/watchlist-v2/watchlist-analysis-availability";
import type { V2Direction } from "@/lib/watchlist-v2/parsers";

export type WatchlistRequestStatus = "pending" | "failed" | "succeeded" | "none";

export type WatchlistAnalysisFreshness = "unknown" | "current" | "stale_vs_request";

export interface WatchlistRowRequestResolution {
  /** Latest refresh request outcome — never coerced to succeeded when the request failed. */
  requestStatus: WatchlistRequestStatus;
  requestError: string | null;
  /** Stored row still has displayable AI analysis content (independent of request outcome). */
  priorAnalysisAvailable: boolean;
  /** Failed refresh while prior analysis remains on screen. */
  refreshFailedWithPriorAnalysis: boolean;
  analysisFreshness: WatchlistAnalysisFreshness;
}

export function resolveWatchlistRowRequestStatus(input: {
  status: string | undefined;
  error_code: string | null | undefined;
  requested_at: string | undefined;
  completed_at: string | undefined;
  analyzedAt: string;
  direction?: V2Direction;
  explanation?: string;
  driverIds?: string[];
  marketSignalsCount?: number;
}): WatchlistRowRequestResolution {
  const raw = input.status;
  let requestStatus: WatchlistRequestStatus = "none";
  if (raw === "pending" || raw === "failed" || raw === "succeeded") {
    requestStatus = raw;
  }

  const requestError = input.error_code ? humanFailureReason(input.error_code) : null;

  if (raw === "failed") {
    const priorAnalysisAvailable = watchlistRowHasPriorAnalysisContent({
      direction: input.direction ?? "data_unavailable",
      explanation: input.explanation,
      driverIds: input.driverIds,
      marketSignalsCount: input.marketSignalsCount,
    });
    return {
      requestStatus: "failed",
      requestError,
      priorAnalysisAvailable,
      refreshFailedWithPriorAnalysis: priorAnalysisAvailable,
      analysisFreshness: resolveWatchlistAnalysisFreshness({
        analyzedAt: input.analyzedAt,
        requestedAt: input.requested_at,
        requestStatus: "failed",
      }),
    };
  }

  if (raw === "pending") {
    return {
      requestStatus: "pending",
      requestError: null,
      priorAnalysisAvailable: watchlistRowHasPriorAnalysisContent({
        direction: input.direction ?? "data_unavailable",
        explanation: input.explanation,
        driverIds: input.driverIds,
        marketSignalsCount: input.marketSignalsCount,
      }),
      refreshFailedWithPriorAnalysis: false,
      analysisFreshness: resolveWatchlistAnalysisFreshness({
        analyzedAt: input.analyzedAt,
        requestedAt: input.requested_at,
        requestStatus: "pending",
      }),
    };
  }

  if (raw === "succeeded") {
    const completedMs = Date.parse(input.completed_at ?? "");
    if (!Number.isFinite(completedMs)) {
      return {
        requestStatus: "pending",
        requestError: null,
        priorAnalysisAvailable: false,
        refreshFailedWithPriorAnalysis: false,
        analysisFreshness: "unknown",
      };
    }

    const analyzedMs = Date.parse(input.analyzedAt ?? "");
    if (!Number.isFinite(analyzedMs) || analyzedMs < completedMs) {
      return {
        requestStatus: "pending",
        requestError: null,
        priorAnalysisAvailable: watchlistRowHasPriorAnalysisContent({
          direction: input.direction ?? "data_unavailable",
          explanation: input.explanation,
          driverIds: input.driverIds,
          marketSignalsCount: input.marketSignalsCount,
        }),
        refreshFailedWithPriorAnalysis: false,
        analysisFreshness: resolveWatchlistAnalysisFreshness({
          analyzedAt: input.analyzedAt,
          requestedAt: input.requested_at,
          requestStatus: "pending",
        }),
      };
    }

    return {
      requestStatus: "succeeded",
      requestError: null,
      priorAnalysisAvailable: watchlistRowHasPriorAnalysisContent({
        direction: input.direction ?? "data_unavailable",
        explanation: input.explanation,
        driverIds: input.driverIds,
        marketSignalsCount: input.marketSignalsCount,
      }),
      refreshFailedWithPriorAnalysis: false,
      analysisFreshness: "current",
    };
  }

  return {
    requestStatus: "none",
    requestError: null,
    priorAnalysisAvailable: watchlistRowHasPriorAnalysisContent({
      direction: input.direction ?? "data_unavailable",
      explanation: input.explanation,
      driverIds: input.driverIds,
      marketSignalsCount: input.marketSignalsCount,
    }),
    refreshFailedWithPriorAnalysis: false,
    analysisFreshness: "unknown",
  };
}