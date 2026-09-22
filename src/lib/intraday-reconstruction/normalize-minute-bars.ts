import type { NormalizedIntradayBar, IntradaySessionSegment } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";

export interface RawPolygonAggregateBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

function etMinutesSinceMidnight(tsMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(tsMs));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function classifyIntradaySegment(tsMs: number): IntradaySessionSegment {
  const m = etMinutesSinceMidnight(tsMs);
  if (m >= 4 * 60 && m < 9 * 60 + 30) return "PREMARKET";
  if (m >= 9 * 60 + 30 && m < 16 * 60) return "REGULAR";
  if (m >= 16 * 60 && m < 20 * 60) return "AFTER_HOURS";
  return "OTHER";
}

export function normalizePolygonMinuteBars(
  results: readonly RawPolygonAggregateBar[],
  sessionDate: string,
): NormalizedIntradayBar[] {
  const bars: NormalizedIntradayBar[] = [];
  for (const row of results) {
    if (!Number.isFinite(row.t) || !Number.isFinite(row.o) || !Number.isFinite(row.h)
      || !Number.isFinite(row.l) || !Number.isFinite(row.c)) continue;
    const tsMs = row.t;
    const isoDate = new Date(tsMs).toISOString().slice(0, 10);
    if (isoDate !== sessionDate) continue;
    const volume = Number.isFinite(row.v) ? row.v : 0;
    bars.push({
      tsMs,
      open: row.o,
      high: row.h,
      low: row.l,
      close: row.c,
      volume,
      segment: classifyIntradaySegment(tsMs),
    });
  }
  bars.sort((a, b) => a.tsMs - b.tsMs);
  return bars;
}
