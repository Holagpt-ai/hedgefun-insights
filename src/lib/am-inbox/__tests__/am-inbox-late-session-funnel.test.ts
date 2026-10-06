import { describe, expect, it, vi } from "vitest";
import {
  buildAmInboxLateSessionViewFromContexts,
  isLateSessionPriorityCandidate,
} from "@/lib/am-inbox/am-inbox-late-session-view";
import * as lateSessionPriority from "@/lib/am-inbox/am-inbox-late-session-priority";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import { AM_INBOX_LATE_SESSION_VISIBLE_LIMIT } from "@/config/late-session-handoff.config";
import { qualifiesLateSessionHandoffCandidate } from "@/lib/am-inbox/late-session-handoff-qualification";

function ctx(
  symbol: string,
  overrides: {
    volume?: number;
    rvol?: number | null;
    dollarVolume?: number | null;
  } = {},
) {
  return buildLateSessionContinuationContext({
    symbol,
    sourceSessionDate: "2026-09-21",
    sourceTimestamp: "2026-09-21T20:00:00.000Z",
    sourceCategory: "POWER_HOUR_MOMENTUM",
    volume: overrides.volume ?? 5_000_000,
    rvol: overrides.rvol ?? 8,
    dollarVolume:
      overrides.dollarVolume !== undefined ? overrides.dollarVolume : 50_000_000,
  });
}

describe("AM Inbox late-session continuation funnel display", () => {
  it("excludes unqualified symbols from default display and priority counts", () => {
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [
      ctx("PRIORITY", { volume: 20_000_000, rvol: 12 }),
      ctx("UNQUALIFIED", { volume: 50_000, rvol: 20 }),
    ]);

    expect(view.funnel.detectedCount).toBe(2);
    expect(view.funnel.qualifiedCount).toBe(1);
    expect(view.funnel.priorityCount).toBe(1);
    expect(view.candidates.map((c) => c.context.symbol)).toEqual(["PRIORITY"]);
    expect(view.qualifiedCandidates.map((c) => c.context.symbol)).toEqual(["PRIORITY"]);
    expect(
      view.candidates.some((c) => c.context.symbol === "UNQUALIFIED"),
    ).toBe(false);
  });

  it("does not count qualified below-threshold candidates as priority", () => {
    const lowScoreCtx = buildLateSessionContinuationContext({
      symbol: "LOWSCORE",
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "STRONG_CLOSE_NEAR_HOD",
      volume: 400_000,
      rvol: 0.1,
      dollarVolume: null,
      closeDistanceFromHodPct: null,
    });
    const entry = {
      context: lowScoreCtx,
      workflow: null,
      sourceCategories: ["STRONG_CLOSE_NEAR_HOD"] as const,
    };
    expect(qualifiesLateSessionHandoffCandidate(entry)).toBe(true);

    const scoreSpy = vi
      .spyOn(lateSessionPriority, "computeAmInboxLateSessionPriorityScore")
      .mockImplementation((candidate) =>
        candidate.context.symbol === "LOWSCORE" ? 20 : 80,
      );
    try {
      expect(isLateSessionPriorityCandidate(entry)).toBe(false);

      const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [
        ctx("HIGH"),
        lowScoreCtx,
      ]);
      expect(view.funnel.priorityCount).toBe(1);
      expect(view.funnel.qualifiedCount).toBe(2);
      expect(view.candidates.map((c) => c.context.symbol)).toEqual(["HIGH"]);
      expect(view.qualifiedCandidates.map((c) => c.context.symbol)).toEqual([
        "HIGH",
        "LOWSCORE",
      ]);
    } finally {
      scoreSpy.mockRestore();
    }
  });

  it("uses priority candidates as the default displayed source", () => {
    const contexts = Array.from({ length: 8 }, (_, i) =>
      ctx(`P${i}`, { volume: (8 - i) * 2_000_000, rvol: 10 + i }),
    );
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", contexts);
    expect(view.funnel.priorityCount).toBe(8);
    expect(view.funnel.displayedCount).toBe(AM_INBOX_LATE_SESSION_VISIBLE_LIMIT);
    expect(view.candidates).toHaveLength(AM_INBOX_LATE_SESSION_VISIBLE_LIMIT);
    const defaultSlice = view.candidates;
    expect(defaultSlice.every((entry) => isLateSessionPriorityCandidate(entry, view.candidates))).toBe(
      true,
    );
    expect(defaultSlice.map((c) => c.context.symbol)).toEqual([
      "P0",
      "P1",
      "P2",
      "P3",
      "P4",
      "P5",
    ]);
  });

  it("sets displayedCount to actual priority shown when fewer than the visible limit", () => {
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [
      ctx("A", { volume: 10_000_000, rvol: 10 }),
      ctx("B", { volume: 9_000_000, rvol: 9 }),
    ]);
    expect(view.funnel.priorityCount).toBe(2);
    expect(view.funnel.displayedCount).toBe(2);
    expect(view.candidates).toHaveLength(2);
  });

  it("keeps detected, qualified, and priority counts independent", () => {
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [
      ctx("P1"),
      ctx("P2"),
      ctx("NQ", { volume: 400_000, rvol: 0.2, dollarVolume: null }),
      ctx("BAD", { volume: 10_000, rvol: 5 }),
    ]);
    expect(view.funnel.detectedCount).toBe(4);
    expect(view.funnel.qualifiedCount).toBe(3);
    expect(view.funnel.priorityCount).toBe(2);
    expect(view.qualifiedCandidates).toHaveLength(3);
  });
});
