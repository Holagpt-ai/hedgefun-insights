import { describe, expect, it, beforeEach } from "vitest";
import {
  marketDataClientCacheKey,
  readMarketDataClientCache,
  readMarketDataResponseMeta,
  resetMarketDataClientCacheForTests,
  writeMarketDataClientCache,
} from "@/lib/market-data/client-session-cache";

describe("market-data client session cache", () => {
  beforeEach(() => {
    resetMarketDataClientCacheForTests();
  });

  it("serves cached bodies until max-age expires", () => {
    const key = marketDataClientCacheKey("https://example.test/snap");
    writeMarketDataClientCache(key, { ticker: "AAPL" }, {
      freshness: "fresh",
      cache: "shared",
      sourceAsOfMs: null,
      cacheAgeMs: 0,
      maxAgeSeconds: 30,
      providerDelay: "unknown",
      marketSession: null,
    }, 1_000);

    expect(readMarketDataClientCache(key, 20_000)?.body).toEqual({ ticker: "AAPL" });
    expect(readMarketDataClientCache(key, 32_000)).toBeNull();
  });

  it("parses edge freshness headers separately from cache age", () => {
    const response = new Response("{}", {
      headers: {
        "X-Market-Data-Freshness": "aging",
        "X-Market-Data-Cache": "memory",
        "X-Market-Data-Cache-Age-Ms": "45000",
        "X-Market-Data-Source-As-Of": "2026-10-20T14:00:00.000Z",
        "Cache-Control": "public, max-age=15",
      },
    });
    const meta = readMarketDataResponseMeta(response, 30);
    expect(meta.freshness).toBe("aging");
    expect(meta.cacheAgeMs).toBe(45_000);
    expect(meta.maxAgeSeconds).toBe(15);
    expect(meta.sourceAsOfMs).toBe(Date.parse("2026-10-20T14:00:00.000Z"));
    expect(meta.providerDelay).toBe("unknown");
  });

  it("reads cache-freshness and provider-delay headers", () => {
    const response = new Response("{}", {
      headers: {
        "X-Market-Data-Cache-Freshness": "fresh",
        "X-Market-Data-Provider-Delay": "delayed",
        "X-Market-Data-Market-Session": "market",
        "Cache-Control": "public, max-age=30",
      },
    });
    const meta = readMarketDataResponseMeta(response, 30);
    expect(meta.freshness).toBe("fresh");
    expect(meta.providerDelay).toBe("delayed");
    expect(meta.marketSession).toBe("market");
  });
});
