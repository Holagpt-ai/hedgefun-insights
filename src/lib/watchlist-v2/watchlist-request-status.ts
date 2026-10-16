import { humanFailureReason } from "@/lib/watchlist-v2/parsers";

export type WatchlistRequestStatus = "pending" | "failed" | "succeeded" | "none";

export function resolveWatchlistRowRequestStatus(input: {
  status: string | undefined;
  error_code: string | null | undefined;
  requested_at: string | undefined;
  completed_at: string | undefined;
  analyzedAt: string;
}): { requestStatus: WatchlistRequestStatus; requestError: string | null } {
  const raw = input.status;
  if (raw !== "pending" && raw !== "failed" && raw !== "succeeded") {
    return { requestStatus: "none", requestError: null };
  }

  const requestError = input.error_code ? humanFailureReason(input.error_code) : null;

  if (raw === "pending" || raw === "failed") {
    return { requestStatus: raw, requestError };
  }

  const completedMs = Date.parse(input.completed_at ?? "");
  if (!Number.isFinite(completedMs)) {
    return { requestStatus: "pending", requestError: null };
  }

  const analyzedMs = Date.parse(input.analyzedAt ?? "");
  if (!Number.isFinite(analyzedMs) || analyzedMs < completedMs) {
    return { requestStatus: "pending", requestError: null };
  }

  return { requestStatus: "succeeded", requestError: null };
}
