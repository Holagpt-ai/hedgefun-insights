import { describe, expect, it } from "vitest";
import { buildAnalystIntelligencePacket } from "@/lib/ai-analyst/build-intelligence-packet";
import {
  buildCatalystSearchQueries,
  enrichPacketWithSearchEvidence,
  isOfficialCompanySourceUrl,
  normalizeWebSearchHit,
  shouldRunFreshCatalystSearch,
} from "@/lib/ai-analyst/current-catalyst-fallback";

describe("current catalyst fresh-search fallback", () => {
  it("does not require fallback when internal primary exists", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why is MRVL up today?",
      catalystRows: [{
        eventType: "company_news",
        eventDate: "2026-10-06",
        title: "Marvell Investor Day raises long-term revenue targets",
        publishedAt: "2026-10-06T13:00:00.000Z",
        verificationState: "provider_reported",
      }],
    });
    expect(shouldRunFreshCatalystSearch(packet)).toBe(false);
  });

  it("requires fallback when internal primary is missing", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why is MRVL up today?",
      catalystRows: [],
    });
    expect(shouldRunFreshCatalystSearch(packet)).toBe(true);
  });

  it("uses the date named in the question instead of the clock date", () => {
    const q = buildCatalystSearchQueries({
      symbol: "MRVL",
      companyName: "Marvell",
      userQuestion: "Why was MRVL up on October 6, 2026?",
      now: new Date("2026-10-08T16:00:00.000Z"),
    });
    expect(q.some((line) => line.includes("2026-10-06"))).toBe(true);
    expect(q.every((line) => !line.includes("2026-10-08"))).toBe(true);
  });

  it("runs fresh search when the only internal primary is a vague financial-media headline", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why was MRVL up on October 6, 2026?",
      catalystRows: [{
        eventType: "earnings",
        eventDate: "2026-10-06",
        title: "Why Marvell Stock Was Up Today",
        publishedAt: "2026-10-06T14:00:00.000Z",
        verificationState: "provider_reported",
        sourceName: "The Motley Fool",
        sourceUrl: "https://www.fool.com/investing/2026/10/06/why-marvell-stock-was-up/",
      }],
    });
    expect(packet.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(false);
    expect(shouldRunFreshCatalystSearch(packet)).toBe(true);
  });

  it("builds catalyst-focused search queries without hard-coded tickers only", () => {
    const q = buildCatalystSearchQueries({ symbol: "XYZ", companyName: "Example Co", sessionDateIso: "2026-10-06T14:00:00Z" });
    expect(q.some((line) => line.includes("XYZ"))).toBe(true);
    expect(q.some((line) => line.includes("Example Co"))).toBe(true);
    expect(q.every((line) => !line.includes("MRVL"))).toBe(true);
  });

  it("official IR source outranks secondary headline for same theme", async () => {
    const official = normalizeWebSearchHit({
      title: "Marvell Technology Group Ltd. Investor Day 2026 — financial outlook",
      url: "https://investor.marvell.com/news-events/press-releases/investor-day-2026",
      snippet: "Management outlined updated long-term revenue targets and data center growth outlook.",
    }, "MRVL");
    const secondary = normalizeWebSearchHit({
      title: "MRVL stock jumps 7% on heavy volume",
      url: "https://news.example.com/mrvl-jumps-7-percent",
      snippet: "Shares rallied in morning trade.",
    }, "MRVL");
    expect(isOfficialCompanySourceUrl(official.sourceUrl!)).toBe(true);
    expect(secondary.officialSource).toBe(false);

    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "MRVL? Why is it up this morning?",
      catalystRows: [],
    });
    const enriched = await enrichPacketWithSearchEvidence({
      packet,
      searchHits: [
        {
          title: "MRVL stock jumps 7% on heavy volume",
          url: "https://news.example.com/mrvl-jumps-7-percent",
          snippet: "Shares rallied in morning trade.",
        },
        {
          title: "Marvell Technology Group Ltd. Investor Day 2026 — financial outlook",
          url: "https://investor.marvell.com/news-events/press-releases/investor-day-2026",
          snippet: "Management outlined updated long-term revenue targets and data center growth outlook.",
        },
      ],
      discovery: { attempted: true, succeeded: true, searchQueries: ["q"], source: "brave_web_search", error: null },
    });
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(true);
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.primaryCatalyst?.title).toMatch(/Investor Day/i);
    expect(enriched.FRESH_CATALYST_DISCOVERY?.succeeded).toBe(true);
  });

  it("sector-only search hits do not fabricate a company primary", async () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why is MRVL up today?",
      catalystRows: [],
    });
    const enriched = await enrichPacketWithSearchEvidence({
      packet,
      searchHits: [{
        title: "AI chip stocks rally on sector momentum",
        url: "https://news.example.com/ai-chip-rally",
        snippet: "Semiconductor names moved higher.",
      }],
      discovery: { attempted: true, succeeded: false, searchQueries: ["q"], source: "brave_web_search", error: null },
    });
    expect(enriched.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(false);
    expect(enriched.MODEL_INTERPRETATION.catalystAnswerGuidance).toMatch(/no confirmed company-specific catalyst/i);
  });

  it("search unavailable still allows honest no-catalyst guidance", async () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why is MRVL up today?",
      catalystRows: [],
    });
    const enriched = await enrichPacketWithSearchEvidence({
      packet,
      searchHits: [],
      discovery: { attempted: true, succeeded: false, searchQueries: ["q"], source: null, error: "no_hits" },
    });
    expect(enriched.MODEL_INTERPRETATION.freshDiscoveryAttempted).toBe(true);
    expect(enriched.MODEL_INTERPRETATION.freshDiscoverySucceeded).toBe(false);
  });
});
