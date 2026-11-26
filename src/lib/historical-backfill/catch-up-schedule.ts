/**
 * Post-session catch-up target resolution (operator / external scheduler — not activated in prod).
 */
import { lastCompletedUsTradingSession } from "@/lib/radar/carryover-session";

/** Latest completed U.S. equity session (ET boundaries, after-hours end). */
export function resolveLatestCompletedTradingSession(now: Date = new Date()): string {
  return lastCompletedUsTradingSession(now).sessionDate;
}

/** Five-year rolling floor (calendar) from a reference session — policy cap only. */
export function rollingFiveYearEntitlementFloorCap(referenceSession: string): string {
  const [y, m, d] = referenceSession.split("-").map(Number);
  const floor = new Date(Date.UTC(y - 5, m - 1, d));
  const y2 = floor.getUTCFullYear();
  const m2 = String(floor.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(floor.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}