import type { V2Direction } from "@/lib/watchlist-v2/parsers";
import type { WatchlistRequestStatus } from "@/lib/watchlist-v2/watchlist-request-status";

export type WatchlistRowPresentation =
  | "loading_analysis"
  | "analysis_pending"
  | "analysis_failed"
  | "awaiting_first_analysis"
  | "provider_unavailable"
  | "ready";

/**
 * Separates initial hydration / queue states from honest provider-unavailable analysis.
 * Prevents transient "Data Unavailable" badges while symbols or analysis requests load.
 */
export function resolveWatchlistRowPresentation(input: {
  hasV2: boolean;
  direction: V2Direction;
  requestStatus: WatchlistRequestStatus;
  secondaryHydrating: boolean;
}): WatchlistRowPresentation {
  if (!input.hasV2) {
    if (input.requestStatus === "failed") return "analysis_failed";
    if (input.secondaryHydrating) return "loading_analysis";
    if (input.requestStatus === "pending") return "analysis_pending";
    return "awaiting_first_analysis";
  }
  if (input.direction === "data_unavailable") return "provider_unavailable";
  return "ready";
}

export function watchlistPresentationBadgeLabel(presentation: WatchlistRowPresentation): string {
  switch (presentation) {
    case "loading_analysis":
      return "Loading analysis";
    case "analysis_pending":
      return "Analysis pending";
    case "analysis_failed":
      return "Update failed";
    case "awaiting_first_analysis":
      return "Awaiting analysis";
    case "provider_unavailable":
      return "Data Unavailable";
    case "ready":
      return "";
    default:
      return "";
  }
}