import type { LateSessionSourceCategory } from "@/config/late-session-handoff.config";
import type { ContinuationCategory } from "@/config/continuation.config";
import type { LateSessionContinuationContext } from "@/lib/am-inbox/late-session-continuation-types";
import {
  computeValidThroughSessionDate,
  firstAmSessionDateAfterSource,
  resolveLateSessionExpiryState,
} from "@/lib/am-inbox/late-session-expiry";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";
import type { SecurityId } from "@/types/security-identity";

export function isLateSessionSourceCategory(
  value: ContinuationCategory,
): value is LateSessionSourceCategory {
  return (
    value === "POWER_HOUR_MOMENTUM"
    || value === "AFTER_HOURS_CONTINUATION"
    || value === "STRONG_CLOSE_NEAR_HOD"
    || value === "DAY_TWO_WATCH"
  );
}

export function buildLateSessionContinuationContext(input: {
  symbol: string;
  securityId?: SecurityId | null;
  sourceSessionDate: string;
  sourceTimestamp: string;
  sourceCategory: LateSessionSourceCategory;
  /** When set, recomputes expiryState for that AM session date. */
  amSessionDate?: string | null;
  lastPrice?: number | null;
  sessionMovePct?: number | null;
  volume?: number | null;
  rvol?: number | null;
  dollarVolume?: number | null;
  closeDistanceFromHodPct?: number | null;
  afterHoursExtends?: boolean | null;
  catalystPresent?: boolean | null;
  floatTurnover?: number | null;
  workflow?: HistoricalWorkflowContext | null;
}): LateSessionContinuationContext {
  const symbol = normalizeHandoffSymbol(input.symbol) ?? input.symbol.trim().toUpperCase();
  const validFromSessionDate = firstAmSessionDateAfterSource(input.sourceSessionDate);
  const validThroughSessionDate = computeValidThroughSessionDate(
    input.sourceSessionDate,
    input.sourceCategory,
  );
  const expiry = input.amSessionDate
    ? resolveLateSessionExpiryState({
        sourceSessionDate: input.sourceSessionDate,
        sourceCategory: input.sourceCategory,
        amSessionDate: input.amSessionDate,
      })
    : {
        validFromSessionDate,
        validThroughSessionDate,
        expiryState: "active" as const,
      };
  const workflow = input.workflow;

  return {
    securityId: input.securityId ?? workflow?.securityId ?? null,
    symbol,
    sourceSessionDate: input.sourceSessionDate,
    sourceTimestamp: input.sourceTimestamp,
    sourceCategory: input.sourceCategory,
    lastPrice: input.lastPrice ?? null,
    sessionMovePct: input.sessionMovePct ?? null,
    volume: input.volume ?? null,
    rvol: input.rvol ?? null,
    dollarVolume: input.dollarVolume ?? null,
    closeDistanceFromHodPct: input.closeDistanceFromHodPct ?? null,
    afterHoursExtends: input.afterHoursExtends ?? null,
    catalystPresent: input.catalystPresent ?? null,
    floatTurnover: input.floatTurnover ?? null,
    historicalContextAvailable: workflow?.historicalContextAvailable ?? false,
    evidenceLabels: workflow?.evidenceLabels ?? [],
    sampleSizeQuality: workflow?.sampleSizeQuality ?? null,
    comparableEpisodeCount: workflow?.comparableEpisodeCount ?? 0,
    mostRecentComparableDate: workflow?.mostRecentComparableDate ?? null,
    profileFreshness: workflow?.profileFreshness ?? "UNKNOWN",
    validFromSessionDate: expiry.validFromSessionDate,
    validThroughSessionDate: expiry.validThroughSessionDate,
    expiryState: expiry.expiryState,
  };
}
