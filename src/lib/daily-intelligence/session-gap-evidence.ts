/**
 * Consistent session-gap evidence for pre-market surfaces (Morning Opportunity, gappers restoration).
 * Does not invent metrics — only interprets persisted gap_percent vs change_percent.
 */

/** Display gap: explicit gap_percent wins; else session move vs prior close. */
export function resolveSessionGapPercent(input: {
  gap_percent?: number | null;
  change_percent?: number | null;
}): number | null {
  const gap = finite(input.gap_percent);
  if (gap !== null) return gap;
  return finite(input.change_percent);
}

/** Eligibility gap for gap-continuation (requires explicit gap or session move). */
export function sessionGapEligible(
  input: { gap_percent?: number | null; change_percent?: number | null },
  minAbsPercent: number,
): boolean {
  const gap = resolveSessionGapPercent(input);
  return gap !== null && Math.abs(gap) >= minAbsPercent;
}

function finite(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}
