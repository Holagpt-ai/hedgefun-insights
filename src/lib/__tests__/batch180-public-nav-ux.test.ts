import { describe, expect, it } from "vitest";
import { isNoindexPath } from "@/config/seo";
import {
  publicInstrumentDetailPath,
  publicStockDetailPath,
  publicWatchlistEntryHref,
} from "@/lib/public/public-workflow-links";
import { stockDetailCanonicalPath } from "@/lib/seo/stock-json-ld";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";

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
