/**
 * Polygon snapshot `lastTrade.t` may be Unix milliseconds or nanoseconds.
 * Values at or above NANOSECOND_THRESHOLD are treated as ns and scaled to ms.
 */
/** Matches production Edge fix: values above ~1e14 are nanosecond epoch. */
export const POLYGON_TS_NANOSECOND_THRESHOLD = 1e14;

const MAX_REASONABLE_MS = 8.64e15; // ~year 275760 — guard invalid Date

export function normalizePolygonTimestampToMs(
  raw: unknown,
  fallbackMs: number = Date.now(),
): number {
  if (raw == null) return fallbackMs;

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return fallbackMs;
    let ms = raw;
    if (Math.abs(raw) >= POLYGON_TS_NANOSECOND_THRESHOLD) {
      ms = Math.trunc(raw / 1_000_000);
    }
    if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_REASONABLE_MS) return fallbackMs;
    return ms;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return fallbackMs;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) {
      return normalizePolygonTimestampToMs(asNum, fallbackMs);
    }
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_REASONABLE_MS) {
      return parsed;
    }
    return fallbackMs;
  }

  return fallbackMs;
}

/** Safe ISO string for DB writes — never throws Invalid time value. */
export function observedAtMsToIso(observedAtMs: number | null | undefined): string | null {
  if (observedAtMs == null || !Number.isFinite(observedAtMs)) return null;
  if (observedAtMs <= 0 || observedAtMs > MAX_REASONABLE_MS) return null;
  const d = new Date(observedAtMs);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}
