import { describe, expect, it } from "vitest";
import { HISTORICAL_CATCHUP_LIMITS } from "@/config/historical-catchup.config";
import {
  CATCHUP_CAMPAIGN_STUCK_EMPTY_RUN_LIMIT,
  applyEmptyWindowCampaignProgress,
  parseCatchUpCampaignState,
  remainingProviderBudget,
  assertCampaignCanStart,
  CatchUpCampaignBudgetError,
} from "@/lib/historical-backfill/catch-up-campaign-state";
import {
  applyCatchUpWindowQueueCursor,
  compareEligibleSymbols,
  emptyQueueWindowFingerprint,
  exclusiveCursorAfterInterruptedWindow,
  exclusiveCursorAfterWindow,
  findQueueStartIndex,
  normalizeEligibleSymbols,
  planNextCatchUpQueueWindow,
  sliceEligibleQueueFromIndex,
} from "@/lib/historical-backfill/catch-up-queue";
import { isAuthoritativeCatchUpTerminalEvent } from "@/lib/historical-backfill/catch-up-rollout-outcome";
import { resolveCatchUpRolloutOutcome } from "@/lib/historical-backfill/catch-up-rollout-outcome";
import { summarizeDeferredByKind } from "@/lib/historical-backfill/catch-up-symbol-resolution";

/** Build a BKH-class deferral belt: 200 symbols ending at BKH, then processable symbols. */
function buildBkhClassEligible(): string[] {
  const before: string[] = [];
  for (let i = 0; i < 199; i += 1) {
    before.push(`A${String(i).padStart(3, "0")}`);
  }
  before.push("BKH");
  const after = ["BMY", "C", "CAT", "COST", "DE", "F", "GE", "IBM", "JNJ", "KO"];
  return normalizeEligibleSymbols([...before, ...after]);
}

