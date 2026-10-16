import type { LateSessionContinuationContext } from "@/lib/am-inbox/late-session-continuation-types";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";

/**
 * True when symbol-keyed historical workflow cache may enrich a persisted handoff.
 * Rejects cross-security contamination when both sides carry security IDs.
 */
export function historicalWorkflowMatchesHandoff(
  context: Pick<LateSessionContinuationContext, "symbol" | "securityId">,
  workflow: HistoricalWorkflowContext | null | undefined,
): boolean {
  if (!workflow) return false;
  const handoffSymbol = context.symbol.trim().toUpperCase();
  const workflowSymbol = workflow.symbol.trim().toUpperCase();
  if (!handoffSymbol || handoffSymbol !== workflowSymbol) return false;

  const handoffId = context.securityId;
  const workflowId = workflow.securityId;
  if (handoffId && workflowId && handoffId !== workflowId) return false;
  if (handoffId && !workflowId) return false;

  return true;
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
