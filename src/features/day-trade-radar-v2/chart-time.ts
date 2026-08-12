/**
 * Chart time helpers for lightweight-charts.
 * Intraday bars must remain distinct UTC timestamps — never collapse to YYYY-MM-DD.
 */

export type ChartTimeValue = number | string;

/**
 * Normalize a provider bar timestamp for lightweight-charts.
 * - ISO / epoch-ms / epoch-s → UTC unix seconds (number)
 * - Pure calendar date `YYYY-MM-DD` → business-day string (daily series only)
 */
export function normalizeChartBarTime(raw: unknown): ChartTimeValue | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Heuristic: ms vs seconds
    const seconds = raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
    return seconds > 0 ? seconds : null;
  }
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const trimmed = raw.trim();

  // Business day only — keep as string for daily charts.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

/** True when the series uses intraday (UTCTimestamp) values. */
export function chartSeriesIsIntraday(times: readonly ChartTimeValue[]): boolean {
  return times.some((t) => typeof t === "number");
}

/**
 * Prove same-day intraday bars stay distinct and ordered after normalization.
 * Exported for regression tests.
 */
export function assertDistinctIntradayTimes(
  isoTimestamps: readonly string[],
): number[] {
  const times = isoTimestamps.map((iso) => normalizeChartBarTime(iso));
  if (times.some((t) => t === null || typeof t !== "number")) {
    throw new Error("expected numeric intraday times");
  }
  const nums = times as number[];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] <= nums[i - 1]) {
      throw new Error("intraday times must be strictly increasing");
    }
  }
  const unique = new Set(nums);
  if (unique.size !== nums.length) {
    throw new Error("intraday times must be distinct");
  }
  return nums;
}
