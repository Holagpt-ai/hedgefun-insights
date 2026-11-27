import { describe, expect, it } from "vitest";
import { HISTORICAL_CATCHUP_LIMITS } from "@/config/historical-catchup.config";
import {
  applyCampaignRunOutcome,
  assertCampaignCanStart,
  CatchUpCampaignBudgetError,
  parseCatchUpCampaignState,
  providerBudgetTotal,
  remainingProviderBudget,
  reconcileCampaignRun,
  reserveCampaignRun,
} from "@/lib/historical-backfill/catch-up-campaign-state";
import {
  findQueueStartIndex,
  planNextCatchUpQueueWindow,
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
    // Past-end markers return length; planner wraps once.
    expect(findQueueStartIndex(eligible, "Z")).toBe(3);
    const plan = planNextCatchUpQueueWindow({
      eligible,
      afterSymbol: "Z",
      scanSize: 10,
      wrappedOnce: false,
    });
    expect(plan.wrapped).toBe(true);
    expect([...plan.window]).toEqual(["A", "B", "C"]);
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
    expect(classifyPolygonReferenceResponse({ httpStatus: 200, body: {} }).kind)
      .toBe("provider_invalid_response");
    expect(classifyPolygonReferenceResponse({ httpStatus: 200, body: { status: "OK" } }).kind)
      .toBe("provider_invalid_response");
    expect(
      classifyPolygonReferenceResponse({
        httpStatus: 200,
        body: { status: "OK", results: { name: "Missing ticker field" } },
      }).kind,
    ).toBe("provider_invalid_response");
    expect(isRetryableCatchUpResolutionKind("provider_transient")).toBe(true);
    expect(isRetryableCatchUpResolutionKind("provider_invalid_response")).toBe(true);
    expect(isDeferrableCatchUpResolutionKind("unsupported_ticker")).toBe(true);
    expect(isDeferrableCatchUpResolutionKind("provider_invalid_response")).toBe(false);
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
    const reserved = reserveCampaignRun(state, HISTORICAL_CATCHUP_LIMITS.maxProviderRequestsPerRun);
    expect(reserved.executionsCompleted).toBe(4);
    expect(reserved.pendingRun).toBe(true);
    expect(reserved.providerReservedUncertain).toBe(2900);
    expect(reserved.providerUsed).toBe(3010);
    const after = reconcileCampaignRun(reserved, {
      runProvider: null,
      providerMeasurementReliable: false,
    });
    expect(after.providerReservedUncertain).toBe(2900);
    expect(after.pendingRun).toBe(false);
    expect(after.providerUsed).toBe(3010);
  });

  it("blocks a run when remaining budget is below per-run allowance", () => {
    const state = parseCatchUpCampaignState({
      campaignId: "nov26",
      executionsCompleted: 3,
      maxExecutions: 20,
      providerUsed: 48000,
      providerReservedUncertain: 400,
      maxProviderRequests: 50000,
      queueAfterSymbol: null,
    });
    expect(remainingProviderBudget(state)).toBe(1600);
    expect(() => assertCampaignCanStart(state, HISTORICAL_CATCHUP_LIMITS.maxProviderRequestsPerRun))
      .toThrow(CatchUpCampaignBudgetError);
  });

  it("keeps measured campaign consumption when applying a successful outcome", () => {
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
      exitCode: 0,
      runProvider: 15,
      providerMeasurementReliable: true,
    });
    expect(after.executionsCompleted).toBe(4);
    expect(after.providerUsed).toBe(3025);
    expect(after.providerReservedUncertain).toBe(400);
  });

  it("resolves completed session using ET after-hours boundary", () => {
    // Before after-hours end on a trading day → prior session.
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-25T21:30:00.000Z"))).toBe("2026-11-24");
    // UTC calendar rolls before ET session completes → still prior session.
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-26T01:30:00.000Z"))).toBe("2026-11-25");
    // After 8 PM ET Friday → that session.
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-28T02:00:00.000Z"))).toBe("2026-11-27");
    // Thanksgiving (full holiday) → last completed session is day before holiday.
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-26T18:00:00.000Z"))).toBe("2026-11-25");
    // Early-close Friday before 8 PM ET → prior session (Wed pre-Thanksgiving).
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-27T19:00:00.000Z"))).toBe("2026-11-25");
    // Early-close Friday after 8 PM ET → early-close session counts complete.
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-28T01:30:00.000Z"))).toBe("2026-11-27");
    // Weekend evening ET → last trading day (Fri early close after Thanksgiving week).
    expect(resolveLatestCompletedTradingSession(new Date("2026-11-30T02:00:00.000Z"))).toBe("2026-11-27");
    // Regular session still open (3 PM ET) → not today's session.
    expect(resolveLatestCompletedTradingSession(new Date("2026-10-14T19:00:00.000Z"))).toBe("2026-10-13");
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