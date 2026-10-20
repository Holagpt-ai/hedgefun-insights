/**
 * In-process counters. One log line per minute. Nothing here calls Redis.
 */

const FIELDS = [
  "redisCommands",
  "memoryHits",
  "sharedHits",
  "originFills",
  "massiveAttempts",
  "quotaDenies",
  "otherDenies",
  "upstreamFailures",
  "circuitSkips",
] as const;

type Field = typeof FIELDS[number];

const meters: Record<Field, number> = {
  redisCommands: 0,
  memoryHits: 0,
  sharedHits: 0,
  originFills: 0,
  massiveAttempts: 0,
  quotaDenies: 0,
  otherDenies: 0,
  upstreamFailures: 0,
  circuitSkips: 0,
};

let lastLogMs = 0;

function bump(field: Field, by = 1): void {
  meters[field] += by;
}

export function noteRedisCommands(count: number): void {
  if (count > 0) bump("redisCommands", count);
}

export function noteMemoryHit(): void {
  bump("memoryHits");
}

export function noteSharedHit(): void {
  bump("sharedHits");
}

export function noteOriginFill(): void {
  bump("originFills");
}

export function noteMassiveAttempt(): void {
  bump("massiveAttempts");
}

export function noteQuotaDeny(): void {
  bump("quotaDenies");
}

export function noteOtherDeny(): void {
  bump("otherDenies");
}

export function noteUpstreamFailure(): void {
  bump("upstreamFailures");
}

export function noteCircuitSkip(): void {
  bump("circuitSkips");
}

export function marketDataMeterSnapshot(): Record<Field, number> {
  return { ...meters };
}

export function resetMarketDataMetersForTests(): void {
  for (const field of FIELDS) meters[field] = 0;
  lastLogMs = 0;
}

/** Logs at most once per minute, then resets the interval counters. */
export function maybeLogMarketDataMeters(nowMs: number): boolean {
  if (lastLogMs !== 0 && nowMs - lastLogMs < 60_000) return false;
  const hasActivity = FIELDS.some((field) => meters[field] > 0);
  if (!hasActivity && lastLogMs !== 0) return false;
  lastLogMs = nowMs;
  if (!hasActivity) return false;
  console.log(
    `[market-data] meters redis_commands=${meters.redisCommands} memory_hits=${meters.memoryHits} shared_hits=${meters.sharedHits} origin_fills=${meters.originFills} massive_attempts=${meters.massiveAttempts} quota_denies=${meters.quotaDenies} other_denies=${meters.otherDenies} upstream_failures=${meters.upstreamFailures} circuit_skips=${meters.circuitSkips}`,
  );
  for (const field of FIELDS) meters[field] = 0;
  return true;
}
