import { describe, expect, it } from "vitest";
import { buildAnalystIntelligencePacket } from "@/lib/ai-analyst/build-intelligence-packet";
import { enrichPacketWithSearchEvidence } from "@/lib/ai-analyst/current-catalyst-fallback";
import { buildCurrentCatalystAnalysis } from "@/lib/ai-analyst/current-catalyst";
import {
  ANALYST_INTELLIGENCE_MAX_CHARS,
  buildAnalystIntelligenceDeliveryBundle,
} from "../../../../supabase/functions/chat/analyst-intelligence-delivery";

const discovery = {
  attempted: true,
  succeeded: true,
  searchQueries: ["q"],
  source: "brave_web_search" as const,
  error: null,
};

describe("catalyst evidence boundaries", () => {
  it("does not attribute another company's official investor day to the asked symbol", async () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why was MRVL up on October 6, 2026?",
      catalystRows: [],
    });
    const enriched = await enrichPacketWithSearchEvidence({
      packet,
      searchHits: [{
        title: "NVIDIA Investor Day — updated long-term revenue targets of $20B by FY2028",
        url: "https://investor.nvidia.com/news/investor-day-outlook",
        snippet: "NVIDIA presented company revenue guidance.",
        publishedAt: "2026-10-06T15:00:00.000Z",
      }],
      discovery,
      fetchAuthoritativeHtml: async () => "<html><body>NVIDIA targets $20 billion by FY2028.</body></html>",
    });
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(false);
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.explicitNoVerifiedCatalyst).toBe(true);
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.catalystEvidenceFacts ?? []).toHaveLength(0);
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.primaryCatalyst?.title ?? "").not.toMatch(/NVIDIA/i);
  });

  it("keeps a same-company SEC headline and rejects an untitled filing with no symbol", async () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why was MRVL up on October 6, 2026?",
      catalystRows: [],
    });
    const wrongFiling = await enrichPacketWithSearchEvidence({
      packet,
      searchHits: [{
        title: "Form 8-K",
        url: "https://www.sec.gov/Archives/edgar/data/0001045810/form8k.htm",
        snippet: "Current report.",
        publishedAt: "2026-10-06T15:00:00.000Z",
      }],
      discovery,
    });
    expect(wrongFiling.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(false);

    const namedFiling = await enrichPacketWithSearchEvidence({
      packet,
      searchHits: [{
        title: "Marvell Technology Group Ltd. Form 8-K",
        url: "https://www.sec.gov/Archives/edgar/data/0001835632/form8k.htm",
        snippet: "Marvell filed a current report.",
        publishedAt: "2026-10-06T15:00:00.000Z",
      }],
      discovery,
    });
    expect(namedFiling.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(true);
    expect(namedFiling.CURRENT_CATALYST_ANALYSIS?.primaryCatalyst?.sourceUrl).toContain("sec.gov");
  });

  it("treats an older company event as historical context for the named session", () => {
    const analysis = buildCurrentCatalystAnalysis("MRVL", [{
      eventType: "company_news",
      eventDate: "2025-01-15",
      title: "Marvell hosts Investor Day and raises long-term revenue targets",
      publishedAt: "2025-01-15T13:00:00.000Z",
      verificationState: "provider_reported",
      sourceName: "Marvell IR",
      sourceUrl: "https://investor.marvell.com/news/2025-investor-day",
      officialSource: true,
    }], { asOfDate: "2026-10-06" });
    expect(analysis.verifiedPrimary).toBe(false);
    expect(analysis.explicitNoVerifiedCatalyst).toBe(true);
    expect(analysis.answerGuidance).toMatch(/historical context/i);
    expect(analysis.primaryCatalyst).toBeNull();
  });

  it("drops unsourced financial facts and keeps the delivery inside the character budget", () => {
    const bundle = buildAnalystIntelligenceDeliveryBundle({
      symbol: "MRVL",
      MODEL_INTERPRETATION: { catalystAnswerMode: "CURRENT_CATALYST_FIRST" },
      CURRENT_SESSION_EVIDENCE: { radar: { tradingDate: "2026-10-06" } },
      CURRENT_CATALYST_ANALYSIS: {
        verifiedPrimary: true,
        explicitNoVerifiedCatalyst: false,
        primaryCatalyst: {
          title: "Marvell Investor Day",
          eventDate: "2026-10-06",
          sourceUrl: "https://investor.marvell.com/day",
          primaryClass: "investor_day",
        },
        catalystEvidenceFacts: [
          {
            category: "revenue_guidance",
            statement: "Stated total company revenue target $20B for FY2028.",
            fiscalYear: "2028",
            amountLabel: "$20B",
            sourceUrl: "",
            verificationLevel: "headline_only",
          },
          {
            category: "revenue_guidance",
            statement: "Stated total company revenue target $20B for FY2028.",
            fiscalYear: "2028",
            amountLabel: "$20B",
            sourceUrl: "https://investor.marvell.com/day",
            verificationLevel: "official_page",
          },
        ],
        rankedEvidence: Array.from({ length: 20 }, (_, i) => ({
          headline: `padding ${i} `.repeat(30),
        })),
      },
      VERIFIED_FACTS: {
        catalystRows: Array.from({ length: 30 }, (_, i) => ({
          title: `row ${i} `.repeat(20),
          sourceUrl: `https://example.com/${i}`,
        })),
      },
      HISTORICAL_EVIDENCE: { note: "historical ".repeat(400) },
    });
    const serialized = JSON.stringify(bundle);
    expect(serialized.length).toBeLessThanOrEqual(ANALYST_INTELLIGENCE_MAX_CHARS);
    expect(JSON.parse(serialized)).toBeTruthy();
    expect(bundle.priorityCatalystEvidence?.symbol).toBe("MRVL");
    expect(bundle.priorityCatalystEvidence?.verifiedFinancialFacts).toHaveLength(1);
    expect(bundle.priorityCatalystEvidence?.verifiedFinancialFacts[0]?.sourceUrl).toContain("marvell.com");
    expect(bundle.priorityCatalystEvidence?.sessionDate).toBe("2026-10-06");
  });
});
