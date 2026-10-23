/**
 * Separates HTTP/cache freshness from provider tape semantics.
 * Never infer provider delay from cache age alone.
 */

export type MarketDataCacheFreshness = "fresh" | "aging" | "closed";
export type ProviderDelayClass = "realtime" | "delayed" | "unknown";
export type UsEquityMarketSession = "pre-market" | "market" | "after-hours" | "closed";

export type EnvLookup = { get(name: string): string | undefined };

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

const defaultEnvLookup: EnvLookup = { get: safeEnvGet };

const SESSION_BANDS: { id: UsEquityMarketSession; start: number; end: number }[] = [
  { id: "pre-market", start: 240, end: 569 },
  { id: "market", start: 570, end: 959 },
  { id: "after-hours", start: 960, end: 1199 },
];

/** Authoritative REST entitlement delay in minutes (`0` = realtime-capable). Unset → unknown delay class. */
export function readMarketDataEntitlementDelayMinutes(env: EnvLookup = defaultEnvLookup): number | null {
  const raw = env.get("MARKET_DATA_ENTITLEMENT_DELAY_MINUTES");
  if (raw == null || raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function classifyProviderDelay(
  entitlementDelayMinutes: number | null,
  sourceAsOfMs: number | null,
  nowMs: number,
): ProviderDelayClass {
  if (entitlementDelayMinutes == null) return "unknown";
  if (entitlementDelayMinutes > 0) return "delayed";
  if (sourceAsOfMs == null) return "unknown";
  const observationLagMs = Math.max(0, nowMs - sourceAsOfMs);
  if (observationLagMs <= 120_000) return "realtime";
  return "unknown";
}

function etMinutesFromMidnight(nowMs: number): { minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(get("hour"), 10);
  if (!Number.isFinite(hour) || hour === 24) hour = 0;
  const minute = parseInt(get("minute"), 10) || 0;
  return { minutes: hour * 60 + minute, weekday: weekdayMap[get("weekday")] ?? 0 };
}

export function resolveUsEquityMarketSession(nowMs: number): UsEquityMarketSession {
  const { minutes, weekday } = etMinutesFromMidnight(nowMs);
  if (weekday === 0 || weekday === 6) return "closed";
  for (const band of SESSION_BANDS) {
    if (minutes >= band.start && minutes <= band.end) return band.id;
  }
  return "closed";
}

export function marketDataProvenanceHeaders(input: {
  cacheFreshness: MarketDataCacheFreshness;
  cache: "memory" | "shared" | "origin";
  sourceAsOfMs: number | null;
  cacheAgeMs: number;
  cacheControlMaxAgeSeconds: number;
  providerDelay: ProviderDelayClass;
  marketSession: UsEquityMarketSession;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Market-Data-Cache-Freshness": input.cacheFreshness,
    "X-Market-Data-Freshness": input.cacheFreshness,
    "X-Market-Data-Cache": input.cache,
    "X-Market-Data-Cache-Age-Ms": String(Math.max(0, input.cacheAgeMs)),
    "X-Market-Data-Provider-Delay": input.providerDelay,
    "X-Market-Data-Market-Session": input.marketSession,
    "Cache-Control": `public, max-age=${input.cacheControlMaxAgeSeconds}`,
  };
  if (input.sourceAsOfMs != null) {
    headers["X-Market-Data-Source-As-Of"] = new Date(input.sourceAsOfMs).toISOString();
  }
  return headers;
}
