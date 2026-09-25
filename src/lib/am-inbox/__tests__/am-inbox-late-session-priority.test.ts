import { describe, expect, it } from "vitest";
import {
  compareAmInboxLateSessionCandidates,
  rankAmInboxLateSessionCandidates,
} from "@/lib/am-inbox/am-inbox-late-session-priority";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";

type CandidateOverrides = Omit<
  Partial<AmInboxLateSessionCandidate["context"]>,
  "evidenceLabels"
> & {
  symbol: string;
  evidenceLabels?: readonly string[];
};

function candidate(
  overrides: CandidateOverrides,
  sourceCategories?: AmInboxLateSessionCandidate["sourceCategories"],
): AmInboxLateSessionCandidate {
  const { evidenceLabels: evidenceOverride, ...ctxOverrides } = overrides;
  const ctx = buildLateSessionContinuationContext({
    symbol: overrides.symbol,
    sourceSessionDate: ctxOverrides.sourceSessionDate ?? "2026-09-21",
    sourceTimestamp: ctxOverrides.sourceTimestamp ?? "2026-09-21T20:00:00.000Z",
    sourceCategory: ctxOverrides.sourceCategory ?? "DAY_TWO_WATCH",
    volume: ctxOverrides.volume ?? null,
    rvol: ctxOverrides.rvol ?? null,
    dollarVolume: ctxOverrides.dollarVolume ?? null,
    closeDistanceFromHodPct: ctxOverrides.closeDistanceFromHodPct ?? null,
    catalystPresent: ctxOverrides.catalystPresent ?? null,
    afterHoursExtends: ctxOverrides.afterHoursExtends ?? null,
  });
  return {
    context: {
      ...ctx,
      evidenceLabels: (evidenceOverride ?? ctx.evidenceLabels) as typeof ctx.evidenceLabels,
      historicalContextAvailable:
        ctxOverrides.historicalContextAvailable ?? ctx.historicalContextAvailable,
      comparableEpisodeCount: ctxOverrides.comparableEpisodeCount ?? ctx.comparableEpisodeCount,
    },
    workflow: null,
    sourceCategories: sourceCategories ?? [ctx.sourceCategory],
  };
}

describe("AM Inbox late-session priority ranking", () => {
  it("ranks high volume and RVOL above sparse day-two tags", () => {
    const strong = candidate({
      symbol: "HIGH",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 12_000_000,
      dollarVolume: 80_000_000,
      rvol: 8,
      evidenceLabels: ["VOLUME EXPLOSION"],
    });
    const weak = candidate({
      symbol: "WEAK",
      sourceCategory: "DAY_TWO_WATCH",
      volume: 200_000,
      rvol: null,
      dollarVolume: null,
      evidenceLabels: [],
    });
    expect(compareAmInboxLateSessionCandidates(strong, weak)).toBeLessThan(0);
    const ranked = rankAmInboxLateSessionCandidates([weak, strong]);
    expect(ranked[0]?.context.symbol).toBe("HIGH");
  });

  it("does not fabricate catalyst or history when ranking", () => {
    const row = candidate({
      symbol: "ZZZ",
      sourceCategory: "STRONG_CLOSE_NEAR_HOD",
      rvol: null,
      catalystPresent: null,
    });
    expect(row.context.catalystPresent).toBeNull();
    expect(row.context.historicalContextAvailable).toBe(false);
    expect(row.context.rvol).toBeNull();
  });

  it("prefers verified catalyst over none when volume is similar", () => {
    const withCatalyst = candidate({
      symbol: "CAT",
      volume: 5_000_000,
      dollarVolume: 20_000_000,
      rvol: 3,
      catalystPresent: true,
    });
    const without = candidate({
      symbol: "NOCAT",
      volume: 5_000_000,
      dollarVolume: 20_000_000,
      rvol: 3,
      catalystPresent: false,
    });
    expect(compareAmInboxLateSessionCandidates(withCatalyst, without)).toBeLessThan(0);
  });
});
