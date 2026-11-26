/**
 * Bounded Fly campaign accounting (Batch 33.9) — restored across script invocations.
 */

import { HISTORICAL_CATCHUP_LIMITS } from "@/config/historical-catchup.config";

export type CatchUpCampaignState = {
  campaignId: string;
  executionsCompleted: number;
  maxExecutions: number;
  providerUsed: number;
  providerReservedUncertain: number;
  maxProviderRequests: number;
  queueAfterSymbol: string | null;
  pendingRun: boolean;
  pendingProviderReservation: number;
};

export class CatchUpCampaignBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatchUpCampaignBudgetError";
  }
}

export function providerBudgetTotal(state: CatchUpCampaignState): number {
  return state.providerUsed + state.providerReservedUncertain;
}

export function remainingProviderBudget(state: CatchUpCampaignState): number {
  return state.maxProviderRequests - providerBudgetTotal(state);
}

export function assertCampaignCanStart(
  state: CatchUpCampaignState,
  maxProviderPerRun: number = HISTORICAL_CATCHUP_LIMITS.maxProviderRequestsPerRun,
): void {
  if (state.pendingRun) {
    throw new CatchUpCampaignBudgetError(
      "pending run must be reconciled before starting another execution",
    );
  }
  if (state.executionsCompleted >= state.maxExecutions) {
    throw new CatchUpCampaignBudgetError(
      `execution budget exhausted (${state.executionsCompleted}/${state.maxExecutions})`,
    );
  }
  if (providerBudgetTotal(state) >= state.maxProviderRequests) {
    throw new CatchUpCampaignBudgetError(
      `provider budget exhausted (${providerBudgetTotal(state)}/${state.maxProviderRequests})`,
    );
  }
  const remaining = remainingProviderBudget(state);
  if (remaining < maxProviderPerRun) {
    throw new CatchUpCampaignBudgetError(
      `remaining provider budget ${remaining} is below next run allowance ${maxProviderPerRun}`,
    );
  }
}

/** Persist this before launching a machine. Counts the execution and reserves full per-run exposure. */
export function reserveCampaignRun(
  state: CatchUpCampaignState,
  maxProviderPerRun: number = HISTORICAL_CATCHUP_LIMITS.maxProviderRequestsPerRun,
): CatchUpCampaignState {
  assertCampaignCanStart(state, maxProviderPerRun);
  return {
    ...state,
    executionsCompleted: state.executionsCompleted + 1,
    providerReservedUncertain: state.providerReservedUncertain + maxProviderPerRun,
    pendingRun: true,
    pendingProviderReservation: maxProviderPerRun,
  };
}

/** Apply measured usage after the machine exits. Unknown measurements keep the full per-run reservation. */
export function reconcileCampaignRun(
  state: CatchUpCampaignState,
  input: {
    runProvider: number | null;
    providerMeasurementReliable: boolean;
    maxProviderPerRun?: number;
  },
): CatchUpCampaignState {
  const reserved = state.pendingProviderReservation;
  const exposure = reserved > 0
    ? reserved
    : (input.maxProviderPerRun ?? HISTORICAL_CATCHUP_LIMITS.maxProviderRequestsPerRun);
  const next: CatchUpCampaignState = {
    ...state,
    pendingRun: false,
    pendingProviderReservation: 0,
    providerReservedUncertain: state.providerReservedUncertain - reserved,
  };
  if (input.providerMeasurementReliable && input.runProvider !== null && input.runProvider > 0) {
    next.providerUsed += input.runProvider;
  } else {
    next.providerReservedUncertain += exposure;
  }
  return next;
}

/** Crash recovery: keep full reserved exposure, clear pending so a later run can start. */
export function abandonPendingRunAsUnknown(
  state: CatchUpCampaignState,
  maxProviderPerRun: number = HISTORICAL_CATCHUP_LIMITS.maxProviderRequestsPerRun,
): CatchUpCampaignState {
  if (!state.pendingRun) return state;
  return reconcileCampaignRun(state, {
    runProvider: null,
    providerMeasurementReliable: false,
    maxProviderPerRun,
  });
}

export function applyCampaignRunOutcome(
  state: CatchUpCampaignState,
  input: {
    exitCode: number;
    runProvider: number | null;
    providerMeasurementReliable: boolean;
    maxProviderPerRun?: number;
  },
): CatchUpCampaignState {
  const maxProviderPerRun = input.maxProviderPerRun ?? HISTORICAL_CATCHUP_LIMITS.maxProviderRequestsPerRun;
  const reserved = reserveCampaignRun(state, maxProviderPerRun);
  return reconcileCampaignRun(reserved, {
    runProvider: input.runProvider,
    providerMeasurementReliable: input.providerMeasurementReliable,
    maxProviderPerRun,
  });
}

export function parseCatchUpCampaignState(raw: unknown): CatchUpCampaignState {
  if (!raw || typeof raw !== "object") {
    throw new CatchUpCampaignBudgetError("campaign state must be an object");
  }
  const o = raw as Record<string, unknown>;
  const required = [
    "campaignId",
    "executionsCompleted",
    "maxExecutions",
    "providerUsed",
    "providerReservedUncertain",
    "maxProviderRequests",
  ] as const;
  for (const key of required) {
    if (o[key] === undefined) {
      throw new CatchUpCampaignBudgetError(`campaign state missing ${key}`);
    }
  }
  return {
    campaignId: String(o.campaignId),
    executionsCompleted: Number(o.executionsCompleted),
    maxExecutions: Number(o.maxExecutions),
    providerUsed: Number(o.providerUsed),
    providerReservedUncertain: Number(o.providerReservedUncertain),
    maxProviderRequests: Number(o.maxProviderRequests),
    queueAfterSymbol: typeof o.queueAfterSymbol === "string" ? o.queueAfterSymbol.toUpperCase() : null,
    pendingRun: o.pendingRun === true,
    pendingProviderReservation: Number(o.pendingProviderReservation ?? 0) || 0,
  };
}
