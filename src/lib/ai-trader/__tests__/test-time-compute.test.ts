import { describe, expect, it } from "vitest";
import { selectTestTimeComputeLevel } from "@/lib/ai-trader/intelligence/test-time-compute";
import {
  criticResultAuthorizesExecution,
  evaluateDeterministicCriticGates,
} from "@/lib/ai-trader/intelligence/trade-critic";

const quiet = {
  monetaryExposure: 50,
  missingFieldCount: 0,
  signalConflictCount: 0,
  novelty: false,
  setupEventCount: 0,
  catalystUnverified: false,
  retrievedOutcomeDisagreement: false,
  dayRangeVolatilityHigh: false,
  regimeSampleSize: 20,
  retrievalConfidence: 0.8,
  liquidityUnknown: false,
};

describe("AI Trader compute and critic", () => {
  it("escalates compute and fails closed on unknown liquidity", () => {
    expect(selectTestTimeComputeLevel(quiet).level).toBe("LOW");
    expect(selectTestTimeComputeLevel({ ...quiet, novelty: true }).level).toBe("MEDIUM");
    expect(selectTestTimeComputeLevel({ ...quiet, monetaryExposure: 200 }).level).toBe("HIGH");
    const blocked = selectTestTimeComputeLevel({ ...quiet, liquidityUnknown: true });
    expect(blocked.level).toBe("VERY_HIGH");
    expect(blocked.noTrade).toBe(true);
    expect(blocked.toolsAllowed).toEqual([]);
  });

  it("lets the critic challenge or reject without authorizing execution", () => {
    const approved = evaluateDeterministicCriticGates({
      contextSnapshotId: "ctx_1",
      retrievedMemories: [],
      proposedAction: "HOLD",
      orderCapabilityRejected: false,
    });
    expect(approved.verdict).toBe("APPROVE");
    expect(criticResultAuthorizesExecution(approved)).toBe(false);

    expect(
      evaluateDeterministicCriticGates({
        contextSnapshotId: null,
        retrievedMemories: [],
        proposedAction: "ENTER",
        orderCapabilityRejected: false,
      }).verdict,
    ).toBe("INSUFFICIENT_EVIDENCE");

    expect(
      evaluateDeterministicCriticGates({
        contextSnapshotId: "ctx_1",
        retrievedMemories: [],
        proposedAction: "WIDEN_STOP",
        orderCapabilityRejected: false,
      }).verdict,
    ).toBe("REJECT_RECOMMENDATION");
  });
});
