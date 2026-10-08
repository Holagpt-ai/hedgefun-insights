import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ANALYST_INTELLIGENCE_MAX_CHARS,
  buildAnalystIntelligenceDeliveryBundle,
  buildModelSystemIntelligenceSection,
} from "./analyst-intelligence-delivery.ts";

function buildOversizedMrvlPacket(): Record<string, unknown> {
  const fillerRows = Array.from({ length: 40 }, (_, i) => ({
    eventType: "company_news",
    eventDate: "2026-10-06",
    title: `Internal filler catalyst headline ${i} `.repeat(12),
    publishedAt: "2026-10-06T10:00:00.000Z",
    verificationState: "provider_reported",
    sourceUrl: `https://internal.example.com/catalyst/${i}`,
    evidenceOrigin: "stocksist_catalyst",
  }));

  return {
    symbol: "MRVL",
    assembledAt: "2026-10-06T14:00:00.000Z",
    VERIFIED_FACTS: {
      symbol: "MRVL",
      catalystRows: fillerRows,
      journalRows: [],
      confirmedScannerEvent: null,
      workflowHandoff: null,
      handoffSource: null,
      padding: "x".repeat(3000),
    },
    HISTORICAL_EVIDENCE: {
      workflowSummary: {
        historicalContextAvailable: true,
        comparableEpisodeCount: 99,
        mostRecentComparableDate: "2026-09-01",
        sampleSizeQuality: "mixed",
        evidenceLabels: ["repeat_mover"],
        note: "Historical narrative padding ".repeat(200),
      },
      defersDetailedEpisodesToHistoricalMemory: true,
      historicalMatchSummary: { summary: "y".repeat(2500) },
    },
    CURRENT_SESSION_EVIDENCE: {
      radar: {
        available: true,
        symbol: "MRVL",
        tradingDate: "2026-10-06",
        recentEvents: Array.from({ length: 20 }, (_, i) => ({ eventType: "MOMENTUM", eventAt: `2026-10-06T${10 + i}:00:00Z` })),
        padding: "z".repeat(1500),
      },
      watchlist: { available: false },
      priorSessionContinuation: [],
      temporalNote: "t".repeat(800),
    },
    MODEL_INTERPRETATION: {
      catalystAnswerMode: "CURRENT_CATALYST_FIRST",
      catalystAnswerGuidance: "Lead with verified primary catalyst. ".repeat(40),
      dataHonesty: "Do not invent.",
      responseStructure: "PRIMARY CATALYST / KEY DETAILS",
    },
    CURRENT_CATALYST_ANALYSIS: {
      verifiedPrimary: true,
      explicitNoVerifiedCatalyst: false,
      primaryCatalyst: {
        title: "Marvell Technology Group Ltd. Investor Day — updated long-term revenue targets",
        eventDate: "2026-10-06",
        sourceUrl: "https://investor.marvell.com/news-events/press-releases/detail/2026/investor-day-outlook",
        primaryClass: "investor_day",
      },
      rankedEvidence: Array.from({ length: 12 }, (_, i) => ({
        headline: `Evidence row ${i} `.repeat(8),
        tier: i === 0 ? "primary" : "secondary",
      })),
      catalystEvidenceFacts: [{
        category: "revenue_guidance",
        statement: "Stated revenue target $20B for FY2028.",
        fiscalYear: "2028",
        amountLabel: "$20B",
        sourceUrl: "https://investor.marvell.com/news-events/press-releases/detail/2026/investor-day-outlook",
        verificationLevel: "official_page",
      }],
      verifiedVsInferredGuidance: "Use catalystEvidenceFacts for KEY DETAILS.",
      answerGuidance: "Lead with PRIMARY CATALYST. ".repeat(30),
    },
    FRESH_CATALYST_DISCOVERY: {
      attempted: true,
      succeeded: true,
      searchQueries: ["MRVL Marvell investor day guidance news 2026-10-06"],
    },
    unavailable: {
      radar: false,
      watchlist: true,
      catalyst: false,
      continuation: true,
      keyLevels: false,
      historicalDetail: false,
    },
  };
}

Deno.test("oversized MRVL packet preserves FY2028 $20B in constructed model intelligence section", () => {
  const payload = buildOversizedMrvlPacket();
  const naive = JSON.stringify(payload);
  assert(naive.length > ANALYST_INTELLIGENCE_MAX_CHARS, "fixture should exceed legacy 4500 slice");

  const section = buildModelSystemIntelligenceSection(payload);
  assert(section.includes("FY2028"));
  assert(section.includes("$20B"));
  assert(section.includes("priorityCatalystEvidence"));
  assert(section.includes("official_page"));

  const jsonStart = section.indexOf("{");
  const jsonEnd = section.lastIndexOf("}") + 1;
  const parsed = JSON.parse(section.slice(jsonStart, jsonEnd)) as {
    priorityCatalystEvidence: {
      verifiedFinancialFacts: Array<{ fiscalYear: string; amountLabel: string }>;
      sessionDate: string | null;
    };
    intelligence: Record<string, unknown>;
  };

  assertEquals(
    parsed.priorityCatalystEvidence.verifiedFinancialFacts.some(
      (f) => f.fiscalYear === "2028" && f.amountLabel === "$20B",
    ),
    true,
  );
  assertEquals(parsed.priorityCatalystEvidence.sessionDate, "2026-10-06");

  const innerJson = section.slice(jsonStart, jsonEnd);
  assert(innerJson.length <= ANALYST_INTELLIGENCE_MAX_CHARS);
  assertEquals(JSON.parse(innerJson).priorityCatalystEvidence != null, true);

  const analysis = parsed.intelligence.CURRENT_CATALYST_ANALYSIS as Record<string, unknown>;
  assertEquals(analysis.catalystEvidenceFactsDeliveredInPriorityBlock, true);
  assertEquals("catalystEvidenceFacts" in analysis, false);
});

Deno.test("delivery bundle stays valid JSON under budget", () => {
  const bundle = buildAnalystIntelligenceDeliveryBundle(buildOversizedMrvlPacket());
  const serialized = JSON.stringify(bundle);
  assert(serialized.length <= ANALYST_INTELLIGENCE_MAX_CHARS);
  JSON.parse(serialized);
});

Deno.test("no verified facts yields null priority block without fabrication", () => {
  const bundle = buildAnalystIntelligenceDeliveryBundle({
    symbol: "AAA",
    MODEL_INTERPRETATION: { catalystAnswerMode: "STANDARD" },
    VERIFIED_FACTS: { catalystRows: [] },
  });
  assertEquals(bundle.priorityCatalystEvidence, null);
});
