import { describe, expect, it, vi } from "vitest";
import { HISTORICAL_CATCHUP_LIMITS } from "@/config/historical-catchup.config";
import {
  readCatchUpQueueOffset,
  resolveCatchUpScanBudget,
  sliceEligibleQueue,
} from "@/lib/historical-backfill/catch-up-queue";
import { resolveLatestCompletedTradingSession } from "@/lib/historical-backfill/catch-up-schedule";
import { resolveCatchUpRolloutOutcome } from "@/lib/historical-backfill/catch-up-rollout-outcome";
import {
  classifyPolygonReferenceRow,
  summarizeDeferredByKind,
} from "@/lib/historical-backfill/catch-up-symbol-resolution";
import { resolveEligibilityTrancheSize } from "@/lib/historical-backfill/production-rollout";

describe("Batch 33.9 catch-up queue starvation", () => {
  it("advances the queue window instead of always slicing head", () => {
    const eligible = ["AAA", "BBB", "CCC", "DDD", "EEE"];
    expect(sliceEligibleQueue(eligible, 0, 2).window).toEqual(["AAA", "BBB"]);
    expect(sliceEligibleQueue(eligible, 2, 2).window).toEqual(["CCC", "DDD"]);
    expect(sliceEligibleQueue(eligible, 2, 2).nextOffset).toBe(4);
  });

  it("bounds scan budget by remaining symbol cap", () => {
    const tranche = resolveEligibilityTrancheSize({
      batchesRun: 0,
      eligibilityBatchSize: 200,
      limits: { ...HISTORICAL_CATCHUP_LIMITS, maxSymbolsPerRun: 50 },
      symbolsAttempted: 40,
    });
    const scan = resolveCatchUpScanBudget({
      trancheSize: tranche,
      remainingSymbolBudget: 10,
      maxScansPerBatch: 200,
    });
    expect(scan).toBe(10);
  });

  it("classifies unsupported and ambiguous provider reference outcomes", () => {
    expect(
      classifyPolygonReferenceRow({ httpStatus: 404, body: { status: "NOT_FOUND" } }).kind,
    ).toBe("unsupported_ticker");
    expect(
      classifyPolygonReferenceRow({ httpStatus: 403, body: { status: "NOT_AUTHORIZED" } }).kind,
    ).toBe("unsupported_ticker");
    expect(
      classifyPolygonReferenceRow({ httpStatus: 200, body: { status: "ERROR" } }).kind,
    ).toBe("unsupported_ticker");
    expect(
      classifyPolygonReferenceRow({
        httpStatus: 200,
        body: { status: "OK", results: { ticker: "SPY" } },
      }).kind,
    ).toBe("resolved");
  });

  it("aggregates deferred resolution kinds separately", () => {
    const summary = summarizeDeferredByKind([
      { symbol: "A", kind: "unsupported_ticker" },
      { symbol: "B", kind: "ambiguous_identity" },
      { symbol: "C", kind: "unsupported_ticker" },
    ]);
    expect(summary.unsupported_ticker).toBe(2);
    expect(summary.ambiguous_identity).toBe(1);
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

  it("clamps persisted queue offset to eligible length", () => {
    expect(readCatchUpQueueOffset("5000", 100)).toBe(0);
    expect(readCatchUpQueueOffset("25", 100)).toBe(25);
  });

  it("resolves latest completed session on a weekday after close", () => {
    const session = resolveLatestCompletedTradingSession(new Date("2026-11-25T22:00:00.000Z"));
    expect(session).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});