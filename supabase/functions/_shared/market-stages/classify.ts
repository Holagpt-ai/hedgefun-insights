// Stocksist Market Stages — Phase P1
// Deterministic Weinstein-style weekly candidate classifier.
// No persistence, transitions, providers, storage, or UI.

export const ALGORITHM_ID = "mss.weinstein.v1" as const;

/** Expected spacing between consecutive completed weekly bars. */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Max allowed gap between consecutive bars in the latest 40-bar window.
 * Exactly two missing weekly intervals (gap of 3 weeks) is allowed;
 * more than two missing intervals is insufficient_data.
 */
export const MAX_ALLOWED_WEEKLY_GAP_MS = 3 * WEEK_MS;

export const MIN_WEEKLY_BARS = 40;

export type WeeklyBar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type ClassifyStatus = "ok" | "insufficient_data" | "invalid_input";

export type CandidateStage =
  | "stage_1"
  | "stage_2"
  | "stage_3"
  | "stage_4"
  | "unclassified";

export const REASON_CODES = [
  "too_few_bars",
  "non_ascending_timestamps",
  "duplicate_timestamps",
  "nonfinite_values",
  "invalid_ohlc",
  "negative_volume",
  "excessive_weekly_gap",
  "rising_ma",
  "falling_ma",
  "flat_ma",
  "above_sma30",
  "below_sma30",
  "equal_sma30",
  "breakout_26",
  "breakdown_26",
  "volume_confirmed",
  "zero_width_range",
  "stage_1",
  "stage_2",
  "stage_3",
  "stage_4",
  "unclassified",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export type ClassifyMetrics = {
  sma30: number | null;
  sma30TenWeeksAgo: number | null;
  slopePct10: number | null;
  rangeHigh26: number | null;
  rangeLow26: number | null;
  rangePosition: number | null;
  averageVolume10: number | null;
  volumeRatio: number | null;
  aboveSma30: boolean | null;
  belowSma30: boolean | null;
  breakout26: boolean | null;
  breakdown26: boolean | null;
  volumeConfirmed: boolean | null;
};

export type ClassifyResult = {
  algorithmId: typeof ALGORITHM_ID;
  status: ClassifyStatus;
  candidateStage: CandidateStage | null;
  reasonCodes: ReasonCode[];
  metrics: ClassifyMetrics;
};

function emptyMetrics(): ClassifyMetrics {
  return {
    sma30: null,
    sma30TenWeeksAgo: null,
    slopePct10: null,
    rangeHigh26: null,
    rangeLow26: null,
    rangePosition: null,
    averageVolume10: null,
    volumeRatio: null,
    aboveSma30: null,
    belowSma30: null,
    breakout26: null,
    breakdown26: null,
    volumeConfirmed: null,
  };
}

function result(
  status: ClassifyStatus,
  candidateStage: CandidateStage | null,
  reasonCodes: ReasonCode[],
  metrics: ClassifyMetrics = emptyMetrics(),
): ClassifyResult {
  return {
    algorithmId: ALGORITHM_ID,
    status,
    candidateStage,
    reasonCodes,
    metrics,
  };
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function mean(values: number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function validateBars(bars: WeeklyBar[]): ReasonCode | null {
  if (!Array.isArray(bars) || bars.length < MIN_WEEKLY_BARS) {
    return "too_few_bars";
  }

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (
      !b ||
      !isFiniteNumber(b.t) ||
      !isFiniteNumber(b.o) ||
      !isFiniteNumber(b.h) ||
      !isFiniteNumber(b.l) ||
      !isFiniteNumber(b.c) ||
      !isFiniteNumber(b.v)
    ) {
      return "nonfinite_values";
    }
    if (!(b.o > 0) || !(b.h > 0) || !(b.l > 0) || !(b.c > 0)) {
      return "invalid_ohlc";
    }
    if (
      !(b.l <= b.o) || !(b.l <= b.c) || !(b.h >= b.o) || !(b.h >= b.c) ||
      !(b.l <= b.h)
    ) {
      return "invalid_ohlc";
    }
    if (b.v < 0) return "negative_volume";

    if (i > 0) {
      const prev = bars[i - 1]!;
      if (b.t === prev.t) return "duplicate_timestamps";
      if (!(b.t > prev.t)) return "non_ascending_timestamps";
    }
  }

  return null;
}

/**
 * Within the most recent 40-bar window, reject gaps that imply more than
 * two consecutive missing weekly intervals.
 */
function hasExcessiveWeeklyGap(bars: WeeklyBar[]): boolean {
  const start = bars.length - MIN_WEEKLY_BARS;
  for (let i = start + 1; i < bars.length; i++) {
    const gap = bars[i]!.t - bars[i - 1]!.t;
    if (gap > MAX_ALLOWED_WEEKLY_GAP_MS) return true;
  }
  return false;
}

/**
 * Classify one raw weekly candidate stage from completed adjusted weekly bars.
 * Does not mutate `bars`. Does not apply persistence or transitions.
 */
export function classifyWeeklyCandidate(bars: WeeklyBar[]): ClassifyResult {
  const validationError = validateBars(bars);
  if (validationError === "too_few_bars") {
    return result("insufficient_data", null, [validationError]);
  }
  if (validationError !== null) {
    return result("invalid_input", null, [validationError]);
  }

  if (hasExcessiveWeeklyGap(bars)) {
    return result("insufficient_data", null, ["excessive_weekly_gap"]);
  }

  const n = bars.length;
  const current = bars[n - 1]!;

  const closes30 = bars.slice(n - 30, n).map((b) => b.c);
  const closes30Ago = bars.slice(n - 40, n - 10).map((b) => b.c);
  const sma30 = mean(closes30);
  const sma30TenWeeksAgo = mean(closes30Ago);

  if (
    !(sma30TenWeeksAgo > 0) || !Number.isFinite(sma30) ||
    !Number.isFinite(sma30TenWeeksAgo)
  ) {
    return result("insufficient_data", null, ["nonfinite_values"]);
  }

  const slopePct10 = (sma30 - sma30TenWeeksAgo) / sma30TenWeeksAgo;
  const rising = slopePct10 >= 0.02;
  const falling = slopePct10 <= -0.02;
  const flat = !rising && !falling;

  const aboveSma30 = current.c > sma30;
  const belowSma30 = current.c < sma30;

  const prior26 = bars.slice(n - 27, n - 1);
  let rangeHigh26 = -Infinity;
  let rangeLow26 = Infinity;
  for (const b of prior26) {
    if (b.h > rangeHigh26) rangeHigh26 = b.h;
    if (b.l < rangeLow26) rangeLow26 = b.l;
  }

  const zeroWidth = !(rangeHigh26 > rangeLow26);
  const rangePosition = zeroWidth
    ? null
    : (current.c - rangeLow26) / (rangeHigh26 - rangeLow26);

  const breakout26 = current.c > rangeHigh26;
  const breakdown26 = current.c < rangeLow26;

  const priorVol10 = bars.slice(n - 11, n - 1).map((b) => b.v);
  const averageVolume10 = mean(priorVol10);
  let volumeRatio: number | null;
  let volumeConfirmed: boolean;
  if (averageVolume10 > 0) {
    volumeRatio = current.v / averageVolume10;
    volumeConfirmed = volumeRatio >= 1.20;
  } else {
    volumeRatio = null;
    volumeConfirmed = false;
  }

  const metrics: ClassifyMetrics = {
    sma30,
    sma30TenWeeksAgo,
    slopePct10,
    rangeHigh26,
    rangeLow26,
    rangePosition,
    averageVolume10,
    volumeRatio,
    aboveSma30,
    belowSma30,
    breakout26,
    breakdown26,
    volumeConfirmed,
  };

  const reasonCodes: ReasonCode[] = [];
  if (rising) reasonCodes.push("rising_ma");
  else if (falling) reasonCodes.push("falling_ma");
  else reasonCodes.push("flat_ma");

  if (aboveSma30) reasonCodes.push("above_sma30");
  else if (belowSma30) reasonCodes.push("below_sma30");
  else reasonCodes.push("equal_sma30");

  if (zeroWidth) reasonCodes.push("zero_width_range");
  if (breakout26) reasonCodes.push("breakout_26");
  if (breakdown26) reasonCodes.push("breakdown_26");
  if (volumeConfirmed) reasonCodes.push("volume_confirmed");

  // Precedence: Stage 2 → Stage 4 → Stage 3 → Stage 1 → Unclassified
  if (aboveSma30 && rising) {
    reasonCodes.push("stage_2");
    return result("ok", "stage_2", reasonCodes, metrics);
  }
  if (belowSma30 && falling) {
    reasonCodes.push("stage_4");
    return result("ok", "stage_4", reasonCodes, metrics);
  }
  const stage3 = (aboveSma30 && flat && rangePosition !== null &&
    rangePosition >= 0.70) || (aboveSma30 && falling);
  if (stage3) {
    reasonCodes.push("stage_3");
    return result("ok", "stage_3", reasonCodes, metrics);
  }
  if (
    flat && rangePosition !== null && rangePosition >= 0.20 &&
    rangePosition <= 0.80
  ) {
    reasonCodes.push("stage_1");
    return result("ok", "stage_1", reasonCodes, metrics);
  }

  reasonCodes.push("unclassified");
  return result("ok", "unclassified", reasonCodes, metrics);
}
