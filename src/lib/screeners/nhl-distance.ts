import type { RangeEvent } from "@/lib/screeners/contract";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";

/**
 * Signed distance from the validated prior 52-week baseline.
 * New high: positive % above prior 52W high (session high vs baseline).
 * New low: negative % below prior 52W low (session low vs baseline).
 * "both": uses the new-high distance when session high clears baseline.
 */
export function computeNhlDistancePct(input: {
  range_event: RangeEvent | null;
  high_52w: number | null;
  low_52w: number | null;
  day_high: number | null;
  day_low: number | null;
}): number | null {
  const event = input.range_event;
  if (!event) return null;

  const priorHigh = finiteMetric(input.high_52w);
  const priorLow = finiteMetric(input.low_52w);
  const dayHigh = finiteMetric(input.day_high);
  const dayLow = finiteMetric(input.day_low);

  if (event === "new_high" || event === "both") {
    if (priorHigh === null || !(priorHigh > 0) || dayHigh === null) return null;
    const pct = ((dayHigh - priorHigh) / priorHigh) * 100;
    return Number.isFinite(pct) ? Math.round(pct * 100) / 100 : null;
  }

  if (event === "new_low") {
    if (priorLow === null || !(priorLow > 0) || dayLow === null) return null;
    const pct = ((dayLow - priorLow) / priorLow) * 100;
    return Number.isFinite(pct) ? Math.round(pct * 100) / 100 : null;
  }

  return null;
}

export function formatNhlDistancePct(distancePct: number | null): string {
  if (distancePct === null) return "—";
  const sign = distancePct > 0 ? "+" : "";
  return `${sign}${distancePct.toFixed(2)}%`;
}

export function formatNhlDistanceLabel(
  rangeEvent: RangeEvent | null,
  distancePct: number | null,
): string {
  if (distancePct === null) return "—";
  const magnitude = formatNhlDistancePct(Math.abs(distancePct));
  if (rangeEvent === "new_low") {
    return `-${magnitude.replace("+", "")} below prior 52W low`;
  }
  if (rangeEvent === "new_high" || rangeEvent === "both") {
    return `+${Math.abs(distancePct).toFixed(2)}% above prior 52W high`;
  }
  return formatNhlDistancePct(distancePct);
}
