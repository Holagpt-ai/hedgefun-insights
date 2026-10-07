import { describe, expect, it } from "vitest";
import { buildAnalystIntelligencePacket } from "@/lib/ai-analyst/build-intelligence-packet";
import {
  CURRENT_CATALYST_INSTITUTIONAL_LANGUAGE,
  CURRENT_CATALYST_PERSONALIZATION,
  CURRENT_CATALYST_RESPONSE_SECTIONS,
  findProhibitedInstitutionalPhrases,
  findProhibitedPersonalizationPhrases,
} from "@/lib/ai-analyst/catalyst-response-rules";

describe("CURRENT_CATALYST response policy", () => {
  it("A — flags high-volume institutional participation phrasing", () => {
    const bad = "23.2M shares traded suggests real institutional participation.";
    expect(findProhibitedInstitutionalPhrases(bad).length).toBeGreaterThan(0);
  });

  it("B — flags Investor Day institutional rebalancing phrasing", () => {
    const bad =
      "Investor Day often unlocks institutional participation. This is classic investor-day-driven institutional rebalancing.";
    expect(findProhibitedInstitutionalPhrases(bad).length).toBeGreaterThanOrEqual(2);
  });

  it("allows neutral market participation language", () => {
    const ok = "Volume was elevated, indicating higher market participation and investor reaction to the outlook.";
    expect(findProhibitedInstitutionalPhrases(ok)).toEqual([]);
  });

  it("C — flags sector-focus personalization drift", () => {
    expect(findProhibitedPersonalizationPhrases("aligned with your core sector focus.").length).toBeGreaterThan(0);
    expect(CURRENT_CATALYST_PERSONALIZATION).toMatch(/sector focus/i);
  });

  it("D — catalyst-first structure remains in packet", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "MRVL",
      userQuestion: "Why is MRVL up today?",
      catalystRows: [{
        eventType: "company_news",
        eventDate: "2026-10-06",
        title: "Marvell Investor Day",
        publishedAt: "2026-10-06T13:00:00.000Z",
        verificationState: "provider_reported",
      }],
    });
    expect(packet.MODEL_INTERPRETATION.catalystAnswerMode).toBe("CURRENT_CATALYST_FIRST");
    expect(packet.MODEL_INTERPRETATION.responseStructure).toBe(CURRENT_CATALYST_RESPONSE_SECTIONS);
    expect(packet.MODEL_INTERPRETATION.institutionalLanguageRule).toBe(CURRENT_CATALYST_INSTITUTIONAL_LANGUAGE);
  });
});
