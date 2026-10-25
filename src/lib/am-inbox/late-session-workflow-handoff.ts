import type { LateSessionContinuationContext } from "@/lib/am-inbox/late-session-continuation-types";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import {
  handoffIdentity,
  historicalWorkflowMatchesRequest,
} from "@/lib/historical-workflow/historical-handoff-identity";

/**
 * True when symbol-keyed historical workflow cache may enrich a persisted handoff.
 * Rejects cross-security contamination when both sides carry security IDs.
 */
export function historicalWorkflowMatchesHandoff(
  context: Pick<LateSessionContinuationContext, "symbol" | "securityId">,
  workflow: HistoricalWorkflowContext | null | undefined,
): boolean {
  const identity = handoffIdentity(context.symbol, context.securityId);
  if (!identity) return false;
  return historicalWorkflowMatchesRequest(identity, workflow);
}

export function enrichHandoffContextFromHistoricalWorkflow(
  context: LateSessionContinuationContext,
  workflow: HistoricalWorkflowContext | null,
): { context: LateSessionContinuationContext; workflow: HistoricalWorkflowContext | null } {
  if (!historicalWorkflowMatchesHandoff(context, workflow) || !workflow) {
    return { context, workflow: null };
  }

  return {
    context: {
      ...context,
      securityId: context.securityId ?? workflow.securityId ?? null,
      historicalContextAvailable:
        workflow.historicalContextAvailable || context.historicalContextAvailable,
      evidenceLabels:
        context.evidenceLabels.length > 0 ? context.evidenceLabels : workflow.evidenceLabels,
      sampleSizeQuality: context.sampleSizeQuality ?? workflow.sampleSizeQuality,
      comparableEpisodeCount:
        context.comparableEpisodeCount > 0
          ? context.comparableEpisodeCount
          : workflow.comparableEpisodeCount,
      mostRecentComparableDate:
        context.mostRecentComparableDate ?? workflow.mostRecentComparableDate,
      profileFreshness:
        context.profileFreshness !== "UNKNOWN" ? context.profileFreshness : workflow.profileFreshness,
    },
    workflow,
  };
}
