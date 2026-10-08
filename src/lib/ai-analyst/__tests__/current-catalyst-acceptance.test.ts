import { describe, expect, it } from "vitest";
import { buildAnalystIntelligencePacket } from "@/lib/ai-analyst/build-intelligence-packet";
import { enrichPacketWithSearchEvidence } from "@/lib/ai-analyst/current-catalyst-fallback";

/** Production-path acceptance: internal DB empty → fresh search discovers Investor Day. */
describe("CURRENT_CATALYST acceptance — MRVL Oct 6 2026", () => {
  it("MRVL? Why is it up this morning? discovers investor day via fresh search path", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "MRVL? Why is it up this morning?",
      catalystRows: [],
      radarCandidate: {
        symbol: "MRVL",
        trading_date: "2026-10-06",
        session_kind: "regular",
        lifecycle: "active",
        radar_event_lifecycle: "active",
        promotion_reason: null,
        primary_scanner_event: "MOMENTUM_SPIKE",
        primary_scanner_event_at: "2026-10-06T14:00:00Z",
        participation_state: "ELEVATED",
        time_adjusted_rvol: 3.2,
        rvol_5m: 4.1,
        volume_velocity: 120_000,
        volume_acceleration_pct: 40,
        acceleration_5m: 10,
        distance_from_hod_pct: 1,
        session_vwap: 80,
        session_high: 82,
        session_low: 76,
        previous_close: 75,
        last_price: 80.5,
      },
    });

    expect(packet.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(false);

    const enriched = enrichPacketWithSearchEvidence({
      packet,
      searchHits: [
        {
          title: "Semiconductor stocks gain on AI demand",
          url: "https://news.example.com/semis-ai",
          snippet: "Sector strength lifted chip names.",
        },
        {
          title: "Marvell Technology Group Ltd. Investor Day — updated long-term revenue targets",
          url: "https://investor.marvell.com/news-events/press-releases/detail/2026/investor-day-outlook",
          snippet: "Management presented updated long-term revenue and data center growth targets at Investor Day.",
        },
      ],
      discovery: {
        attempted: true,
        succeeded: true,
        searchQueries: ["MRVL Marvell investor day guidance news 2026-10-06"],
        source: "brave_web_search",
        error: null,
      },
    });

    expect(enriched.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(true);
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.primaryCatalyst?.title).toMatch(/Investor Day/i);
    expect(enriched.MODEL_INTERPRETATION.catalystAnswerMode).toBe("CURRENT_CATALYST_FIRST");
    expect(enriched.MODEL_INTERPRETATION.freshDiscoverySucceeded).toBe(true);
  });

  it("prefers the Marvell Investor Day release over a vague Motley Fool earnings headline", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why was MRVL up on October 6, 2026?",
      catalystRows: [{
        eventType: "earnings",
        eventDate: "2026-10-06",
        title: "Why Marvell Stock Was Up Today",
        publishedAt: "2026-10-06T13:00:00.000Z",
        verificationState: "provider_reported",
        sourceName: "The Motley Fool",
        sourceUrl: "https://www.fool.com/investing/2026/10/06/why-marvell-stock-was-up/",
      }],
    });
    const enriched = enrichPacketWithSearchEvidence({
      packet,
      searchHits: [{
        title: "Marvell Technology Investor Day — FY2028 $20B revenue outlook",
        url: "https://investor.marvell.com/news-events/press-releases/detail/2026/investor-day-outlook",
        snippet: "Management presented a FY2028 $20 billion revenue outlook at Investor Day.",
      }],
      discovery: {
        attempted: true,
        succeeded: true,
        searchQueries: ["MRVL Marvell investor day guidance news 2026-10-06"],
        source: "brave_web_search",
        error: null,
      },
    });
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(true);
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.primaryCatalyst?.title).toMatch(/Investor Day/i);
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.primaryCatalyst?.title).toMatch(/FY2028|\$20/i);
  });
});

describe("CURRENT_CATALYST acceptance — additional catalyst types", () => {
  function enrich(symbol: string, question: string, hits: Parameters<typeof enrichPacketWithSearchEvidence>[0]["searchHits"]) {
    const packet = buildAnalystIntelligencePacket({ symbol, userQuestion: question, catalystRows: [] });
    return enrichPacketWithSearchEvidence({
      packet,
      searchHits: hits,
      discovery: { attempted: true, succeeded: hits.length > 0, searchQueries: ["q"], source: "brave_web_search", error: null },
    });
  }

  it("A — earnings/guidance from search", () => {
    const out = enrich("ABC", "Why is ABC up today?", [{
      title: "ABC Corp reports Q3 earnings beat and raises FY guidance",
      url: "https://investor.abccorp.com/press/q3-earnings",
      snippet: "EPS beat and guidance raised.",
    }]);
    expect(out.CURRENT_CATALYST_ANALYSIS?.primaryCatalyst?.title).toMatch(/earnings|guidance/i);
  });

  it("B — analyst upgrade primary when no stronger event", () => {
    const out = enrich("NVDA", "Why is NVDA up?", [{
      title: "Goldman Sachs upgrades NVDA to Buy, raises price target",
      url: "https://news.example.com/nvda-upgrade",
      snippet: "Analyst action.",
    }]);
    expect(out.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(true);
  });

  it("C — SEC/company announcement", () => {
    const out = enrich("XYZ", "Why is XYZ moving?", [{
      title: "XYZ files 8-K regarding material definitive agreement",
      url: "https://www.sec.gov/Archives/edgar/data/123/8k.htm",
      snippet: "SEC filing.",
    }]);
    expect(out.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(true);
  });

  it("D — sector-only move stays unverified company catalyst", () => {
    const out = enrich("MRVL", "Why is MRVL up?", [{
      title: "Chip stocks rise on AI optimism",
      url: "https://news.example.com/chip-sector",
      snippet: "Sector move.",
    }]);
    expect(out.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(false);
  });
});
