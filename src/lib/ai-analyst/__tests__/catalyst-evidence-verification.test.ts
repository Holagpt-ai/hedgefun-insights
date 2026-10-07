import { describe, expect, it } from "vitest";
import {
  extractExplicitMaterialFacts,
  inferEventTypeFromSearchEvidence,
  rowQualifiesAsVerifiedPrimary,
  searchEvidenceUsesPageContentFetch,
} from "@/lib/ai-analyst/catalyst-evidence-verification";
import { normalizeWebSearchHit } from "@/lib/ai-analyst/current-catalyst-fallback";
import { mergeAndSelectCatalystEvidence, scoreCatalystRow } from "@/lib/ai-analyst/catalyst-selection";
import { buildCurrentCatalystAnalysis } from "@/lib/ai-analyst/current-catalyst";

describe("catalyst search evidence verification", () => {
  it("uses Brave title/snippet only — no page content fetch", () => {
    expect(searchEvidenceUsesPageContentFetch()).toBe(false);
  });

  it("classifies vague rally headline as market_attention, not earnings", () => {
    const title = "Why Marvell (MRVL) Stock Rallied Today on Earnings Beat Hopes";
    expect(inferEventTypeFromSearchEvidence(title, "Shares jumped amid speculation.")).toBe("market_attention");
  });

  it("does not extract EPS/margin facts from unverified vague headlines", () => {
    const row = normalizeWebSearchHit(
      {
        title: "Why Marvell Stock Rallied on EPS surprise and margin upside",
        url: "https://news.example.com/mrvl-rally",
        snippet: "Traders cite optimism.",
      },
      "MRVL",
    );
    expect(extractExplicitMaterialFacts(row)).toBeNull();
    expect(rowQualifiesAsVerifiedPrimary(row, scoreCatalystRow(row).precedence)).toBe(false);
  });

  it("vague secondary-only search cannot verify earnings primary", () => {
    const row = normalizeWebSearchHit(
      {
        title: "Why Marvell (MRVL) Stock Rallied Today on Earnings Beat Hopes",
        url: "https://news.example.com/why-mrvl",
        snippet: "No company filing cited.",
      },
      "MRVL",
    );
    const { analysis } = mergeAndSelectCatalystEvidence({
      symbol: "MRVL",
      internal: [],
      fromSearch: [row],
      buildAnalysis: buildCurrentCatalystAnalysis,
    });
    expect(analysis.verifiedPrimary).toBe(false);
    expect(analysis.primaryCatalyst?.eventType).not.toBe("earnings");
    expect(analysis.primaryCatalyst?.primaryClass).not.toBe("earnings_guidance");
  });
});
