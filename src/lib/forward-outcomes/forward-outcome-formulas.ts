import { FORWARD_OUTCOME_FORMULA } from "@/config/forward-outcomes.config";

export function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (from === 0) return null;
  const pct = ((to - from) / from) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function closePositionFromOhlc(input: {
  high: number | null;
  low: number | null;
  close: number | null;
}): number | null {
  if (input.high === null || input.low === null || input.close === null) return null;
  if (!Number.isFinite(input.high) || !Number.isFinite(input.low) || !Number.isFinite(input.close)) {
    return null;
  }
  const range = input.high - input.low;
  if (range <= 0) return null;
  const position = (input.close - input.low) / range;
  return Number.isFinite(position) ? position : null;
}

export function compareOptionalBoolean(
  a: number | null,
  b: number | null,
  relation: "above" | "below",
): boolean | null {
  if (a === null || b === null) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return relation === "above" ? a > b : a < b;
}

export function compareExceeded(a: number | null, b: number | null): boolean | null {
  if (a === null || b === null) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a > b;
}

export function compareBroke(a: number | null, b: number | null): boolean | null {
  if (a === null || b === null) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a < b;
}

export const forwardOutcomeFormulaDoc = FORWARD_OUTCOME_FORMULA;
