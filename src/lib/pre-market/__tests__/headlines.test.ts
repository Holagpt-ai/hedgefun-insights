import { describe, it, expect } from "vitest";
import {
  FEED_SYNC_UNAVAILABLE,
  rankHeadlines,
} from "@/lib/pre-market/headlines";

describe("market headlines relevance pipeline", () => {
  it("removes duplicates by story id, canonical URL and normalized headline", () => {
    const rows = rankHeadlines([
      { id: "1", headline: "Fed holds rates steady", source: "Reuters", url: "https://ex.com/a/", published_at: "2026-08-27T11:00:00.000Z" },
      { id: "1", headline: "Fed holds rates steady", source: "Reuters", url: "https://ex.com/a", published_at: "2026-08-27T11:00:00.000Z" },
      { id: "2", headline: "Fed  holds rates  steady", source: "AP", url: "https://ex.com/b", published_at: "2026-08-27T10:00:00.000Z" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("1");
  });

  it("ranks material macro stories ahead of later routine copy", () => {
    const rows = rankHeadlines([
      {
        id: "routine",
        headline: "Acme Inc files Form 4 insider notice",
        source: "Wire",
        url: "https://ex.com/form4",
        published_at: "2026-08-27T12:00:00.000Z",
        related: "ACME",
      },
      {
        id: "macro",
        headline: "Fed signals slower path for rate cuts as CPI holds",
        source: "Reuters",
        url: "https://ex.com/fed",
        published_at: "2026-08-27T09:00:00.000Z",
      },
    ]);
    expect(rows[0].id).toBe("macro");
    expect(rows.some((r) => r.id === "routine")).toBe(false);
  });

  it("associates symbols only from provider related fields", () => {
    const [row] = rankHeadlines([
      {
        id: "s",
        headline: "Apple supplier comments on iPhone demand",
        source: "Wire",
        url: "https://ex.com/aapl",
        published_at: "2026-08-27T10:00:00.000Z",
        related: "AAPL",
      },
    ]);
    expect(row.symbols).toEqual(["AAPL"]);
  });

  it("uses a provider English variant when supplied and does not fabricate translations", () => {
    const [row] = rankHeadlines([
      {
        id: "es",
        headline: "El banco central mantiene los tipos",
        headline_en: "The central bank holds rates steady",
        source: "Reuters",
        url: "https://ex.com/es",
        published_at: "2026-08-27T10:00:00.000Z",
        lang: "es",
      },
    ]);
    expect(row.headline).toBe("The central bank holds rates steady");
    expect(row.english_title_used).toBe(true);
  });

  it("keeps the original title when no English variant is supplied", () => {
    const [row] = rankHeadlines([
      {
        id: "de",
        headline: "Die Zentralbank hält die Zinsen unverändert",
        source: "Reuters",
        url: "https://ex.com/de",
        published_at: "2026-08-27T10:00:00.000Z",
      },
    ]);
    expect(row.headline).toBe("Die Zentralbank hält die Zinsen unverändert");
    expect(row.english_title_used).toBe(false);
  });

  it("exports the missing heartbeat disclosure", () => {
    expect(FEED_SYNC_UNAVAILABLE).toBe("Feed synchronization status unavailable");
  });

  it("ranks US macro and geopolitics ahead of isolated company buybacks without dropping them", () => {
    const rows = rankHeadlines([
      {
        id: "buyback",
        headline: "SalMar announces NOK 1.5bn share buyback programme",
        source: "Wire",
        url: "https://ex.com/salmar",
        published_at: "2026-08-28T09:30:00.000Z",
      },
      {
        id: "cpi",
        headline: "Spain CPI holds as euro-area inflation stays sticky",
        source: "Reuters",
        url: "https://ex.com/spain-cpi",
        published_at: "2026-08-28T08:00:00.000Z",
      },
      {
        id: "oil",
        headline: "Oil jumps after Iran tensions threaten Strait of Hormuz supply",
        source: "Reuters",
        url: "https://ex.com/oil-iran",
        published_at: "2026-08-28T08:15:00.000Z",
      },
    ], 8);
    expect(rows.map((r) => r.id)).toEqual(["oil", "cpi", "buyback"]);
    expect(rows[0].id).not.toBe("buyback");
    expect(rows.some((r) => r.id === "buyback")).toBe(true);
  });
});
