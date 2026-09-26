import {
  CONTINUATION_AFTER_HOURS_EXTENSION_MIN_PCT,
  CONTINUATION_CLOSING_REJECTION_CAUTION_PCT,
  CONTINUATION_CLOSING_REJECTION_DISQUALIFY_PCT,
} from "@/config/continuation.config";
import { isFiniteNumber, isPositiveFinite } from "@/lib/screeners/contract";
import type { ContinuationTriState } from "@/types/continuation";

/** (sessionHigh - lastPrice) / sessionHigh as a positive percent distance from HOD. */
export function computeClosingRejectionPct(
  sessionHigh: number | null | undefined,
  lastPrice: number | null | undefined,
): number | null {
  if (!isPositiveFinite(sessionHigh) || !isPositiveFinite(lastPrice)) return null;
  if (lastPrice > sessionHigh) return 0;
  const pct = ((sessionHigh - lastPrice) / sessionHigh) * 100;
  return Number.isFinite(pct) && pct >= 0 ? pct : null;
}

export function classifyClosingRejection(
  rejectionPct: number | null | undefined,
): ContinuationTriState {
  if (rejectionPct === null || rejectionPct === undefined || !Number.isFinite(rejectionPct)) {
    return "UNKNOWN";
  }
  if (rejectionPct >= CONTINUATION_CLOSING_REJECTION_DISQUALIFY_PCT) return "TRUE";
  if (rejectionPct >= CONTINUATION_CLOSING_REJECTION_CAUTION_PCT) return "UNKNOWN";
  return "FALSE";
}

/** (afterHoursLast - regularSessionClose) / regularSessionClose; negatives preserved. */
export function computeAfterHoursExtensionPct(
  regularSessionClose: number | null | undefined,
  afterHoursLast: number | null | undefined,
): number | null {
  if (!isPositiveFinite(regularSessionClose) || afterHoursLast === null || afterHoursLast === undefined) {
    return null;
  }
  if (!Number.isFinite(afterHoursLast)) return null;
  const pct = ((afterHoursLast - regularSessionClose) / regularSessionClose) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function classifyAfterHoursExtendsSession(input: {
  sessionKind: string | null | undefined;
  extensionPct: number | null;
  distanceFromHodPct: number | null | undefined;
  ahParticipationStrong: boolean;
}): ContinuationTriState {
  if (input.sessionKind !== "after-hours") return "UNKNOWN";
  if (input.ahParticipationStrong) return "TRUE";
  if (input.extensionPct === null) return "UNKNOWN";
  if (input.extensionPct < CONTINUATION_AFTER_HOURS_EXTENSION_MIN_PCT) return "FALSE";
  const hodDistance = input.distanceFromHodPct;
  if (isFiniteNumber(hodDistance) && hodDistance <= 3) return "TRUE";
  if (input.extensionPct >= 0) return "TRUE";
  return "FALSE";
}
