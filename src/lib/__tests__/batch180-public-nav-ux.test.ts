import { describe, expect, it } from "vitest";
import { isNoindexPath } from "@/config/seo";
import {
  publicInstrumentDetailPath,
  publicStockDetailPath,
  publicWatchlistEntryHref,
} from "@/lib/public/public-workflow-links";
import { stockDetailCanonicalPath } from "@/lib/seo/stock-json-ld";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";
import {
  heatmapUniverseHeading,
  heatmapUniverseDetail,
} from "@/lib/markets/heatmap-universe-label";
import {
  formatTrendingDataFootnote,
  mapTrendingStockRows,
  trendingPageSeoDescription,
  TRENDING_VOLUME_RANK_SECTION_TITLE,
} from "@/lib/trending/trending-page-present";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Batch 180 — public navigation & UX integrity", () => {
  it("uses canonical uppercase stock detail paths", () => {
    expect(publicStockDetailPath("nvda")).toBe("/stocks/NVDA");
    expect(stockDetailCanonicalPath("nvda")).toBe("/stocks/NVDA");
  });

  it("routes ETFs and funds to ETF detail, stocks to stock detail", () => {
    expect(publicInstrumentDetailPath("SPY", "ETF")).toBe("/etf/SPY");
    expect(publicInstrumentDetailPath("AAPL", "CS")).toBe("/stocks/AAPL");
    expect(publicInstrumentDetailPath("not a symbol", "CS")).toBeNull();
  });

  it("preserves guest and authenticated watchlist destinations", () => {
    const guest = publicWatchlistEntryHref(false);
    expect(guest).toContain("/login?next=");
    expect(decodeURIComponent(guest)).toContain("/dashboard/watchlist");
    expect(publicWatchlistEntryHref(true)).toBe("/dashboard/watchlist");
  });

  it("exposes delayed-data disclosure contract for public copy", () => {
    expect(PUBLIC_MARKET_DATA_DELAY_DISCLOSURE.toLowerCase()).toMatch(/delayed/);
  });

  it("keeps legacy watchlist noindex and stock detail indexable", () => {
    expect(isNoindexPath("/watchlist")).toBe(true);
    expect(isNoindexPath("/stocks/AAPL")).toBe(false);
  });
});

describe("Batch 180 — data honesty (trending & heatmap)", () => {
  it("maps DB rows without synthetic view counts", () => {
    const rows = mapTrendingStockRows([
      {
        symbol: "AAPL",
        name: "Apple Inc.",
        market_cap: 1,
        change_percent: 0.5,
        volume: 50_000_000,
        updated_at: "2026-10-25T14:00:00.000Z",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows![0]).not.toHaveProperty("views");
    expect(rows![0]?.volume).toBe(50_000_000);
  });

  it("returns null for empty trending query results", () => {
    expect(mapTrendingStockRows([])).toBeNull();
    expect(mapTrendingStockRows(undefined)).toBeNull();
  });

  it("labels trending as volume-ranked and avoids Plausible claims in SEO copy", () => {
    expect(TRENDING_VOLUME_RANK_SECTION_TITLE.toLowerCase()).toMatch(/volume/);
    const seo = trendingPageSeoDescription("Stocksist");
    expect(seo.toLowerCase()).toMatch(/volume/);
    expect(seo.toLowerCase()).not.toMatch(/plausible/);
    expect(seo.toLowerCase()).not.toMatch(/plausible|pageview/);
  });

  it("footnote uses real updated_at when provided and omits fixed clock times", () => {
    const note = formatTrendingDataFootnote("2026-10-25T14:00:00.000Z");
    expect(note).toMatch(/volume/i);
    expect(note).not.toMatch(/8:30/i);
    expect(note).not.toMatch(/plausible/i);
    expect(formatTrendingDataFootnote(null)).not.toMatch(/8:30/i);
  });

  it("heatmap heading describes market-cap universe, not S&P 500", () => {
    const heading = heatmapUniverseHeading(500, "1D");
    expect(heading.toLowerCase()).not.toMatch(/s&p 500|s&p500/);
    expect(heading).toMatch(/500/);
    expect(heatmapUniverseDetail(500).toLowerCase()).toMatch(/not an official s&p 500/i);
  });

  it("TrendingPage source has no SEED fallback or random view fabrication", () => {
    const src = readFileSync(resolve(process.cwd(), "src/pages/trending/TrendingPage.tsx"), "utf8");
    expect(src).not.toMatch(/\bSEED\b/);
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/Plausible/i);
    expect(src).toMatch(/publicStockDetailPath/);
    expect(src).toMatch(/publicWatchlistEntryHref/);
  });
});
