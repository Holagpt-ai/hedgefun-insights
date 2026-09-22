import type { NormalizedIntradayBar } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";

export interface VwapSeriesPoint {
  tsMs: number;
  vwap: number;
  cumulativeVolume: number;
}

/** Typical price × volume cumulative VWAP on regular-session bars only. */
export function computeRegularSessionVwapSeries(
  bars: readonly NormalizedIntradayBar[],
): VwapSeriesPoint[] {
  const reg = bars.filter((b) => b.segment === "REGULAR");
  let cumVol = 0;
  let cumPv = 0;
  const out: VwapSeriesPoint[] = [];
  for (const bar of reg) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    cumVol += bar.volume;
    cumPv += typical * bar.volume;
    if (cumVol <= 0) continue;
    out.push({ tsMs: bar.tsMs, vwap: cumPv / cumVol, cumulativeVolume: cumVol });
  }
  return out;
}
