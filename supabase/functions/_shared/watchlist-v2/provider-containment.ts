/**
 * Batch-level containment for confirmed provider-wide Anthropic failures.
 * Ticker-scoped 400 invalid_request must not trip containment without evidence.
 */

const PROVIDER_WIDE_ERROR_TYPES = new Set([
  "authentication_error",
  "permission_error",
  "not_found_error",
]);

export function isProviderWideWatchlistAiFailure(input: {
  errorCode: string;
  httpStatus: number | null;
  errorType?: string | null;
}): boolean {
  if (input.errorCode === "AI_AUTH") return true;
  if (input.errorCode !== "AI_PROVIDER_ERROR") return false;

  const status = input.httpStatus;
  if (status === 401 || status === 403 || status === 402 || status === 404) return true;

  const type = input.errorType?.trim().toLowerCase() ?? "";
  if (type && PROVIDER_WIDE_ERROR_TYPES.has(type)) return true;

  return false;
}

/** Consecutive provider-wide signals required before halting the rest of a batch slice. */
export const WATCHLIST_BATCH_PROVIDER_WIDE_CONTAINMENT_THRESHOLD = 2;