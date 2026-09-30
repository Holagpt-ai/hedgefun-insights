import { describe, expect, it } from "vitest";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import { qualifiesLateSessionHandoffCandidate } from "@/lib/am-inbox/late-session-handoff-qualification";
import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";

function candidate(volume: number, rvol: number | null): AmInboxLateSessionCandidate {
  const context = buildLateSessionContinuationContext({
    symbol: "ZZ",
    sourceSessionDate: "2026-09-21",
    sourceTimestamp: "2026-09-21T20:00:00.000Z",
    sourceCategory: "POWER_HOUR_MOMENTUM",
    volume,
    rvol,
  });
  return { context, workflow: null, sourceCategories: ["POWER_HOUR_MOMENTUM"] };
}

describe("late session handoff qualification", () => {
  it("requires minimum session volume", () => {
    expect(qualifiesLateSessionHandoffCandidate(candidate(100_000, 5))).toBe(false);
  });

  it("passes with volume and rvol evidence", () => {
    expect(qualifiesLateSessionHandoffCandidate(candidate(500_000, 4))).toBe(true);
  });
});
