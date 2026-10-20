/**
 * Per-isolate request guard for public market-data routes that do not use
 * the shared snapshot/aggregate quota. No Redis commands and no client IP.
 */

export const OTHER_ROUTE_WINDOW_MS = 60_000;
export const OTHER_ROUTE_MAX_REQUESTS = 300;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function consumeInstanceRequestGuard(nowMs = Date.now(), bucket = "other"): boolean {
  const entry = buckets.get(bucket);
  if (!entry || nowMs >= entry.resetAt) {
    buckets.set(bucket, { count: 1, resetAt: nowMs + OTHER_ROUTE_WINDOW_MS });
    return true;
  }
  if (entry.count >= OTHER_ROUTE_MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

export function resetInstanceRequestGuardForTests(): void {
  buckets.clear();
}
