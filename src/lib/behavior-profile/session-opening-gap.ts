import type { SecurityDailyHistory } from "@/types/security-intelligence";

/** Opening gap vs prior session close from verified daily history (split-adjusted when stored). */
export function sessionOpeningGapPct(
  daily: SecurityDailyHistory | undefined,
): number | null {
  if (!daily) return null;
  const prev = daily.previousClose;
  const open = daily.open;
  if (
    prev == null
    || open == null
    || !Number.isFinite(prev)
    || prev === 0
    || !Number.isFinite(open)
  ) {
    return null;
  }
  return ((open - prev) / prev) * 100;
}
