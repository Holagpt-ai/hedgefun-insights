import { describe, it, expect } from "vitest";
import {
  classifyCatalystPrecedence,
  compareCatalystPrecedence,
  looksLikeMarketAttention,
} from "@/lib/catalyst/precedence";

describe("catalyst precedence parity", () => {
  const base = (title: string, event_type = "company_news") => ({
    symbol: "XYZ",
    title,
    event_type,
    provider: "polygon",
    event_date: "2026-09-18",
    published_at: "2026-09-18T10:00:00.000Z",
    attribution_class: "direct" as const,
    ticker_specific: true,
  });

  it("primary FDA outranks bull of the day", () => {
    const primary = base("FDA approves XYZ therapy", "fda_biotech");
    const secondary = base("Bull of the Day: XYZ");
    expect(classifyCatalystPrecedence(primary).tier).toBe("primary");
    expect(classifyCatalystPrecedence(secondary).tier).toBe("secondary");
    expect(
      compareCatalystPrecedence(primary, secondary, { owned: new Set(), etDate: "2026-09-18" }),
    ).toBeLessThan(0);
  });

  it("detects market attention patterns generically", () => {
    expect(looksLikeMarketAttention("Bull of the Day: XYZ")).toBe(true);
    expect(looksLikeMarketAttention("Zacks.com featured highlights several names")).toBe(true);
    expect(looksLikeMarketAttention("Tesla vs SpaceX: Which Is the Better Stock to Buy?")).toBe(true);
  });

  it("demotes Motley Fool merger speculation before primary-class detection", () => {
    const editorial = {
      ...base("American Water Works merger chatter", "merger_acquisition"),
      source_name: "The Motley Fool",
    };
    expect(classifyCatalystPrecedence(editorial).primaryClass).not.toBe("acquisition_ma");
    expect(classifyCatalystPrecedence(editorial).tier).toBe("secondary");
  });

  it("demotes a related earnings headline below the issuer calendar row", () => {
    const issuer = {
      ...base("ACADIA Pharmaceuticals earnings", "earnings"),
      provider: "earnings_calendar",
      attribution_class: "direct" as const,
      ticker_specific: true,
    };
    const related = {
      ...base("Recursion Pharmaceuticals reports third-quarter earnings", "earnings"),
      attribution_class: "unverified" as const,
      ticker_specific: false,
    };
    expect(classifyCatalystPrecedence(issuer).tier).toBe("primary");
    expect(classifyCatalystPrecedence(related).tier).toBe("secondary");
    expect(classifyCatalystPrecedence(related).classRank).toBe(0);
    expect(
      compareCatalystPrecedence(issuer, related, { owned: new Set(), etDate: "2026-09-18" }),
    ).toBeLessThan(0);
  });

  it("older primary beats newer commentary", () => {
    const older = {
      ...base("Company prices $50M public offering", "corporate_action"),
      symbol: "FIN",
      event_date: "2026-09-17",
      published_at: "2026-09-17T08:00:00.000Z",
    };
    const newer = base("Top stock picks for today");
    expect(
      compareCatalystPrecedence(older, newer, { owned: new Set(), etDate: "2026-09-18" }),
    ).toBeLessThan(0);
  });
});
