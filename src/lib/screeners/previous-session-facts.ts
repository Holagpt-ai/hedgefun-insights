/**
 * Verified previous-session facts persisted on radar_v22_candidates.
 *
 * previous_close is recovered from the screener regular-session pair:
 * regular close (day.c) and the verified regular-session move
 * (day.c - prevDay.c) / prevDay.c. It is never taken from the Radar last,
 * after-hours last, premarket last, open, VWAP, or a short-window move.
 *
 * prior_session_volume is the verified previous completed session total
 * (prevDay.v). It does not depend on whether the Radar last matches the
 * regular-session reference price.
 *
 * Missing or unverified inputs stay null. Zero is never stored as a stand-in.
 */

export interface PreviousSessionQuoteInput {
  /** Polygon day.c. Zero means the enrichment quote had no verified regular close. */
  regularClose: number | null | undefined;
  /** Polygon prevDay.c. Zero means that close was not verified. */
  previousClose: number | null | undefined;
  /** Verified regular-session move. Meaningful only when both closes are positive. */
  changePercent: number | null | undefined;
  /** Polygon prevDay.v. Zero means prior volume was not verified. */
  priorVolume: number | null | undefined;
  /** Current Radar last. Used only for the split-scale check against day.c. */
  lastPrice: number | null | undefined;
}

export interface PersistedPreviousSessionFacts {
  previous_close: number | null;
  prior_session_volume: number | null;
}

function positiveFinite(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) return null;
  return value;
}

/**
 * True when the regular-session reference and the Radar last differ by a
 * near-integer factor of 2× or more. A real session move against the previous
 * close is not this comparison.
 */
function regularAndLastImplySplitScale(regularClose: number, lastPrice: number): boolean {
  const ratio = Math.max(regularClose, lastPrice) / Math.min(regularClose, lastPrice);
  if (!Number.isFinite(ratio) || ratio < 2) return false;
  const rounded = Math.round(ratio);
  if (rounded < 2) return false;
  return Math.abs(ratio - rounded) / rounded <= 0.03;
}

export function candidatePreviousSessionFacts(
  input: PreviousSessionQuoteInput,
): PersistedPreviousSessionFacts {
  const prior = positiveFinite(input.priorVolume);
  const regular = positiveFinite(input.regularClose);
  const verifiedPrevious = positiveFinite(input.previousClose);
  const change = input.changePercent;
  let previous: number | null = null;
  if (
    regular !== null &&
    verifiedPrevious !== null &&
    typeof change === "number" &&
    Number.isFinite(change)
  ) {
    const denominator = 1 + change / 100;
    if (Number.isFinite(denominator) && denominator > 0) {
      const recovered = regular / denominator;
      if (Number.isFinite(recovered) && recovered > 0) previous = recovered;
    }
  }
  const last = positiveFinite(input.lastPrice);
  if (
    previous !== null &&
    regular !== null &&
    last !== null &&
    regularAndLastImplySplitScale(regular, last)
  ) {
    previous = null;
  }
  return {
    previous_close: previous,
    prior_session_volume: prior,
  };
}
