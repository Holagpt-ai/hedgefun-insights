import { describe, expect, it } from "vitest";
import { HISTORICAL_CATCHUP_LIMITS } from "@/config/historical-catchup.config";
import {
  applyCampaignRunOutcome,
  assertCampaignCanStart,
  parseCatchUpCampaignState,
  providerBudgetTotal,
} from "@/lib/historical-backfill/catch-up-campaign-state";
import {
  findQueueStartIndex,
  resolveCatchUpScanBudget,
  sliceEligibleQueueFromIndex,
} from "@/lib/historical-backfill/catch-up-queue";
import { resolveLatestCompletedTradingSession } from "@/lib/historical-backfill/catch-up-schedule";
import { resolveCatchUpRolloutOutcome } from "@/lib/historical-backfill/catch-up-rollout-outcome";
import {
  classifyPolygonReferenceResponse,
  isDeferrableCatchUpResolutionKind,
  isRetryableCatchUpResolutionKind,
  summarizeDeferredByKind,
} from "@/lib/historical-backfill/catch-up-symbol-resolution";
import { resolveEligibilityTrancheSize } from "@/lib/historical-backfill/production-rollout";

describe("Batch 33.9 catch-up queue and campaign corrections", () => {
  it("uses symbol cursor that survives queue shrink", () => {
    const before = ["A", "B", "C", "D", "E"];
    expect(findQueueStartIndex(before, "B")).toBe(2);
    const afterShrink = ["C", "D", "E"];
    expect(findQueueStartIndex(afterShrink, "B")).toBe(0);
    expect(afterShrink[0]).toBe("C");
  });

  it("wraps to head when cursor symbol was completed out of queue", () => {
    const eligible = ["A", "B", "C"];
    expect(findQueueStartIndex(eligible, "Z")).toBe(0);
  });

  it("scans from index without assuming numeric offset", () => {
    const eligible = ["AAA", "BBB", "CCC", "DDD"];
    const start = findQueueStartIndex(eligible, "BBB");
    const { window } = sliceEligibleQueueFromIndex(eligible, start, 2);
    expect([...window]).toEqual(["CCC", "DDD"]);
  });

  it("classifies provider responses without marking outages unsupported", () => {
    expect(classifyPolygonReferenceResponse({ httpStatus: 404, body: { status: "NOT_FOUND" } }).kind)
      .toBe("unsupported_ticker");
    expect(classifyPolygonReferenceResponse({ httpStatus: 429, body: { status: "ERROR" } }).kind)
      .toBe("provider_rate_limited");
    expect(classifyPolygonReferenceResponse({ httpStatus: 503, body: { status: "ERROR" } }).kind)
      .toBe("provider_transient");
    expect(
      classifyPolygonReferenceResponse({
        httpStatus: 403,
        body: { status: "NOT_AUTHORIZED", message: "past historical entitlements" },
      }).kind,
    ).toBe("provider_entitlement");
    expect(isRetryableCatchUpResolutionKind("provider_transient")).toBe(true);
    expect(isDeferrableCatchUpResolutionKind("unsupported_ticker")).toBe(true);
  });

  it("restores and enforces campaign budget after prior runs", () => {
    const state = parseCatchUpCampaignState({
      campaignId: "nov26",
      executionsCompleted: 3,
      maxExecutions: 20,
      providerUsed: 3010,
      providerReservedUncertain: 400,
      maxProviderRequests: 50000,
      queueAfterSymbol: null,
    });
    expect(providerBudgetTotal(state)).toBe(3410);
    assertCampaignCanStart(state);
    const after = applyCampaignRunOutcome(state, {
      exitCode: 0,
      runProvider: 1500,
      providerMeasurementReliable: true,
    });
    expect(after.executionsCompleted).toBe(4);
    expect(after.providerUsed).toBe(4510);
  });

  it("reserves uncertain provider usage when logs are missing", () => {
    const state = parseCatchUpCampaignState({
      campaignId: "nov26",
      executionsCompleted: 3,
      maxExecutions: 20,
      providerUsed: 3010,
      providerReservedUncertain: 400,
      maxProviderRequests: 50000,
      queueAfterSymbol: null,
    });
    const after = applyCampaignRunOutcome(state, {
      exitCode: 1,
      runProvider: null,
      providerMeasurementReliable: false,
    });
    expect(after.providerReservedUncertain).toBe(401);
  });

  it("resolves completed session using ET after-hours boundary", () => {
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-25T21:30:00.000Z"))).toBe("2026-11-24");
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-26T01:30:00.000Z"))).toBe("2026-11-25");
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-28T02:00:00.000Z"))).toBe("2026-11-27");
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-29T02:00:00.000Z"))).toBe("2026-11-28");
  });

  it("treats unresolvable queue window as partial rollout", () => {
    expect(
      resolveCatchUpRolloutOutcome({
        stopReason: "unresolvable_queue_window",
        eligibleSymbolsRemaining: 100,
        interruptedJobId: null,
      }),
    ).toBe("partial");
  });

  it("aggregates only deferrable skipped kinds", () => {
    const summary = summarizeDeferredByKind([
      { symbol: "A", kind: "unsupported_ticker" },
      { symbol: "B", kind: "ambiguous_identity" },
    ]);
    expect(summary.unsupported_ticker).toBe(1);
    expect(summary.ambiguous_identity).toBe(1);
  });

  it("preserves eligible symbol ordering at queue offset zero", () => {
    const eligible = ["AAA", "BBB", "CCC"];
    const size = resolveEligibilityTrancheSize({
      batchesRun: 0,
      eligibilityBatchSize: 3,
      limits: { ...HISTORICAL_CATCHUP_LIMITS, maxSymbolsPerRun: 600 },
      symbolsAttempted: 0,
    });
    const { window } = sliceEligibleQueueFromIndex(eligible, findQueueStartIndex(eligible, null), size);
    expect([...window]).toEqual(["AAA", "BBB", "CCC"]);
    expect(
      resolveCatchUpScanBudget({
        trancheSize: size,
        remainingSymbolBudget: 10,
        maxScansPerBatch: 200,
      }),
    ).toBe(3);
  });
});