import { describe, expect, it } from "vitest";
import { generateMetaDescription } from "@/lib/agentic-seo";
import {
  publicHistoricalRadarHref,
  publicStockDetailPath,
  publicWatchlistEntryHref,
  publicWorkflowHref,
} from "@/lib/public/public-workflow-links";
import { selectMarketPulseItems } from "@/lib/markets/market-pulse-select";
import { moverFromPolygonTicker } from "@/lib/markets/movers-integrity";
import { summarizeMoversListProvenance } from "@/lib/markets/movers-provenance";
import { stockDetailCanonicalPath } from "@/lib/seo/stock-json-ld";

describe("Batch 179 — public conversion", () => {
  it("uses canonical uppercase stock detail paths", () => {
    expect(publicStockDetailPath("aapl")).toBe("/stocks/AAPL");
    expect(stockDetailCanonicalPath("aapl")).toBe("/stocks/AAPL");
  });

  it("preserves dashboard destinations for guest auth handoffs", () => {
    const watchlist = publicWatchlistEntryHref(false);
    expect(watchlist).toContain("/login?next=");
    expect(decodeURIComponent(watchlist)).toContain("/dashboard/watchlist");

    const hist = publicHistoricalRadarHref("nvda", false);
    expect(hist).toContain("/login?next=");
    expect(decodeURIComponent(hist ?? "")).toContain("symbol=NVDA");
    expect(decodeURIComponent(hist ?? "")).toContain("focus=historical");
  });

  it("routes authenticated users directly to workspace", () => {
    expect(publicWatchlistEntryHref(true)).toBe("/dashboard/watchlist");
    expect(publicHistoricalRadarHref("nvda", true)).toContain("/dashboard/screeners?symbol=NVDA");
    expect(publicWorkflowHref("aapl", "catalyst", true)).toBe("/dashboard/catalyst?symbol=AAPL");
  });

  it("Market Pulse stock links match canonical detail paths", () => {
    const nowMs = Date.parse("2026-10-26T14:30:00.000Z");
    const mover = moverFromPolygonTicker(
      {
        ticker: "MSFT",
        name: "Microsoft",
        todaysChangePerc: 12,
        day: { c: 420, v: 5_000_000, t: nowMs },
        prevDay: { c: 375 },
        lastTrade: { p: 420, t: nowMs },
        min: { c: 420, t: nowMs },
      },
      "regular",
      nowMs,
    );
    const provenance = summarizeMoversListProvenance([mover], {
      nowMs,
      universe: "tracked_gainers_losers",
      moverSession: "regular",
    });
    const items = selectMarketPulseItems({
      gainers: [mover],
      losers: [],
      provenance,
      nowMs,
    });
    expect(items[0]?.stockDetailPath).toBe("/stocks/MSFT");
  });

  it("stock SEO description states delayed quotes", () => {
    const desc = generateMetaDescription("AAPL", "Apple Inc.");
    expect(desc.toLowerCase()).toMatch(/delayed|not real-time/);
  });
});
