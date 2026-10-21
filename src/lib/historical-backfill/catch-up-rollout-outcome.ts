/**
 * Distinguish full catch-up completion from a bounded Fly process stop (Batch 33.1).
 */

export type CatchUpStopReason =
  | "none"
  | "provider_request_limit"
  | "fly_run_limits"
  | "job_paused"
  | "no_progress"
  | "interrupted_job_incomplete";

export type CatchUpRolloutOutcome = "complete" | "partial";

export function resolveCatchUpRolloutOutcome(input: {
  stopReason: CatchUpStopReason;
  eligibleSymbolsRemaining: number;
  interruptedJobId: string | null;
}): CatchUpRolloutOutcome {
  if (input.stopReason !== "none") return "partial";
  if (input.interruptedJobId !== null) return "partial";
  if (input.eligibleSymbolsRemaining > 0) return "partial";
  return "complete";
}

export function catchUpRolloutEventName(outcome: CatchUpRolloutOutcome): "rollout_complete" | "catch_up_partial_stop" {
  return outcome === "complete" ? "rollout_complete" : "catch_up_partial_stop";
}
