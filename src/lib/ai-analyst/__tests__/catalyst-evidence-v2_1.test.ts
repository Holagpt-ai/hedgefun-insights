import { describe, expect, it } from "vitest";
import { enrichAuthoritativeCatalystFacts } from "@/lib/ai-analyst/catalyst-authoritative-enrich";
import { enrichPacketWithSearchEvidence } from "@/lib/ai-analyst/current-catalyst-fallback";
import { buildAnalystIntelligencePacket } from "@/lib/ai-analyst/build-intelligence-packet";
import {
  classifyCatalystFetchUrl,
  extractStructuredFactsFromPlainText,
} from "@/lib/ai-analyst/catalyst-evidence-facts";

describe("catalyst evidence v2.1 — source recovery and fact extraction", () => {
  it("extracts monetary and fiscal variants from attributable transcript-style HTML", () => {
    const body =
      "Management said total company revenue could reach 20 billion dollars by fiscal year 2028, "
      + "while data-center revenue is expected to be approximately $18 billion in FY'28.";
    const facts = extractStructuredFactsFromPlainText(body, "https://news.example.com/transcript", "attributed_secondary");
    const total = facts.find((f) => f.category === "revenue_guidance" && f.amountLabel === "$20B");
    const segment = facts.find((f) => f.category === "segment_revenue_guidance" && f.amountLabel === "$18B");
    expect(total?.fiscalYear).toBe("2028");
    expect(segment?.fiscalYear).toBe("2028");
    expect(total?.amountLabel).not.toBe(segment?.amountLabel);
  });

  it("supports FY28 and $20 billion phrasing for investor-day fixtures", () => {
    const body = "At Investor Day the company outlined a path to $20 billion of revenue by FY28.";
    const facts = extractStructuredFactsFromPlainText(body, "https://investor.example.com/event", "official_page");
    expect(facts.some((f) => f.fiscalYear === "2028" && f.amountLabel === "$20B")).toBe(true);
  });

  it("returns no financial facts when official page mentions the event only", async () => {
    const enrichment = await enrichAuthoritativeCatalystFacts({
      primaryRow: {
        eventType: "company_news",
        eventDate: "2026-10-06",
        title: "Company Investor Day 2026",
        publishedAt: "2026-10-06T12:00:00.000Z",
        verificationState: "provider_reported",
        sourceUrl: "https://investor.example.com/investor-day",
        officialSource: true,
      },
      supportingRows: [],
      fetchHtml: async () => "<html><body>Executives discussed strategy and product roadmaps without numeric targets.</body></html>",
    });
    expect(enrichment.facts.length).toBe(0);
    expect(enrichment.fetchAttempts.some((a) => a.outcome === "ok_no_facts")).toBe(true);
    expect(enrichment.deliveryStatus).toBe("no_verifiable_facts");
  });

  it("does not treat headline-only guidance as verified figures", async () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "AAA",
      userQuestion: "Why is AAA up today?",
      catalystRows: [],
    });
    const enriched = await enrichPacketWithSearchEvidence({
      packet,
      searchHits: [{
        title: "AAA raises FY2028 revenue guidance to $20B",
        url: "https://news.example.com/aaa-headline",
        snippet: "Shares moved on guidance headlines.",
      }],
      discovery: { attempted: true, succeeded: true, searchQueries: ["q"], source: "brave_web_search", error: null },
    });
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.catalystEvidenceFacts?.length ?? 0).toBe(0);
  });

  it("skips unsupported PDF URLs safely", async () => {
    const enrichment = await enrichAuthoritativeCatalystFacts({
      primaryRow: {
        eventType: "company_news",
        eventDate: "2026-10-06",
        title: "Investor presentation",
        publishedAt: null,
        verificationState: "provider_reported",
        sourceUrl: "https://investor.example.com/files/outlook.pdf",
        officialSource: true,
      },
      supportingRows: [],
      fetchHtml: async () => "should-not-run",
    });
    expect(enrichment.fetchAttempts[0]?.outcome).toBe("pdf_skipped");
    expect(enrichment.facts.length).toBe(0);
  });

  it("records HTTP 403 from third-party recovery without inventing facts", async () => {
    const secondary = "https://www.reuters.com/markets/example-story";
    const enrichment = await enrichAuthoritativeCatalystFacts({
      primaryRow: {
        eventType: "company_news",
        eventDate: "2026-10-06",
        title: "Investor Day",
        publishedAt: null,
        verificationState: "provider_reported",
        sourceUrl: "https://investor.example.com/investor-day",
        officialSource: true,
      },
      supportingRows: [{
        eventType: "company_news",
        eventDate: "2026-10-06",
        title: "Reuters recap",
        publishedAt: null,
        verificationState: "web_search_unverified",
        sourceUrl: secondary,
        officialSource: false,
      }],
      fetchContent: async (url) => {
        if (url === secondary) return { httpStatus: 403, contentType: "text/html", body: "" };
        return {
          httpStatus: 200,
          contentType: "text/html",
          body: "<html><body>Investor Day featured leadership presentations.</body></html>",
        };
      },
    });
    expect(enrichment.facts.length).toBe(0);
    expect(enrichment.fetchAttempts.some((a) => a.url === secondary && a.outcome === "http_error")).toBe(true);
  });

  it("recovers FY2028 total revenue from Reuters-style body when IR page lacks figures", async () => {
    const irUrl = "https://investor.example.com/investor-day-2026";
    const reutersUrl = "https://www.reuters.com/technology/chipmaker-investor-day-2026-10-06/";
    const packet = buildAnalystIntelligencePacket({
      symbol: "AAA",
      userQuestion: "Why is AAA up on October 6, 2026?",
      catalystRows: [],
    });
    const enriched = await enrichPacketWithSearchEvidence({
      packet,
      searchHits: [
        { title: "AAA Investor Day 2026", url: irUrl, snippet: "Company hosted Investor Day." },
        { title: "Chipmaker targets $20B revenue by FY2028 at investor day", url: reutersUrl, snippet: "..." },
      ],
      discovery: { attempted: true, succeeded: true, searchQueries: ["q"], source: "brave_web_search", error: null },
      fetchAuthoritativeHtml: async (url) => {
        if (url === irUrl) return "<html><body>Investor Day press release without numeric targets.</body></html>";
        if (url === reutersUrl) {
          return "<html><body>Analysts noted total company revenue guidance of $20 billion by FY2028.</body></html>";
        }
        return null;
      },
    });
    const facts = enriched.CURRENT_CATALYST_ANALYSIS?.catalystEvidenceFacts ?? [];
    expect(facts.some((f) => f.fiscalYear === "2028" && f.amountLabel === "$20B" && f.verificationLevel === "attributed_secondary")).toBe(true);
  });

  it("classifies RSS follow-up slots as non-fetchable", () => {
    expect(classifyCatalystFetchUrl("https://investor.example.com/feeds/press.xml")).toBe("rss_skip");
  });

});
