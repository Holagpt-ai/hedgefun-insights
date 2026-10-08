import { describe, expect, it } from "vitest";
import { buildAnalystIntelligencePacket } from "@/lib/ai-analyst/build-intelligence-packet";
import { enrichPacketWithSearchEvidence, normalizeWebSearchHit } from "@/lib/ai-analyst/current-catalyst-fallback";
import { limitScoredCatalystCandidates } from "@/lib/ai-analyst/catalyst-evidence-candidate-pool";
import { extractStructuredFactsFromPlainText } from "@/lib/ai-analyst/catalyst-evidence-facts";
import { mergeAndSelectCatalystEvidence } from "@/lib/ai-analyst/catalyst-selection";
import { buildCurrentCatalystAnalysis } from "@/lib/ai-analyst/current-catalyst";

describe("catalyst evidence depth v2", () => {
  it("extracts FY2028 $20B guidance from official page text only", () => {
    const body =
      "At Investor Day, Marvell outlined a long-term revenue target of $20B by FY2028 driven by data center growth.";
    const facts = extractStructuredFactsFromPlainText(body, "https://investor.marvell.com/day", "official_page");
    expect(facts.some((f) => f.fiscalYear === "2028" && f.amountLabel === "$20B")).toBe(true);
    expect(facts[0]?.verificationLevel).toBe("official_page");
  });

  it("does not fabricate guidance when fetch body lacks explicit figures", async () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why was MRVL up on October 6, 2026?",
      catalystRows: [],
    });
    const enriched = await enrichPacketWithSearchEvidence({
      packet,
      searchHits: [{
        title: "Marvell Technology Group Ltd. Investor Day 2026",
        url: "https://investor.marvell.com/news-events/press-releases/detail/2026/investor-day",
        snippet: "Management hosted Investor Day.",
      }],
      discovery: { attempted: true, succeeded: true, searchQueries: ["q"], source: "brave_web_search", error: null },
      fetchAuthoritativeHtml: async () => "<html><body>Investor Day featured product roadmaps without numeric targets.</body></html>",
    });
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.catalystEvidenceFacts?.length ?? 0).toBe(0);
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.authoritativeContentFetch?.urls.length).toBe(1);
  });

  it("MRVL Oct 6 retains Investor Day primary and FY2028 $20B from authoritative fetch", async () => {
    const irUrl = "https://investor.marvell.com/news-events/press-releases/detail/2026/investor-day-outlook";
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "MRVL? Why is it up this morning?",
      catalystRows: [],
    });
    const enriched = await enrichPacketWithSearchEvidence({
      packet,
      searchHits: [
        {
          title: "Semiconductor stocks gain on AI demand",
          url: "https://news.example.com/semis-ai",
          snippet: "Sector strength.",
        },
        {
          title: "Marvell announces date for Investor Day",
          url: "https://investor.marvell.com/news-events/press-releases/detail/2026/investor-day-announcement",
          snippet: "Marvell announced it will host Investor Day on October 6, 2026.",
        },
        {
          title: "Marvell Technology Group Ltd. Investor Day — updated long-term revenue targets",
          url: irUrl,
          snippet: "Management presented updated long-term revenue targets at Investor Day.",
        },
      ],
      discovery: {
        attempted: true,
        succeeded: true,
        searchQueries: ["MRVL Marvell investor day guidance news 2026-10-06"],
        source: "brave_web_search",
        error: null,
      },
      fetchAuthoritativeHtml: async (url) => {
        if (url === irUrl) {
          return "<html><body>Marvell targets $20B in revenue by FY2028 at its October 6, 2026 Investor Day.</body></html>";
        }
        return null;
      },
    });

    expect(enriched.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(true);
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.primaryCatalyst?.title).toMatch(/Investor Day/i);
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.primaryCatalyst?.title).not.toMatch(/announces date/i);
    const facts = enriched.CURRENT_CATALYST_ANALYSIS?.catalystEvidenceFacts ?? [];
    expect(facts.some((f) => f.fiscalYear === "2028" && f.amountLabel === "$20B")).toBe(true);
    expect(facts.find((f) => f.amountLabel === "$20B")?.sourceUrl).toBe(irUrl);
  });

  it("keeps strong official search hits when internal rows fill the legacy cap", () => {
    const internal = Array.from({ length: 6 }, (_, i) => ({
      eventType: "company_news",
      eventDate: "2026-10-06",
      title: `Internal filler catalyst headline ${i}`,
      publishedAt: "2026-10-06T10:00:00.000Z",
      verificationState: "provider_reported",
      evidenceOrigin: "stocksist_catalyst" as const,
      officialSource: false,
    }));
    const official = normalizeWebSearchHit({
      title: "Marvell Technology Group Ltd. Investor Day 2026 — financial outlook",
      url: "https://investor.marvell.com/news-events/press-releases/investor-day-2026",
      snippet: "Official investor day.",
    }, "MRVL");
    const searchFill = Array.from({ length: 11 }, (_, i) => normalizeWebSearchHit({
      title: `Secondary search hit ${i}`,
      url: `https://news.example.com/mrvl-${i}`,
      snippet: "noise",
    }, "MRVL"));

    const { analysis } = mergeAndSelectCatalystEvidence({
      symbol: "MRVL",
      internal,
      fromSearch: [...searchFill, official],
      buildAnalysis: buildCurrentCatalystAnalysis,
    });
    expect(analysis.primaryCatalyst?.title).toMatch(/Investor Day/i);
    const { rows, totalEligible } = limitScoredCatalystCandidates([...internal, ...searchFill, official]);
    expect(totalEligible).toBe(18);
    expect(rows.some((r) => r.title?.includes("Investor Day"))).toBe(true);
  });
});
