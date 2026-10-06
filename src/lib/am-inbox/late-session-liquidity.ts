import type { LateSessionContinuationContext } from "@/lib/am-inbox/late-session-continuation-types";
import { computeDollarVolume } from "@/lib/screeners/dollar-volume";

/**
 * Dollar volume for AM Inbox liquidity scoring: persisted value when present,
 * otherwise price × session volume when both are verified (same contract as capture).
 */
export function resolveLateSessionDollarVolume(
  context: Pick<LateSessionContinuationContext, "dollarVolume" | "lastPrice" | "volume">,
): number | null {
  if (
    context.dollarVolume !== null &&
    context.dollarVolume !== undefined &&
    Number.isFinite(context.dollarVolume) &&
    context.dollarVolume > 0
  ) {
    return context.dollarVolume;
  }
  return computeDollarVolume(context.lastPrice, context.volume);
}
