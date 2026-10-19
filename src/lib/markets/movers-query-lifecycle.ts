/** Bounded empty-result retry for premarket mover queries (per ET session date). */

export const PREMARKET_EMPTY_RETRY_MAX = 1;

export function canRetryEmptyPremarketFetch(attempts: number): boolean {
  return attempts < PREMARKET_EMPTY_RETRY_MAX;
}
