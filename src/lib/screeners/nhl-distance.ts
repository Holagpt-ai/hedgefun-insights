import type { RangeEvent } from "@/lib/screeners/contract";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";

/**
 * Signed distance from the validated prior 52-week baseline.
 * New high: positive % above prior 52W high (session high vs baseline).
 * New low: negative % below prior 52W low (session low vs baseline).
 * "both": uses the new-high distance when session high clears baseline.
 */
function distanceAbovePriorHigh(
  priorHigh: number,
  dayHigh: number,
): number | null {
  const pct = ((dayHigh - priorHigh) / priorHigh) * 100;
  return Number.isFinite(pct) ? Math.round(pct * 100) / 100 : null;
}

function distanceBelowPriorLow(priorLow: number, dayLow: number): number | null {
  const pct = ((dayLow - priorLow) / priorLow) * 100;
  return Number.isFinite(pct) ? Math.round(pct * 100) / 100 : null;
}

export function computeNhlDistanceSides(input: {
  range_event: RangeEvent | null;
  high_52w: number | null;
  low_52w: number | null;
  day_high: number | null;
  day_low: number | null;
}): { highSidePct: number | null; lowSidePct: number | null } {
  const event = input.range_event;
  if (!event) return { highSidePct: null, lowSidePct: null };

  const priorHigh = finiteMetric(input.high_52w);
  const priorLow = finiteMetric(input.low_52w);
  const dayHigh = finiteMetric(input.day_high);
  const dayLow = finiteMetric(input.day_low);

  let highSidePct: number | null = null;
  let lowSidePct: number | null = null;

  if ((event === "new_high" || event === "both") && priorHigh !== null && priorHigh > 0 && dayHigh !== null) {
    highSidePct = distanceAbovePriorHigh(priorHigh, dayHigh);
  }
  if ((event === "new_low" || event === "both") && priorLow !== null && priorLow > 0 && dayLow !== null) {
    lowSidePct = distanceBelowPriorLow(priorLow, dayLow);
  }

  return { highSidePct, lowSidePct };
}

export function computeNhlDistancePct(input: {
  range_event: RangeEvent | null;
  high_52w: number | null;
  low_52w: number | null;
  day_high: number | null;
  day_low: number | null;
}): number | null {
  const { highSidePct, lowSidePct } = computeNhlDistanceSides(input);
  const event = input.range_event;
  if (event === "new_low") return lowSidePct;
  if (event === "new_high") return highSidePct;
  if (event === "both") return highSidePct ?? lowSidePct;
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
  sides?: { highSidePct: number | null; lowSidePct: number | null },
): string {
  if (rangeEvent === "both" && sides) {
    const parts: string[] = [];
    if (sides.highSidePct !== null) {
      parts.push(`+${Math.abs(sides.highSidePct).toFixed(2)}% above prior 52W high`);
    }
    if (sides.lowSidePct !== null) {
      parts.push(`${sides.lowSidePct.toFixed(2)}% below prior 52W low`);
    }
    return parts.length > 0 ? parts.join(" · ") : "—";
  }
  if (distancePct === null) return "—";
  if (rangeEvent === "new_low") {
    return `${distancePct.toFixed(2)}% below prior 52W low`;
  }
  if (rangeEvent === "new_high") {
    return `+${Math.abs(distancePct).toFixed(2)}% above prior 52W high`;
  }
  return formatNhlDistancePct(distancePct);
}
