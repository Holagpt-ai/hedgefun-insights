import { describe, it, expect } from "vitest";
import {
  canonicalizeLiveTickers,
  parseMarketDataPayload,
  presentValidatedMovers,
} from "@/lib/mcp/tools/get-market-movers";

const NOW = Date.parse("2026-08-27T16:00:00.000Z");

function ticker(symbol: string, price: number, prev: number, volume: number, extra: Record<string, unknown> = {}) {
  return {
    ticker: symbol,
    name: symbol,
    todaysChangePerc: ((price - prev) / prev) * 100,
    day: { c: price, v: volume },
    prevDay: { c: prev },
    lastTrade: { p: price, t: NOW },
    min: { c: price },
    updated: NOW,
    ...extra,
  };
}

describe("MCP get_market_movers canonical path", () => {
  it("deduplicates and drops invalid extreme cache-like snapshots", () => {
    const payload = [
      ticker("AAA", 21, 20, 1_000_000),
      ticker("AAA", 21, 20, 5_000_000, { updated: NOW + 1000, lastTrade: { p: 21, t: NOW + 1000 } }),
      ticker("OPI", 8.5, 0.1, 2_000_000, { todaysChangePerc: 84, lastTrade: { p: 8.5, t: NOW }, min: { c: 8.5 }, day: { c: 8.5, v: 2_000_000 } }),
    ];
    const validated = canonicalizeLiveTickers(payload, "gainer", NOW);
    const presented = presentValidatedMovers(validated, "gainer", 10, NOW);
    expect(presented.status).toBe("available");
    expect(presented.movers.map((m) => m.symbol)).toEqual(["AAA"]);
    expect(presented.movers[0].change_percent).toBeCloseTo(5, 5);
  });

  it("returns empty rather than unverified movers", () => {
    const validated = canonicalizeLiveTickers([
      ticker("BAD", 977, 96, 1, { lastTrade: { p: 97.7, t: NOW }, min: { c: 97.7 }, todaysChangePerc: 900 }),
    ], "gainer", NOW);
    const presented = presentValidatedMovers(validated, "gainer", 10, NOW);
    expect(presented.status).toBe("empty");
    expect(presented.movers).toEqual([]);
  });

  it("preserves volume-first ordering for most active", () => {
    const payload = [
      ticker("LOWV", 11, 10, 100_000),
      ticker("HIV", 12, 10, 9_000_000),
    ];
    const validated = canonicalizeLiveTickers(payload, "active", NOW);
    const presented = presentValidatedMovers(validated, "active", 10, NOW);
    expect(presented.movers.map((m) => m.symbol)).toEqual(["HIV", "LOWV"]);
  });

  it("treats auth failures as unavailable and does not invent movers", () => {
    expect(parseMarketDataPayload(401, { tickers: [{ ticker: "AAA" }] })).toEqual({
      tickers: [],
      unavailable: true,
    });
    expect(parseMarketDataPayload(403, { error: "forbidden" })).toEqual({
      tickers: [],
      unavailable: true,
    });
  });

  it("treats upstream failures and error envelopes as unavailable", () => {
    expect(parseMarketDataPayload(503, { tickers: [] })).toEqual({
      tickers: [],
      unavailable: true,
    });
    expect(parseMarketDataPayload(200, { status: "ERROR", message: "Data temporarily unavailable", tickers: [] })).toEqual({
      tickers: [],
      unavailable: true,
    });
  });

  it("ignores malformed payloads instead of passing them through", () => {
    expect(parseMarketDataPayload(200, "not-json-object")).toEqual({
      tickers: [],
      unavailable: true,
    });
    expect(parseMarketDataPayload(200, { foo: 1 })).toEqual({
      tickers: [],
      unavailable: true,
    });
  });
});
