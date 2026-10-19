import { describe, expect, it } from "vitest";
import { dedupeWatchlistSymbolRows } from "@/lib/watchlist-v2/watchlist-persistence";
import { appendWatchlistDelayDisclosure } from "@/lib/watchlist-v2/watchlist-market-disclosure";
import { rowHasCatalystContext, rowMatchesFilter } from "@/lib/watchlist-v2/metrics";
import { watchlistPriceObservationMs } from "@/lib/watchlist-v2/watchlist-catalyst-context";
import { parseKeyLevels } from "@/lib/watchlist-v2/parsers";
import type { V2Row } from "@/hooks/useWatchlistV2";
import type { MarketPulseVerifiedCatalyst } from "@/lib/markets/market-pulse-contract";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";

function v2Row(overrides: Partial<V2Row> = {}): V2Row {
  return {
    ticker: "ABC",
    companyName: null,
    direction: "neutral",
    explanation: "",
    failureReason: null,
    price: 10,
    changePct: 1,
    volume: 1_000_000,
    rvol: 1.2,
    rvolClass: null,
    sessionType: "rth",
    sessionDate: "2026-08-27",
    analyzedAt: "2026-08-27T19:00:00Z",
    validThrough: "2026-08-27T20:00:00Z",
    intraday: [],
    driverIds: [],
    marketSignals: [],
    recentEvents: [],
    keyLevels: parseKeyLevels(null),
    inputsQuality: {},
    sessionDisplayLabel: "",
    analysisPresentation: "live",
    marketSignalSummary: null,
    priorSessionVolume: null,
    volYdayRatio: null,
    verifiedRecentEvent: null,
    scannerIntelligence: null,
    requestStatus: "none",
    requestError: null,
    hasV2: true,
    ...overrides,
  };
}

describe("Batch 24 — watchlist data reliability", () => {
  it("dedupes duplicate symbols keeping earliest added_at", () => {
    const rows = dedupeWatchlistSymbolRows([
      { id: "2", symbol: "aapl", added_at: "2026-08-27T12:00:00.000Z" },
      { id: "1", symbol: "AAPL", added_at: "2026-08-20T12:00:00.000Z" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("1");
    expect(rows[0]?.symbol).toBe("AAPL");
  });

  it("appends site-wide delayed-data disclosure on fresh watchlist quotes", () => {
    const line = appendWatchlistDelayDisclosure("Fresh · Quote as of 10:00 AM ET", "FRESH");
    expect(line).toContain(PUBLIC_MARKET_DATA_DELAY_DISCLOSURE);
  });

  it("uses snapshot_ts_ms for watchlist price observation reference", () => {
    expect(watchlistPriceObservationMs(v2Row({ inputsQuality: {} }))).toBeNull();
    expect(
      watchlistPriceObservationMs(v2Row({ inputsQuality: { snapshot_ts_ms: 1_777_000_000_000 } })),
    ).toBe(1_777_000_000_000);
  });

  it("includes verified Stocksist catalyst in catalyst filter", () => {
    const row = v2Row({ ticker: "XYZ" });
    const catalyst: MarketPulseVerifiedCatalyst = {
      label: "Verified event",
      eventId: "e1",
      title: "XYZ contract",
      sourceName: "Press",
      sourceUrl: "https://example.com/x",
      eventDate: "2026-08-27",
      publishedAt: "2026-08-27T14:00:00.000Z",
      eventTimingLine: "Event date 2026-08-27",
      catalystPath: "/dashboard/catalyst?symbol=XYZ",
      causationEstablished: false,
    };
    const map = new Map([["XYZ", catalyst]]);
    expect(rowHasCatalystContext(row, map)).toBe(true);
    expect(rowMatchesFilter(row, "catalysts", new Map(), map)).toBe(true);
  });

  it("does not invent market signals when price is unavailable", () => {
    const row = v2Row({ price: null, direction: "data_unavailable", hasV2: false });
    expect(row.marketSignalSummary).toBeNull();
    expect(rowMatchesFilter(row, "movers", new Map())).toBe(false);
  });
});
