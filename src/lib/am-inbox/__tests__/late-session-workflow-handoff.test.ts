import { describe, expect, it } from "vitest";
import {
  enrichHandoffContextFromHistoricalWorkflow,
  historicalWorkflowMatchesHandoff,
} from "@/lib/am-inbox/late-session-workflow-handoff";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import type { SecurityId } from "@/types/security-identity";
import type { LateSessionContinuationContext } from "@/lib/am-inbox/late-session-continuation-types";
import type { RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";

const SEC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as SecurityId;
const SEC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as SecurityId;

function workflow(symbol: string, securityId: SecurityId | null): HistoricalWorkflowContext {
  return {
    securityId,
    symbol,
    historicalContextAvailable: true,
    evidenceLabels: ["SIMILAR_PRIOR_EPISODES_FOUND"],
    sampleSizeQuality: "ROBUST",
    comparableEpisodeCount: 4,
    mostRecentComparableDate: "2026-09-01",
    profileFreshness: "FRESH",
    sourceSurface: "inbox",
    handoffAt: "2026-09-21T19:00:00.000Z",
    contextAssembledAt: null,
  };
}

describe("historicalWorkflowMatchesHandoff", () => {
  it("rejects mismatched security IDs for the same symbol", () => {
    expect(
      historicalWorkflowMatchesHandoff(
        { symbol: "AAA", securityId: SEC_A },
        workflow("AAA", SEC_B),
      ),
    ).toBe(false);
  });

  it("accepts matching security IDs", () => {
    expect(
      historicalWorkflowMatchesHandoff(
        { symbol: "AAA", securityId: SEC_A },
        workflow("AAA", SEC_A),
      ),
    ).toBe(true);
  });

  it("rejects symbol-keyed workflow when handoff already has a security ID", () => {
    expect(
      historicalWorkflowMatchesHandoff(
        { symbol: "AAA", securityId: SEC_A },
        workflow("AAA", null),
      ),
    ).toBe(false);
  });
});

describe("enrichHandoffContextFromHistoricalWorkflow", () => {
  it("preserves persisted evidence when workflow security mismatches", () => {
    const base = buildLateSessionContinuationContext({
      symbol: "AAA",
      securityId: SEC_A,
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 5_000_000,
    });
    const context: LateSessionContinuationContext = {
      ...base,
      historicalContextAvailable: false,
      evidenceLabels: ["LIMITED_HISTORY"] as RepeatMoverEvidenceLabel[],
      comparableEpisodeCount: 1,
    };
    const out = enrichHandoffContextFromHistoricalWorkflow(context, workflow("AAA", SEC_B));
    expect(out.workflow).toBeNull();
    expect(out.context.evidenceLabels).toEqual(["LIMITED_HISTORY"]);
    expect(out.context.securityId).toBe(SEC_A);
  });
});
