import { describe, expect, it } from "vitest";
import { buildAnalystIntelligencePacket } from "@/lib/ai-analyst/build-intelligence-packet";
import { buildCurrentCatalystAnalysis, rankCurrentCatalysts } from "@/lib/ai-analyst/current-catalyst";
import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";

const investorDay: AnalystCatalystRow = {
  eventType: "company_news",
  eventDate: "2026-10-06",
  title: "Marvell hosts Investor Day and raises long-term revenue targets",
  publishedAt: "2026-10-06T13:00:00.000Z",
  verificationState: "provider_reported",
};

const sectorNoise: AnalystCatalystRow = {
  eventType: "company_news",
  eventDate: "2026-10-06",
  title: "AI chip stocks rally on sector momentum",
  publishedAt: "2026-10-06T12:00:00.000Z",
  verificationState: "provider_reported",
};

describe("current catalyst ranking", () => {
  it("ranks investor day above generic sector commentary", () => {
    const ranked = rankCurrentCatalysts("MRVL", [sectorNoise, investorDay]);
    expect(ranked[0]?.title).toContain("Investor Day");
    expect(ranked[0]?.tier).toBe("primary");
  });

  it("marks explicit no-verified-catalyst when only vague rows exist", () => {
    const vague: AnalystCatalystRow = {
      eventType: "company_news",
      eventDate: "2026-10-06",
      title: "Shares jump on heavy volume",
      publishedAt: "2026-10-06T11:00:00.000Z",
      verificationState: "provider_reported",
    };
    const analysis = buildCurrentCatalystAnalysis("XYZ", [vague]);
    expect(analysis.verifiedPrimary).toBe(false);
    expect(analysis.explicitNoVerifiedCatalyst).toBe(true);
  });

  it("wires CURRENT_CATALYST_ANALYSIS into analyst packet for movement questions", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why is MRVL up today?",
      catalystRows: [investorDay],
    });
    expect(packet.CURRENT_CATALYST_ANALYSIS?.verifiedPrimary).toBe(true);
    expect(packet.MODEL_INTERPRETATION.catalystAnswerMode).toBe("CURRENT_CATALYST_FIRST");
    expect(packet.HISTORICAL_EVIDENCE.historicalMatchSummary).toBeNull();
  });
});
