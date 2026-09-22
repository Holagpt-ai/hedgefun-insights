import type { LateSessionSourceCategory } from "@/config/late-session-handoff.config";
import type { LateSessionHandoffExpiryState } from "@/lib/am-inbox/late-session-continuation-types";
import { nextTradingDay } from "@/lib/market-calendar";

export function firstAmSessionDateAfterSource(sourceSessionDate: string): string {
  return nextTradingDay(sourceSessionDate).date;
}

/**
 * Power Hour / Strong Close / After-Hours: next trading session only.
 * Day-Two Watch: next session plus one additional session.
 */
export function computeValidThroughSessionDate(
  sourceSessionDate: string,
  category: LateSessionSourceCategory,
): string {
  const firstNext = firstAmSessionDateAfterSource(sourceSessionDate);
  if (category === "DAY_TWO_WATCH") {
    return nextTradingDay(firstNext).date;
  }
  return firstNext;
}

export function resolveLateSessionExpiryState(input: {
  sourceSessionDate: string;
  sourceCategory: LateSessionSourceCategory;
  amSessionDate: string;
}): {
  validFromSessionDate: string;
  validThroughSessionDate: string;
  expiryState: LateSessionHandoffExpiryState;
} {
  const validFromSessionDate = firstAmSessionDateAfterSource(input.sourceSessionDate);
  const through = computeValidThroughSessionDate(input.sourceSessionDate, input.sourceCategory);

  let active = false;
  if (input.sourceCategory === "DAY_TWO_WATCH") {
    active = input.amSessionDate >= validFromSessionDate && input.amSessionDate <= through;
  } else {
    active = input.amSessionDate === validFromSessionDate;
  }

  return {
    validFromSessionDate,
    validThroughSessionDate: through,
    expiryState: active ? "active" : "expired",
  };
}
