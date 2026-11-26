/**
 * Bounded Fly campaign accounting (Batch 33.9) — restored across script invocations.
 */

export type CatchUpCampaignState = {
  campaignId: string;
  executionsCompleted: number;
  maxExecutions: number;
  providerUsed: number;
  providerReservedUncertain: number;
  maxProviderRequests: number;
  queueAfterSymbol: string | null;
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

export function assertCampaignCanStart(state: CatchUpCampaignState): void {
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
}

export function applyCampaignRunOutcome(
  state: CatchUpCampaignState,
  input: {
    exitCode: number;
    runProvider: number | null;
    providerMeasurementReliable: boolean;
  },
): CatchUpCampaignState {
  const next = { ...state, executionsCompleted: state.executionsCompleted + 1 };
  if (input.runProvider !== null && input.runProvider > 0 && input.providerMeasurementReliable) {
    next.providerUsed += input.runProvider;
  } else if (!input.providerMeasurementReliable) {
    const reserve = input.runProvider !== null && input.runProvider > 0
      ? input.runProvider
      : 1;
    next.providerReservedUncertain += reserve;
  }
  return next;
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
  };
}