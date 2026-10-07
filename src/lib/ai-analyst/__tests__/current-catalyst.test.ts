import { describe, expect, it } from "vitest";
import { buildAnalystIntelligencePacket } from "@/lib/ai-analyst/build-intelligence-packet";
import { buildCurrentCatalystAnalysis, rankCurrentCatalysts } from "@/lib/ai-analyst/current-catalyst";
import { CURRENT_CATALYST_VOLUME_LANGUAGE } from "@/lib/ai-analyst/catalyst-response-rules";
import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";

const investorDay: AnalystCatalystRow = {
  eventType: "company_news",
  eventDate: "2026-10-06",
  title: "Marvell hosts Investor Day and raises long-term revenue targets to $40B+ by 2028",
  publishedAt: "2026-10-06T13:00:00.000Z",
  verificationState: "provider_reported",
  sourceName: "Marvell IR",
};

const sectorNoise: AnalystCatalystRow = {
  eventType: "company_news",
  eventDate: "2026-10-06",
  title: "AI chip stocks rally on sector momentum",
  publishedAt: "2026-10-06T12:00:00.000Z",
  verificationState: "provider_reported",
};

const analystUpgrade: AnalystCatalystRow = {
  eventType: "analyst_action",
  eventDate: "2026-10-06",
  title: "Goldman Sachs upgrades NVDA to Buy, raises price target",
  publishedAt: "2026-10-06T14:00:00.000Z",
  verificationState: "provider_reported",
};

describe("MRVL Oct 6 2026 regression", () => {
  it("Why is MRVL up this morning — investor day primary, sector secondary", () => {
    const analysis = buildCurrentCatalystAnalysis("MRVL", [sectorNoise, investorDay]);
    expect(analysis.verifiedPrimary).toBe(true);
    expect(analysis.primaryCatalyst?.title).toMatch(/Investor Day/i);
    expect(analysis.secondaryCatalysts.some((s) => /sector momentum/i.test(s.title))).toBe(true);
    expect(analysis.answerGuidance).toMatch(/Do not use speculative catalyst phrasing/i);
    expect(analysis.volumeLanguageRule).toBe(CURRENT_CATALYST_VOLUME_LANGUAGE);

    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why is MRVL up this morning?",
      catalystRows: [investorDay, sectorNoise],
    });
    expect(packet.CURRENT_CATALYST_ANALYSIS?.primaryCatalyst?.title).toMatch(/Investor Day/i);
    expect(packet.MODEL_INTERPRETATION.catalystAnswerMode).toBe("CURRENT_CATALYST_FIRST");
    expect(packet.VERIFIED_FACTS.journalRows).toEqual([]);
    expect(packet.MODEL_INTERPRETATION.noSpeculationRule).toBeTruthy();
  });
});

describe("current catalyst ranking — general cases", () => {
  it("A — company-specific catalyst wins over sector", () => {
    const ranked = rankCurrentCatalysts("MRVL", [sectorNoise, investorDay]);
    expect(ranked[0]?.title).toMatch(/Investor Day/i);
  });

  it("B — analyst upgrade primary when no stronger company event", () => {
    const analysis = buildCurrentCatalystAnalysis("NVDA", [analystUpgrade]);
    expect(analysis.verifiedPrimary).toBe(true);
    expect(analysis.primaryCatalyst?.eventType).toBe("analyst_action");
  });

  it("C — only sector-wide row → no verified company primary", () => {
    const analysis = buildCurrentCatalystAnalysis("MRVL", [sectorNoise]);
    expect(analysis.verifiedPrimary).toBe(false);
    expect(analysis.explicitNoVerifiedCatalyst).toBe(true);
    expect(analysis.answerGuidance).toMatch(/No confirmed company-specific catalyst/i);
  });

  it("D — no evidence → explicit no-catalyst guidance", () => {
    const analysis = buildCurrentCatalystAnalysis("XYZ", []);
    expect(analysis.explicitNoVerifiedCatalyst).toBe(true);
    expect(analysis.rankedEvidence).toEqual([]);
  });

  it("E — multiple catalysts ranked by materiality/freshness", () => {
    const staleSector: AnalystCatalystRow = {
      ...sectorNoise,
      publishedAt: "2026-10-05T08:00:00.000Z",
    };
    const ranked = rankCurrentCatalysts("MRVL", [staleSector, investorDay]);
    expect(ranked[0]?.title).toMatch(/Investor Day/i);
    expect(ranked[1]?.title).toMatch(/sector momentum/i);
  });

  it("F — volume and institutional language rules block unsupported flow claims", () => {
    const analysis = buildCurrentCatalystAnalysis("MRVL", [investorDay]);
    expect(analysis.volumeLanguageRule).toMatch(/Do not infer institutional participation/i);
    expect(analysis.institutionalLanguageRule).toMatch(/institutional rebalancing/i);
    expect(analysis.institutionalLanguageRule).toMatch(/Investor Day often unlocks institutional participation/i);
    expect(analysis.formattingRule).toMatch(/\$20B/i);
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
  });
});
