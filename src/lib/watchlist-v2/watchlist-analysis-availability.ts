import type { V2Direction } from "@/lib/watchlist-v2/parsers";

/**
 * Prior AI analysis is displayable only when the stored row carries real analytical
 * payload — not merely a parsed analyzed_at timestamp.
 */
export function watchlistRowHasPriorAnalysisContent(input: {
  direction: V2Direction;
  explanation?: string;
  driverIds?: string[];
  marketSignalsCount?: number;
}): boolean {
  if (input.explanation?.trim()) return true;
  if ((input.driverIds?.length ?? 0) > 0) return true;
  if ((input.marketSignalsCount ?? 0) > 0) return true;
  if (
    input.direction === "bullish"
    || input.direction === "bearish"
    || input.direction === "neutral"
  ) {
    return true;
  }
  return false;
}

export function resolveWatchlistAnalysisFreshness(input: {
  analyzedAt: string;
  requestedAt: string | undefined;
  requestStatus: "pending" | "failed" | "succeeded" | "none";
}): "unknown" | "current" | "stale_vs_request" {
  const analyzedMs = Date.parse(input.analyzedAt ?? "");
  if (!Number.isFinite(analyzedMs)) return "unknown";
  const requestedMs = Date.parse(input.requestedAt ?? "");
  if (!Number.isFinite(requestedMs)) return "current";
  if (input.requestStatus === "pending" || input.requestStatus === "failed") {
    if (analyzedMs < requestedMs) return "stale_vs_request";
  }
  if (input.requestStatus === "succeeded") {
    const completedGuess = requestedMs;
    if (analyzedMs < completedGuess) return "stale_vs_request";
  }
  return "current";
}