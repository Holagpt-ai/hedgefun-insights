import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLOAT_STALE_TIME_MS, mapFloatPayload, resetFloatSymbolCache } from "@/lib/market-data/float";

describe("Massive float mapping", () => {
  it("caches float aggressively on the client query contract", () => {
    expect(FLOAT_STALE_TIME_MS).toBeGreaterThanOrEqual(12 * 60 * 60 * 1000);
    expect(FLOAT_STALE_TIME_MS).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("maps a verified provider float and ignores outstanding shares", () => {
    const mapped = mapFloatPayload("AAPL", {
      status: "OK",
      results: {
        ticker: "AAPL",
        float: 15_100_000_000,
        outstanding_shares: 15_500_000_000,
        share_class_shares_outstanding: 15_500_000_000,
        as_of: "2026-09-01",
      },
    });
    expect(mapped.float).toBe(15_100_000_000);
    expect(mapped.asOf).toBe("2026-09-01");
    expect(mapped.source).toBe("massive_float");
  });

  it("keeps missing or non-positive float unavailable", () => {
    expect(mapFloatPayload("AAA", { results: { outstanding_shares: 1_000_000 } }).float).toBeNull();
    expect(mapFloatPayload("AAA", { results: { float: 0 } }).float).toBeNull();
    expect(mapFloatPayload("AAA", null).float).toBeNull();
  });

  it("maps the market-data envelope", () => {
    expect(
      mapFloatPayload("BBB", { ticker: "BBB", float: 2_400_000, as_of: "2026-09-01", source: "massive_float" }).float,
    ).toBe(2_400_000);
    expect(
      mapFloatPayload("BBB", { ticker: "BBB", float: null, as_of: null, source: "massive_float" }).float,
    ).toBeNull();
  });
});

describe("getFloatForSymbols isolation and bounds", () => {
  beforeEach(() => {
    resetFloatSymbolCache();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/polygon");
    vi.resetModules();
  });

  it("a failed ticker does not fail the rest", async () => {
    vi.doMock("@/lib/polygon", () => ({
      getFloat: async (ticker: string) => {
        if (ticker === "BAD") throw new Error("upstream");
        return { ticker, float: 1_000_000, as_of: "2026-09-01", source: "massive_float" };
      },
    }));
    const { getFloatForSymbols: fetchFloats } = await import("@/lib/market-data/float");
    const map = await fetchFloats(["GOOD", "BAD"]);
    expect(map.get("GOOD")?.float).toBe(1_000_000);
    expect(map.get("BAD")?.float ?? null).toBeNull();
  });

  it("bounds concurrency for a large symbol set", async () => {
    let inflight = 0;
    let maxInflight = 0;
    vi.doMock("@/lib/polygon", () => ({
      getFloat: async (ticker: string) => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inflight -= 1;
        return { ticker, float: 1_000_000, as_of: "2026-09-01", source: "massive_float" };
      },
    }));
    const { FLOAT_FETCH_CONCURRENCY, getFloatForSymbols } = await import("@/lib/market-data/float");
    const symbols = Array.from({ length: 80 }, (_, i) => `T${i}`);
    await getFloatForSymbols(symbols);
    expect(maxInflight).toBeGreaterThan(0);
    expect(maxInflight).toBeLessThanOrEqual(FLOAT_FETCH_CONCURRENCY);
  });

  it("reuses cached symbols when the visible set changes", async () => {
    const getFloat = vi.fn(async (ticker: string) => ({
      ticker,
      float: 1_000_000,
      as_of: "2026-09-01",
      source: "massive_float",
    }));
    vi.doMock("@/lib/polygon", () => ({ getFloat }));
    const { getFloatForSymbols } = await import("@/lib/market-data/float");
    await getFloatForSymbols(["AAA", "BBB"]);
    await getFloatForSymbols(["BBB", "CCC"]);
    expect(getFloat.mock.calls.map((call) => call[0]).sort()).toEqual(["AAA", "BBB", "CCC"]);
  });
});
