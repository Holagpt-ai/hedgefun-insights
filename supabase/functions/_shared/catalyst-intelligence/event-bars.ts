const POLYGON_ORIGIN = "https://api.polygon.io";
const MINUTE_MS = 60_000;
const MAX_BARS = 5_000;

export interface EventPriceBar {
  /** Bar start, unix milliseconds. */
  startMs: number;
  durationMs: number;
  close: number;
}

/**
 * Close of the latest bar that finished at or immediately before eventAt.
 * A bar that is still open at the event is ignored so its close cannot
 * include trades after the announcement. A large gap is not a reference.
 */
export function referencePriceAtOrBefore(
  bars: readonly EventPriceBar[],
  eventAtMs: number,
  maxGapMs = 2 * MINUTE_MS,
): number | null {
  if (!Number.isFinite(eventAtMs)) return null;
  let best: { end: number; close: number } | null = null;
  for (const bar of bars) {
    if (!(bar.close > 0) || !Number.isFinite(bar.close)) continue;
    if (!Number.isFinite(bar.startMs) || !Number.isFinite(bar.durationMs) || bar.durationMs <= 0) continue;
    const end = bar.startMs + bar.durationMs;
    if (end > eventAtMs) continue;
    if (eventAtMs - end > maxGapMs) continue;
    if (!best || end > best.end) best = { end, close: bar.close };
  }
  return best ? best.close : null;
}

export function priceBarsFromPolygonAggs(results: unknown, durationMs = MINUTE_MS): EventPriceBar[] {
  if (!Array.isArray(results)) return [];
  const bars: EventPriceBar[] = [];
  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const stamp = (raw as { t?: unknown }).t;
    const close = (raw as { c?: unknown }).c;
    if (typeof stamp !== "number" || typeof close !== "number") continue;
    if (!Number.isFinite(stamp) || !(close > 0)) continue;
    bars.push({ startMs: stamp, durationMs, close });
    if (bars.length >= MAX_BARS) break;
  }
  return bars;
}

export function eventReferenceInstant(event: {
  announcementAt: string | null;
  effectiveAt: string | null;
  scheduledStartAt: string | null;
  firstDiscoveredAt: string | null;
}): string | null {
  return event.announcementAt ?? event.effectiveAt ?? event.scheduledStartAt ?? event.firstDiscoveredAt ?? null;
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Polygon minute aggregates for the event day and the previous UTC day.
 * Missing key, bad symbol, or no completed bar returns no price.
 */
export async function loadPolygonMinuteBars(input: {
  symbol: string;
  eventAtIso: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<EventPriceBar[]> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(symbol)) return [];
  const eventMs = Date.parse(input.eventAtIso);
  if (!Number.isFinite(eventMs) || !input.apiKey) return [];
  const from = utcDay(eventMs - 24 * 60 * 60 * 1000);
  const to = utcDay(eventMs);
  const url = new URL(`${POLYGON_ORIGIN}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/minute/${from}/${to}`);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", String(MAX_BARS));
  url.searchParams.set("apiKey", input.apiKey);
  if (url.origin !== POLYGON_ORIGIN) return [];
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return [];
    const body = await response.json();
    const results = body && typeof body === "object" ? (body as { results?: unknown }).results : null;
    return priceBarsFromPolygonAggs(results);
  } catch {
    return [];
  }
}
