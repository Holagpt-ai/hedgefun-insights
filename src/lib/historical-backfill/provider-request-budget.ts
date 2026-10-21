/**
 * Per Fly-run provider HTTP budget (Batch 33.1). Checked immediately before each request.
 */

export class ProviderBudgetExhaustedError extends Error {
  readonly code = "PROVIDER_REQUEST_BUDGET_EXHAUSTED";

  constructor(
    readonly consumed: number,
    readonly limit: number,
  ) {
    super(`provider request budget exhausted (${consumed}/${limit})`);
    this.name = "ProviderBudgetExhaustedError";
  }
}

export class ProviderRequestBudget {
  private consumed = 0;

  constructor(readonly limit: number) {
    if (!Number.isFinite(limit) || limit < 1) {
      throw new Error("provider request budget limit must be a positive integer");
    }
  }

  get used(): number {
    return this.consumed;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.consumed);
  }

  /** Call immediately before each provider HTTP attempt (including retries and pagination). */
  consumeBeforeRequest(): void {
    if (this.consumed >= this.limit) {
      throw new ProviderBudgetExhaustedError(this.consumed, this.limit);
    }
    this.consumed += 1;
  }
}

export function isProviderBudgetExhausted(error: unknown): error is ProviderBudgetExhaustedError {
  return error instanceof ProviderBudgetExhaustedError;
}
