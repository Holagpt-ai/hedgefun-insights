import { describe, expect, it } from "vitest";
import { buildAmInboxLateSessionViewFromContexts } from "@/lib/am-inbox/am-inbox-late-session-view";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import { AM_INBOX_LATE_SESSION_VISIBLE_LIMIT } from "@/config/late-session-handoff.config";
import { qualifiesLateSessionHandoffCandidate } from "@/lib/am-inbox/late-session-handoff-qualification";
import { isLateSessionPriorityCandidate } from "@/lib/am-inbox/am-inbox-late-session-view";

function qualifiedHandoff(
  symbol: string,
  overrides: {
    volume?: number;
    rvol?: number;
    lastPrice?: number | null;
    dollarVolume?: number | null;
    closeDistanceFromHodPct?: number | null;
  } = {},
) {
  return buildLateSessionContinuationContext({
    symbol,
    sourceSessionDate: "2026-09-21",
    sourceTimestamp: "2026-09-21T20:00:00.000Z",
    sourceCategory: "POWER_HOUR_MOMENTUM",
    volume: overrides.volume ?? 500_000,
    rvol: overrides.rvol ?? 6,
    lastPrice: overrides.lastPrice ?? null,
    dollarVolume: overrides.dollarVolume ?? null,
    closeDistanceFromHodPct: overrides.closeDistanceFromHodPct ?? 0.8,
  });
}

describe("AM Inbox default continuation list (Finding #8 regression)", () => {
  it("CASE B — five qualified with missing persisted dollar but price×volume available become priority", () => {
    const contexts = ["A", "B", "C", "D", "E"].map((symbol) =>
      qualifiedHandoff(symbol, { volume: 500_000, lastPrice: 12, dollarVolume: null }),
    );
    for (const context of contexts) {
      expect(
        qualifiesLateSessionHandoffCandidate({
          context,
          workflow: null,
          sourceCategories: ["POWER_HOUR_MOMENTUM"],
        }),
      ).toBe(true);
    }

    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", contexts);
    expect(view.funnel.detectedCount).toBe(5);
    expect(view.funnel.qualifiedCount).toBe(5);
    expect(view.funnel.priorityCount).toBeGreaterThan(0);
    expect(view.candidates.length).toBeGreaterThan(0);
    expect(view.funnel.displayUsesQualifiedFallback).toBe(false);
  });

  it("CASE B — qualified with no liquidity derivation still shows volume-ranked fallback default", () => {
    const contexts = ["A", "B", "C", "D", "E"].map((symbol) =>
      qualifiedHandoff(symbol, {
        volume: 450_000,
        rvol: 7,
        lastPrice: null,
        dollarVolume: null,
      }),
    );

    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", contexts);
    expect(view.funnel.detectedCount).toBe(5);
    expect(view.funnel.qualifiedCount).toBe(5);
    expect(view.funnel.priorityCount).toBe(0);
    expect(view.funnel.displayUsesQualifiedFallback).toBe(true);
    expect(view.candidates).toHaveLength(5);
    expect(view.candidates.every((entry) =>
      !isLateSessionPriorityCandidate(entry, view.qualifiedCandidates)
    )).toBe(true);
  });

  it("CASE A — full liquidity data keeps priority-only default", () => {
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [
      qualifiedHandoff("STRONG", {
        volume: 20_000_000,
        rvol: 12,
        dollarVolume: 200_000_000,
        lastPrice: 10,
      }),
    ]);
    expect(view.funnel.priorityCount).toBe(1);
    expect(view.candidates).toHaveLength(1);
    expect(view.funnel.displayUsesQualifiedFallback).toBe(false);
  });

  it("CASE C — no qualified names leaves default empty", () => {
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [
      qualifiedHandoff("LOW", { volume: 50_000, rvol: 20 }),
    ]);
    expect(view.funnel.qualifiedCount).toBe(0);
    expect(view.funnel.priorityCount).toBe(0);
    expect(view.candidates).toHaveLength(0);
  });

  it("CASE D — unqualified rows never appear in default display", () => {
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [
      qualifiedHandoff("BAD", { volume: 10_000, rvol: 5 }),
      qualifiedHandoff("OK", { volume: 8_000_000, rvol: 10, dollarVolume: 80_000_000 }),
    ]);
    expect(view.funnel.qualifiedCount).toBe(1);
    expect(view.candidates.map((c) => c.context.symbol)).toEqual(["OK"]);
  });

  it("CASE E — volume-is-king ordering preserved in fallback slice", () => {
    const contexts = [
      qualifiedHandoff("LOW", { volume: 440_000, rvol: 9, lastPrice: null }),
      qualifiedHandoff("HIGH", { volume: 460_000, rvol: 5, lastPrice: null }),
    ];
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", contexts);
    expect(view.funnel.displayUsesQualifiedFallback).toBe(true);
    expect(view.candidates[0]?.context.symbol).toBe("HIGH");
  });

  it("regression fixture: 5 detected / 5 qualified / 0 priority before fix path", () => {
    const contexts = Array.from({ length: 5 }, (_, i) =>
      qualifiedHandoff(`S${i}`, {
        volume: 500_000,
        rvol: 6,
        lastPrice: null,
        dollarVolume: null,
      }),
    );
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", contexts);
    expect(view.funnel).toMatchObject({
      detectedCount: 5,
      qualifiedCount: 5,
      priorityCount: 0,
    });
    expect(view.candidates.length).toBe(Math.min(5, AM_INBOX_LATE_SESSION_VISIBLE_LIMIT));
  });
});