describe("Historical queue starvation completion (BKH class)", () => {
  it("exclusive-advances past a 200-symbol all-deferred window ending at BKH", () => {
    const eligible = buildBkhClassEligible();
    const first = planNextCatchUpQueueWindow({
      eligible,
      afterSymbol: null,
      scanSize: 200,
      wrappedOnce: false,
    });
    expect(first.window).toHaveLength(200);
    expect(first.window[199]).toBe("BKH");
    expect(first.nextAfterSymbol).toBe("BKH");

    const second = planNextCatchUpQueueWindow({
      eligible,
      afterSymbol: first.nextAfterSymbol,
      scanSize: 200,
      wrappedOnce: false,
    });
    expect(second.window[0]).toBe("BMY");
    expect(second.window).not.toContain("BKH");
    expect([...second.window].slice(0, 5)).toEqual(["BMY", "C", "CAT", "COST", "DE"]);
  });

  it("does not replay the identical empty window after cursor advances to BKH", () => {
    const eligible = buildBkhClassEligible();
    const fingerprints: string[] = [];
    let cursor: string | null = null;
    let wrappedOnce = false;
    for (let i = 0; i < 3; i += 1) {
      const plan = planNextCatchUpQueueWindow({
        eligible,
        afterSymbol: cursor,
        scanSize: 200,
        wrappedOnce,
      });
      if (plan.wrapped) wrappedOnce = true;
      const deferredByKind = { ambiguous_identity: 150, unsupported_ticker: 50 };
      fingerprints.push(
        emptyQueueWindowFingerprint({
          queueAfterSymbol: plan.nextAfterSymbol,
          scanned: plan.window.length,
          deferredByKind,
          eligibleSymbolsRemaining: eligible.length,
        }),
      );
      cursor = plan.nextAfterSymbol;
    }
    expect(fingerprints[0]).not.toEqual(fingerprints[1]);
    expect(fingerprints[1]).not.toEqual(fingerprints[2]);
  });

  it("wraps once then exhausts instead of infinite head cycling", () => {
    const eligible = normalizeEligibleSymbols(["AAA", "BBB", "CCC"]);
    const pastEnd = planNextCatchUpQueueWindow({
      eligible,
      afterSymbol: "CCC",
      scanSize: 200,
      wrappedOnce: false,
    });
    expect(pastEnd.wrapped).toBe(true);
    expect([...pastEnd.window]).toEqual(["AAA", "BBB", "CCC"]);

    const again = planNextCatchUpQueueWindow({
      eligible,
      afterSymbol: "CCC",
      scanSize: 200,
      wrappedOnce: true,
    });
    expect(again.exhausted).toBe(true);
    expect(again.window).toHaveLength(0);
  });

  it("findQueueStartIndex returns length for markers past the queue (planner wraps)", () => {
    expect(findQueueStartIndex(["A", "B", "C"], "Z")).toBe(3);
  });

  it("normalizes and sorts mixed-case eligible symbols", () => {
    expect(normalizeEligibleSymbols(["bkh", "aaa", "BKH", " msfT "])).toEqual([
      "AAA",
      "BKH",
      "MSFT",
    ]);
  });

  it("handles large ambiguous/unsupported clusters without discarding later eligible symbols", () => {
    const cluster = Array.from({ length: 400 }, (_, i) => `D${String(i).padStart(3, "0")}`);
    const later = ["ZZAA", "ZZBB"];
    const eligible = normalizeEligibleSymbols([...cluster, ...later]);
    let cursor: string | null = null;
    let wrappedOnce = false;
    let sawLater = false;
    for (let i = 0; i < 5; i += 1) {
      const plan = planNextCatchUpQueueWindow({
        eligible,
        afterSymbol: cursor,
        scanSize: 200,
        wrappedOnce,
      });
      if (plan.wrapped) wrappedOnce = true;
      if (plan.window.includes("ZZAA")) sawLater = true;
      cursor = plan.nextAfterSymbol;
    }
    expect(sawLater).toBe(true);
    expect(eligible).toContain("ZZBB");
  });

  it("reports queue_cycle_exhausted as partial rollout", () => {
    expect(
      resolveCatchUpRolloutOutcome({
        stopReason: "queue_cycle_exhausted",
        eligibleSymbolsRemaining: 4735,
        interruptedJobId: null,
      }),
    ).toBe("partial");
  });

  it("halts campaign after repeated identical empty fingerprints", () => {
    let state = parseCatchUpCampaignState({
      campaignId: "nov26",
      executionsCompleted: 16,
      maxExecutions: 20,
      providerUsed: 7432,
      providerReservedUncertain: 7500,
      maxProviderRequests: 50000,
      queueAfterSymbol: "BKH",
    });
    const fp = emptyQueueWindowFingerprint({
      queueAfterSymbol: "BKH",
      scanned: 200,
      deferredByKind: { ambiguous_identity: 149, unsupported_ticker: 51 },
      eligibleSymbolsRemaining: 4735,
    });
    const first = applyEmptyWindowCampaignProgress(state, {
      queueAfterSymbol: "BKH",
      emptyWindowFingerprint: fp,
      resolvedAny: false,
    });
    expect(first.stuck).toBe(false);
    state = first.state;
    const second = applyEmptyWindowCampaignProgress(state, {
      queueAfterSymbol: "BKH",
      emptyWindowFingerprint: fp,
      resolvedAny: false,
    });
    expect(second.stuck).toBe(true);
    expect(second.state.consecutiveIdenticalEmptyRuns).toBe(CATCHUP_CAMPAIGN_STUCK_EMPTY_RUN_LIMIT);
  });

  it("preserves provider budget floors and does not raise per-run allowances", () => {
    const state = parseCatchUpCampaignState({
      campaignId: "nov26",
      executionsCompleted: 16,
      maxExecutions: 20,
      providerUsed: 7432,
      providerReservedUncertain: 7500,
      maxProviderRequests: 50000,
      queueAfterSymbol: "BKH",
    });
    expect(remainingProviderBudget(state)).toBe(50000 - 7432 - 7500);
    expect(HISTORICAL_CATCHUP_LIMITS.maxProviderRequestsPerRun).toBe(2500);
    expect(HISTORICAL_CATCHUP_LIMITS.maxEmptyResolutionBatches).toBe(3);
    expect(() =>
      assertCampaignCanStart(
        parseCatchUpCampaignState({
          ...state,
          providerUsed: 48000,
          providerReservedUncertain: 0,
        }),
      ),
    ).toThrow(CatchUpCampaignBudgetError);
  });

  it("uses one locale-aware comparator for periods, hyphens, numerics, and mixed case", () => {
    const sorted = normalizeEligibleSymbols(["brk.b", "BRK-B", "AAA2", "AAA10", "aaa1"]);
    expect(sorted).toEqual([...sorted].sort(compareEligibleSymbols));
    expect(findQueueStartIndex(sorted, "BRK.B")).toBe(sorted.indexOf("BRK.B") + 1);
    expect(findQueueStartIndex(sorted, "BRK-B")).toBe(sorted.indexOf("BRK-B") + 1);
    const eligible = sorted;
    const startAfterMissing = findQueueStartIndex(eligible, "ZZZZ");
    expect(startAfterMissing).toBe(eligible.length);
    const plan = planNextCatchUpQueueWindow({
      eligible,
      afterSymbol: "ZZZZ",
      scanSize: 10,
      wrappedOnce: false,
    });
    expect(plan.wrapped).toBe(true);
    expect(plan.window.length).toBeGreaterThan(0);
  });

  it("interrupted window cursor does not skip the failing symbol", () => {
    const window = ["OK1", "OK2", "FAIL3", "OK4"];
    expect(exclusiveCursorAfterInterruptedWindow(window, 2, "CUR0")).toBe("OK2");
    expect(
      applyCatchUpWindowQueueCursor({
        batchSymbols: window,
        resolutionStopped: true,
        interruptionIndex: 2,
        priorQueueAfterSymbol: "CUR0",
        plannedNextAfterSymbol: "OK4",
      }),
    ).toBe("OK2");
    expect(
      applyCatchUpWindowQueueCursor({
        batchSymbols: window,
        resolutionStopped: false,
        interruptionIndex: null,
        priorQueueAfterSymbol: "CUR0",
        plannedNextAfterSymbol: "OK4",
      }),
    ).toBe("OK4");
  });

  it("distinguishes authoritative terminal events from diagnostic catch_up_stop", () => {
    expect(isAuthoritativeCatchUpTerminalEvent("catch_up_partial_stop")).toBe(true);
    expect(isAuthoritativeCatchUpTerminalEvent("rollout_complete")).toBe(true);
    expect(isAuthoritativeCatchUpTerminalEvent("catch_up_stop")).toBe(false);
  });

  it("exclusiveCursorAfterWindow matches slice end semantics", () => {
    const eligible = ["AAA", "BBB", "CCC", "DDD"];
    const { window } = sliceEligibleQueueFromIndex(eligible, 1, 2);
    expect(exclusiveCursorAfterWindow(window)).toBe("CCC");
    expect(summarizeDeferredByKind([
      { symbol: "A", kind: "unsupported_ticker" },
      { symbol: "B", kind: "ambiguous_identity" },
    ])).toEqual({ unsupported_ticker: 1, ambiguous_identity: 1 });
  });
});
