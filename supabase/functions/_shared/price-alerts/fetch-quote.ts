import type { QuoteDataLatency } from "./types.ts";

export interface ParsedQuote {
  price: number;
  observedAtMs: number;
  latency: QuoteDataLatency;
  sessionNote: string;
  rawContext: Record<string, unknown>;
}

const STALE_MS = 20 * 60 * 1000;

export async function fetchPolygonSnapshotQuote(symbol: string, apiKey: string): Promise<ParsedQuote | null> {
  const url =
    `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;

  const json = await res.json();
  const t = json?.ticker;
  if (!t) return null;

  const day = t.day ?? {};
  const prevDay = t.prevDay ?? {};
  const usingPrevDay = !day.o && !day.c;
  const source = usingPrevDay ? prevDay : day;
  const price = t.lastTrade?.p ?? source.c ?? null;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;

  const tradeTs = t.lastTrade?.t ?? t.updated ?? null;
  let observedAtMs = Date.now();
  if (typeof tradeTs === "number") observedAtMs = tradeTs;
  else if (typeof tradeTs === "string") {
    const parsed = Date.parse(tradeTs);
    if (Number.isFinite(parsed)) observedAtMs = parsed;
  }

  const latency: QuoteDataLatency = usingPrevDay ? "previous_close" : "live_delayed";
  const age = Date.now() - observedAtMs;
  const effectiveLatency: QuoteDataLatency =
    latency === "live_delayed" && age > STALE_MS ? "stale" : latency;

  return {
    price,
    observedAtMs,
    latency: effectiveLatency,
    sessionNote: usingPrevDay
      ? "Previous session close — not an intraday live quote."
      : "Intraday quote (typically delayed ~15 minutes).",
    rawContext: {
      todaysChangePerc: t.todaysChangePerc ?? null,
      usingPrevDay,
    },
  };
}
