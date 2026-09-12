import { describe, expect, it } from "vitest";
import { selectQualityMarketHeadlines } from "@/lib/news/market-headline-quality";

interface RichRow {
  id: string;
  headline: string;
  source: string | null;
  url: string | null;
  category: string | null;
  published_at: string;
  extra?: string;
  summary?: string;
}

function row(partial: Partial<RichRow> & Pick<RichRow, "id" | "headline">): RichRow {
  return {
    source: "Reuters",
    url: `https://example.com/${partial.id}`,
    category: "markets",
    published_at: "2026-09-12T12:00:00.000Z",
    ...partial,
  };
}

describe("selectQualityMarketHeadlines", () => {
  it("deduplicates identical normalized headlines with different IDs", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({ id: "a", headline: "Fed holds rates steady" }),
        row({ id: "b", headline: "Fed holds rates steady", url: "https://example.com/other" }),
      ],
      10,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("a");
  });

  it("deduplicates identical canonical URLs with different IDs", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({
          id: "first",
          headline: "Oil jumps on supply risk",
          url: "https://example.com/oil-story/",
        }),
        row({
          id: "second",
          headline: "Crude rises after pipeline outage",
          url: "https://example.com/oil-story",
        }),
      ],
      10,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("first");
  });

  it("treats tracking-parameter URL variants as the same story", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({
          id: "tracked",
          headline: "Nasdaq futures rise ahead of CPI",
          url: "https://example.com/cpi?utm_source=twitter&utm_medium=social&utm_campaign=feed&ref=home&source=newsletter&campaign=push&id=cpi-42#top",
        }),
        row({
          id: "clean",
          headline: "Different wording for the same article",
          url: "https://example.com/cpi?id=cpi-42",
        }),
      ],
      10,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("tracked");
  });

  it("deduplicates punctuation and case-only headline differences", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({ id: "plain", headline: "Breaking: Fed holds rates steady" }),
        row({
          id: "noisy",
          headline: "UPDATE: FED HOLDS RATES STEADY!",
          url: "https://example.com/noisy",
        }),
      ],
      10,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("plain");
  });

  it("suppresses promotional shareholder and legal solicitation notices", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({
          id: "alert",
          headline: "SHAREHOLDER ALERT: Pomerantz Law Firm Reminds Investors of Class Action Deadline",
        }),
        row({
          id: "securities",
          headline: "Rosen Law Firm Announces Securities Class Action Against Acme Inc",
          url: "https://example.com/securities",
        }),
        row({
          id: "plaintiff",
          headline: "Lead Plaintiff Deadline Approaching for Widget Corp Investors",
          url: "https://example.com/plaintiff",
        }),
        row({
          id: "losses",
          headline: "NOTICE TO SHAREHOLDERS: Investors Who Suffered Losses May Be Entitled to Recovery",
          url: "https://example.com/losses",
        }),
        row({
          id: "probe",
          headline: "Law Firm Announces Investigation of Globex Holdings",
          url: "https://example.com/probe",
        }),
        row({
          id: "keep",
          headline: "Oil jumps after OPEC supply cut",
          url: "https://example.com/oil",
        }),
      ],
      10,
    );
    expect(selected.map((item) => item.id)).toEqual(["keep"]);
  });

  it("preserves genuine SEC, DOJ, court, and regulatory news", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({
          id: "sec",
          headline: "SEC charges Acme with accounting fraud",
          url: "https://example.com/sec",
        }),
        row({
          id: "doj",
          headline: "DOJ announces indictment of former CEO on criminal charges",
          url: "https://example.com/doj",
        }),
        row({
          id: "court",
          headline: "Federal court and jury find company liable in antitrust case",
          url: "https://example.com/court",
        }),
        row({
          id: "ftc",
          headline: "FTC imposes $50 million fine in antitrust settlement",
          url: "https://example.com/ftc",
        }),
        row({
          id: "fda",
          headline: "FDA rejects cancer drug application after review",
          url: "https://example.com/fda",
        }),
        row({
          id: "cftc",
          headline: "CFTC opens official investigation into trading firm",
          url: "https://example.com/cftc",
        }),
        row({
          id: "ag",
          headline: "Attorney general files criminal charges against broker",
          url: "https://example.com/ag",
        }),
      ],
      10,
    );
    expect(selected.map((item) => item.id)).toEqual(
      expect.arrayContaining(["sec", "doj", "court", "ftc", "fda", "cftc", "ag"]),
    );
    expect(selected).toHaveLength(7);
  });

  it("ranks an older market-moving headline above a newer low-value item", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({
          id: "low",
          headline: "Acme Inc conference presentation date announced",
          url: "https://example.com/low",
          published_at: "2026-09-12T16:00:00.000Z",
        }),
        row({
          id: "macro",
          headline: "Fed signals slower path for rate cuts as CPI holds",
          url: "https://example.com/macro",
          published_at: "2026-09-12T10:00:00.000Z",
        }),
      ],
      10,
    );
    expect(selected.map((item) => item.id)).toEqual(["macro", "low"]);
  });

  it("applies the display limit after filtering and deduplication", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({
          id: "promo",
          headline: "SHAREHOLDER ALERT: Law Firm Reminds Investors of Class Action Deadline",
          url: "https://example.com/promo",
        }),
        row({
          id: "dup-a",
          headline: "Fed holds rates steady",
          url: "https://example.com/fed",
        }),
        row({
          id: "dup-b",
          headline: "FED HOLDS RATES STEADY!",
          url: "https://example.com/fed-copy",
        }),
        row({
          id: "oil",
          headline: "Oil jumps after OPEC supply cut",
          url: "https://example.com/oil",
        }),
        row({
          id: "blank",
          headline: "   ",
          url: "https://example.com/blank",
        }),
        row({
          id: "jobs",
          headline: "US jobs report shows unemployment unexpectedly falling",
          url: "https://example.com/jobs",
        }),
        row({
          id: "meeting",
          headline: "Acme Inc annual meeting notice for shareholders",
          url: "https://example.com/meeting",
        }),
      ],
      2,
    );
    expect(selected).toHaveLength(2);
    expect(selected.map((item) => item.id)).toEqual(["dup-a", "jobs"]);
    expect(selected.some((item) => item.id === "promo" || item.id === "dup-b" || item.id === "blank")).toBe(false);
  });

  it("excludes invalid and blank rows", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({ id: "empty", headline: "" }),
        row({ id: "spaces", headline: "   " }),
        { id: "missing-headline", headline: undefined as unknown as string, published_at: "2026-09-12T12:00:00.000Z", source: "Wire", url: "https://example.com/x", category: "markets" },
        row({ id: "bad-time", headline: "Nasdaq futures rise", published_at: "not-a-date" }),
        row({ id: "blank-time", headline: "Dow futures rise", published_at: "" }),
        row({ id: "keep", headline: "Nasdaq futures rise ahead of CPI" }),
      ],
      10,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("keep");
  });

  it("preserves the original rich row object and display fields", () => {
    const original = row({
      id: "rich",
      headline: "Oil jumps after OPEC supply cut",
      source: "Bloomberg",
      url: "https://example.com/oil-rich",
      category: "stocks",
      extra: "featured",
      summary: "Keep this summary on the same object",
    });
    const selected = selectQualityMarketHeadlines([original], 1);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(original);
    expect(selected[0].source).toBe("Bloomberg");
    expect(selected[0].url).toBe("https://example.com/oil-rich");
    expect(selected[0].category).toBe("stocks");
    expect(selected[0].extra).toBe("featured");
    expect(selected[0].summary).toBe("Keep this summary on the same object");
  });

  it("suppresses law-firm headlines that only mention an agency", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({
          id: "sec-mention",
          headline: "SHAREHOLDER ALERT: Rosen Law Firm Investigates Acme Following SEC Disclosure",
          url: "https://example.com/sec-mention",
        }),
        row({
          id: "doj-mention",
          headline: "Law Firm Announces Investigation of Acme After DOJ Inquiry",
          url: "https://example.com/doj-mention",
        }),
        row({
          id: "sec-correspondence",
          headline: "Securities Class Action Filed After Company Disclosed SEC Correspondence",
          url: "https://example.com/sec-correspondence",
        }),
        row({
          id: "keep",
          headline: "Oil jumps after OPEC supply cut",
          url: "https://example.com/oil-keep",
        }),
      ],
      10,
    );
    expect(selected.map((item) => item.id)).toEqual(["keep"]);
  });

  it("preserves official actor/action regulatory headlines", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({
          id: "sec-charges",
          headline: "SEC charges Acme with accounting fraud",
          url: "https://example.com/sec-charges",
        }),
        row({
          id: "doj-subpoena",
          headline: "Acme subpoenaed by DOJ",
          url: "https://example.com/doj-subpoena",
        }),
        row({
          id: "court-dismiss",
          headline: "Federal court dismisses class action against Acme",
          url: "https://example.com/court-dismiss",
        }),
      ],
      10,
    );
    expect(selected.map((item) => item.id)).toEqual(
      expect.arrayContaining(["sec-charges", "doj-subpoena", "court-dismiss"]),
    );
    expect(selected).toHaveLength(3);
  });

  it("keeps the older market-moving row when a newer low-value row shares its URL", () => {
    const selected = selectQualityMarketHeadlines(
      [
        row({
          id: "newer-low",
          headline: "Acme Inc conference presentation date announced",
          url: "https://example.com/shared-story?utm_source=feed",
          published_at: "2026-09-12T16:00:00.000Z",
        }),
        row({
          id: "older-macro",
          headline: "Fed signals slower path for rate cuts as CPI holds",
          url: "https://example.com/shared-story/",
          published_at: "2026-09-12T10:00:00.000Z",
        }),
      ],
      10,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("older-macro");
  });
});
