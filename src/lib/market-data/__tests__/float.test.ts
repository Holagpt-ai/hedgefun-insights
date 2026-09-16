import { describe, expect, it, vi } from "vitest";
import { FLOAT_STALE_TIME_MS, mapFloatPayload } from "@/lib/market-data/float";

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

describe("getFloatForSymbols isolation", () => {
  it("a failed ticker does not fail the rest", async () => {
    vi.resetModules();
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
});
