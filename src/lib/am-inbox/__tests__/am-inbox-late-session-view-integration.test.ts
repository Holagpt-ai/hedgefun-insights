import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAmInboxLateSessionViewFromContexts } from "@/lib/am-inbox/am-inbox-late-session-view";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import {
  readLateSessionHandoffStore,
  resetLateSessionHandoffStoreForTests,
} from "@/lib/am-inbox/late-session-handoff-storage";
import { persistHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import type { SecurityId } from "@/types/security-identity";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";

const SEC_HANDOFF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as SecurityId;
const SEC_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as SecurityId;

function workflowFor(symbol: string, securityId: SecurityId): HistoricalWorkflowContext {
  return {
    securityId,
    symbol,
    historicalContextAvailable: true,
    evidenceLabels: ["SIMILAR_PRIOR_EPISODES_FOUND"],
    sampleSizeQuality: "ROBUST",
    comparableEpisodeCount: 9,
    mostRecentComparableDate: "2026-09-01",
    profileFreshness: "FRESH",
    sourceSurface: "radar",
    handoffAt: "2026-09-21T19:00:00.000Z",
    contextAssembledAt: "2026-09-21T19:00:00.000Z",
  };
}

describe("buildAmInboxLateSessionViewFromContexts integration", () => {
  beforeEach(() => {
    resetLateSessionHandoffStoreForTests();
    vi.restoreAllMocks();
  });

  it("lets timestamp-aware collapse pick the newest capture regardless of input order", () => {
    const older = buildLateSessionContinuationContext({
      symbol: "AAA",
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T19:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 3_000_000,
      rvol: 2,
      rvolMetricKind: "rvol_20d",
      dollarVolume: 30_000_000,
    });
    const newer = buildLateSessionContinuationContext({
      symbol: "AAA",
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:30:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 7_000_000,
      rvol: 9,
      rvolMetricKind: "rvol_20d",
      dollarVolume: 70_000_000,
    });

    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [older, newer]);
    expect(view.qualifiedCandidates).toHaveLength(1);
    expect(view.qualifiedCandidates[0]!.context.rvol).toBe(9);
    expect(view.qualifiedCandidates[0]!.context.volume).toBe(7_000_000);

    const viewReversed = buildAmInboxLateSessionViewFromContexts("2026-09-22", [newer, older]);
    expect(viewReversed.qualifiedCandidates[0]!.context.rvol).toBe(9);
  });

  it("persists only the resolved newest capture after collapse", () => {
    resetLateSessionHandoffStoreForTests();
    const older = buildLateSessionContinuationContext({
      symbol: "BBB",
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T19:00:00.000Z",
      sourceCategory: "STRONG_CLOSE_NEAR_HOD",
      volume: 2_000_000,
      rvol: 1.5,
      closeDistanceFromHodPct: 2,
    });
    const newer = buildLateSessionContinuationContext({
      symbol: "BBB",
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T21:00:00.000Z",
      sourceCategory: "STRONG_CLOSE_NEAR_HOD",
      volume: 5_500_000,
      rvol: 4.2,
      closeDistanceFromHodPct: 0.5,
    });

    buildAmInboxLateSessionViewFromContexts("2026-09-22", [older, newer]);
    const store = readLateSessionHandoffStore();
    const entries = Object.values(store);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.context.rvol).toBe(4.2);
    expect(entries[0]!.context.volume).toBe(5_500_000);
  });

  it("does not apply symbol-keyed workflow cache when handoff security differs", () => {
    persistHistoricalWorkflowContext(workflowFor("ZZZ", SEC_OTHER));
    const handoff = buildLateSessionContinuationContext({
      symbol: "ZZZ",
      securityId: SEC_HANDOFF,
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 6_000_000,
      rvol: 5,
    });

    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [handoff]);
    const row = view.qualifiedCandidates[0]!;
    expect(row.context.securityId).toBe(SEC_HANDOFF);
    expect(row.context.historicalContextAvailable).toBe(false);
    expect(row.context.evidenceLabels).toEqual([]);
    expect(row.workflow).toBeNull();
  });

  it("enriches handoff when workflow security matches persisted identity", () => {
    persistHistoricalWorkflowContext(workflowFor("MMM", SEC_HANDOFF));
    const handoff = buildLateSessionContinuationContext({
      symbol: "MMM",
      securityId: SEC_HANDOFF,
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 6_000_000,
      rvol: 5,
    });

    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [handoff]);
    const row = view.qualifiedCandidates[0]!;
    expect(row.context.securityId).toBe(SEC_HANDOFF);
    expect(row.context.historicalContextAvailable).toBe(true);
    expect(row.context.evidenceLabels).toContain("SIMILAR_PRIOR_EPISODES_FOUND");
    expect(row.workflow?.securityId).toBe(SEC_HANDOFF);
  });
});
