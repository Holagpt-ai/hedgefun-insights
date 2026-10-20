const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function clientRateLimitKey(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return "unknown";
}

/** Returns true when the request is allowed under the in-memory limiter. */
export function consumePublicHistoricalContextRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}
