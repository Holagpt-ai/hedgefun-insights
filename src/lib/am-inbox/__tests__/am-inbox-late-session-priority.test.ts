import { describe, expect, it } from "vitest";
import {
  compareAmInboxLateSessionCandidates,
  computeAmInboxLateSessionPriorityScore,
  rankAmInboxLateSessionCandidates,
} from "@/lib/am-inbox/am-inbox-late-session-priority";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import type { ContinuationCategory } from "@/config/continuation.config";

type CandidateOverrides = Omit<
  Partial<AmInboxLateSessionCandidate["context"]>,
  "evidenceLabels"
> & {
  symbol: string;
  evidenceLabels?: readonly string[];
};

function candidate(
  overrides: CandidateOverrides,
  sourceCategories?: readonly ContinuationCategory[],
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

const ALL_CATEGORIES: readonly ContinuationCategory[] = [
  "POWER_HOUR_MOMENTUM",
  "AFTER_HOURS_CONTINUATION",
  "STRONG_CLOSE_NEAR_HOD",
  "DAY_TWO_WATCH",
];

function richlyTaggedWeakVolume(symbol: string): AmInboxLateSessionCandidate {
  return candidate(
    {
      symbol,
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 200_000,
      dollarVolume: null,
      rvol: null,
      catalystPresent: true,
      afterHoursExtends: true,
      closeDistanceFromHodPct: 0.5,
      historicalContextAvailable: true,
      comparableEpisodeCount: 6,
      evidenceLabels: ["VOLUME EXPLOSION", "RUNNING UP", "extra"],
    },
    ALL_CATEGORIES,
  );
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

  it("does not let richly tagged weak volume beat clearly higher session volume", () => {
    const weakRich = richlyTaggedWeakVolume("TAGS");
    const highVolumePlain = candidate({
      symbol: "BIG",
      sourceCategory: "DAY_TWO_WATCH",
      volume: 10_000_000,
      dollarVolume: null,
      rvol: 10,
      catalystPresent: false,
      evidenceLabels: [],
    });
    expect(computeAmInboxLateSessionPriorityScore(weakRich)).toBeGreaterThan(
      computeAmInboxLateSessionPriorityScore(highVolumePlain),
    );
    expect(compareAmInboxLateSessionCandidates(highVolumePlain, weakRich)).toBeLessThan(0);
  });

  it("uses extreme RVOL after volume and dollar volume match", () => {
    const extremeRvol = candidate({
      symbol: "RVOL",
      volume: 5_000_000,
      dollarVolume: 25_000_000,
      rvol: 25,
    });
    const moderateRvol = candidate({
      symbol: "MID",
      volume: 5_000_000,
      dollarVolume: 25_000_000,
      rvol: 3,
    });
    expect(compareAmInboxLateSessionCandidates(extremeRvol, moderateRvol)).toBeLessThan(0);
  });

  it("breaks ties on scanner event labels only after volume metrics match", () => {
    const base = {
      volume: 4_000_000,
      dollarVolume: 18_000_000,
      rvol: 6,
      sourceCategory: "POWER_HOUR_MOMENTUM" as const,
    };
    const explosion = candidate({ ...base, symbol: "BOOM", evidenceLabels: ["VOLUME EXPLOSION"] });
    const running = candidate({ ...base, symbol: "RUN", evidenceLabels: ["RUNNING UP"] });
    expect(compareAmInboxLateSessionCandidates(explosion, running)).toBeLessThan(0);
  });

  it("applies catalyst tie-break only when volume, dollar volume, and RVOL match", () => {
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

    const weakWithCatalyst = candidate({
      symbol: "WEAKCAT",
      volume: 300_000,
      dollarVolume: 1_000_000,
      rvol: 1,
      catalystPresent: true,
    });
    const strongNoCatalyst = candidate({
      symbol: "STRONG",
      volume: 8_000_000,
      dollarVolume: 40_000_000,
      rvol: 4,
      catalystPresent: false,
    });
    expect(compareAmInboxLateSessionCandidates(strongNoCatalyst, weakWithCatalyst)).toBeLessThan(0);
  });

  it("does not over-penalize when only one core metric is missing", () => {
    const withVolumeOnly = candidate({
      symbol: "VOL",
      volume: 6_000_000,
      dollarVolume: null,
      rvol: null,
    });
    const fullyMissing = candidate({
      symbol: "EMPTY",
      volume: null,
      dollarVolume: null,
      rvol: null,
      evidenceLabels: [],
    });
    expect(computeAmInboxLateSessionPriorityScore(withVolumeOnly)).toBeGreaterThan(
      computeAmInboxLateSessionPriorityScore(fullyMissing),
    );
    expect(compareAmInboxLateSessionCandidates(withVolumeOnly, fullyMissing)).toBeLessThan(0);
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

  it("ranks deterministically for identical inputs", () => {
    const a = candidate({ symbol: "AAA", volume: 1_000_000, rvol: 2 });
    const b = candidate({ symbol: "BBB", volume: 1_000_000, rvol: 2 });
    expect(compareAmInboxLateSessionCandidates(a, b)).toBeLessThan(0);
    expect(compareAmInboxLateSessionCandidates(b, a)).toBeGreaterThan(0);
    expect(rankAmInboxLateSessionCandidates([b, a]).map((c) => c.context.symbol)).toEqual([
      "AAA",
      "BBB",
    ]);
  });
});
