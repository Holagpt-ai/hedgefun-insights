import { describe, expect, it } from "vitest";
import { normalizeWebSearchHit } from "@/lib/ai-analyst/current-catalyst-fallback";
import { mergeAndSelectCatalystEvidence } from "@/lib/ai-analyst/catalyst-selection";
import { buildCurrentCatalystAnalysis } from "@/lib/ai-analyst/current-catalyst";

const officialInvestorDay = normalizeWebSearchHit(
  {
    title: "Marvell Technology Group Ltd. Investor Day 2026 — financial outlook and long-term targets",
    url: "https://investor.marvell.com/news-events/press-releases/detail/2026/investor-day",
    snippet: "Management presented updated long-term revenue targets including $20B by FY2028.",
    publishedAt: "2026-10-06T13:00:00.000Z",
  },
  "MRVL",
);

const weakRallyArticle = normalizeWebSearchHit(
  {
    title: "Why Marvell (MRVL) Stock Rallied Today on Earnings Beat Hopes",
    url: "https://news.example.com/why-mrvl-stock-rallied-today",
    snippet: "Shares jumped amid speculation about positive guidance.",
    publishedAt: "2026-10-06T14:30:00.000Z",
  },
  "MRVL",
);

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (i * 7 + 3) % (i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

describe("deterministic catalyst selection stability", () => {
  it("official Investor Day wins over weak rally article regardless of search order", () => {
    let expectedStableKey: string | null = null;
    for (let run = 0; run < 40; run++) {
      const ordered = shuffle([officialInvestorDay, weakRallyArticle]);
      const { analysis, trace } = mergeAndSelectCatalystEvidence({
        symbol: "MRVL",
        internal: [],
        fromSearch: ordered,
        searchQueries: ["MRVL Marvell investor day 2026-10-06"],
        buildAnalysis: buildCurrentCatalystAnalysis,
      });
      expect(analysis.primaryCatalyst?.title).toMatch(/Investor Day/i);
      expect(trace.selectedPrimaryHeadline).toMatch(/Investor Day/i);
      expect(trace.selectionStableKey).toMatch(/investor_day/i);
      expect(trace.selectedPrimaryClass).toBe("investor_day");
      expect(analysis.primaryCatalyst?.primaryClass).toBe("investor_day");
      expect(analysis.primaryCatalyst?.primaryClass).not.toBe("strategic_agreement");
      expect(analysis.primaryCatalyst?.eventType).toBe("investor_day");
      if (expectedStableKey == null) expectedStableKey = trace.selectionStableKey;
      else expect(trace.selectionStableKey).toBe(expectedStableKey);
    }
  });

  it("does not classify weak article as primary earnings beat", () => {
    const { analysis } = mergeAndSelectCatalystEvidence({
      symbol: "MRVL",
      internal: [],
      fromSearch: [weakRallyArticle, officialInvestorDay],
      buildAnalysis: buildCurrentCatalystAnalysis,
    });
    expect(analysis.primaryCatalyst?.title).not.toMatch(/Why Marvell/i);
    expect(analysis.primaryCatalyst?.title).toMatch(/Investor Day/i);
  });

  it("records pipeline trace candidates with scores", () => {
    const { trace } = mergeAndSelectCatalystEvidence({
      symbol: "MRVL",
      internal: [],
      fromSearch: [weakRallyArticle, officialInvestorDay],
      searchQueries: ["q1", "q2"],
      buildAnalysis: buildCurrentCatalystAnalysis,
    });
    expect(trace.searchQueries).toEqual(["q1", "q2"]);
    expect(trace.candidates.length).toBe(2);
    expect(trace.candidates.every((c) => typeof c.selectionScore === "number")).toBe(true);
    expect(trace.candidates.find((c) => c.officialSource)?.selectionScore).toBeGreaterThan(
      trace.candidates.find((c) => !c.officialSource)?.selectionScore ?? 0,
    );
  });
});
