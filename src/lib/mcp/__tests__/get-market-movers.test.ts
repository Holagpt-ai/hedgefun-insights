import { describe, expect, it } from "vitest";
import {
  assembleMarketMoversResponse,
  buildMoverToolResponse,
  canonicalizeLiveTickers,
  classifyFetchFailure,
  fetchMarketDataTickers,
  mergeMarketDataFetches,
  MOVER_STALE_MESSAGE,
  MOVER_UNAVAILABLE_MESSAGE,
  parseMarketDataPayload,
  presentValidatedMovers,
  type MarketDataFetchResult,
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

function currentFetch(tickers: unknown[]): MarketDataFetchResult {
  return { tickers, unavailable: false, freshness: "current", reason: null };
}

function lastSuccessFetch(tickers: unknown[]): MarketDataFetchResult {
  return { tickers, unavailable: false, freshness: "last_success", reason: "last_success" };
}

function unavailableFetch(reason: MarketDataFetchResult["reason"]): MarketDataFetchResult {
  return { tickers: [], unavailable: true, freshness: "unavailable", reason };
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

  it("maps a successful fetch with movers to available", () => {
    const result = assembleMarketMoversResponse(
      [currentFetch([ticker("AAA", 21, 20, 1_000_000)])],
      "gainer",
      10,
      NOW,
    );
    expect(result.structuredContent.status).toBe("available");
    expect(result.structuredContent.movers.map((m) => m.symbol)).toEqual(["AAA"]);
    expect(result.structuredContent.reason).toBeUndefined();
    expect(result.structuredContent.message).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent.movers);
  });

  it("maps a successful fetch with zero qualifying rows to empty", () => {
    const result = assembleMarketMoversResponse(
      [currentFetch([])],
      "gainer",
      10,
      NOW,
    );
    expect(result.structuredContent.status).toBe("empty");
    expect(result.structuredContent.movers).toEqual([]);
    expect(result.structuredContent.reason).toBeUndefined();
  });

  it("maps HTTP 401 to unavailable", () => {
    expect(parseMarketDataPayload(401, { tickers: [ticker("AAA", 21, 20, 1)] })).toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "auth_failed",
    });
    const result = assembleMarketMoversResponse(
      [unavailableFetch("auth_failed")],
      "gainer",
      10,
      NOW,
    );
    expect(result.structuredContent.status).toBe("unavailable");
    expect(result.structuredContent.movers).toEqual([]);
    expect(result.structuredContent.reason).toBe("auth_failed");
    expect(result.structuredContent.message).toBe(MOVER_UNAVAILABLE_MESSAGE);
    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });

  it("maps HTTP 403 to unavailable", () => {
    expect(parseMarketDataPayload(403, { error: "forbidden" })).toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "auth_failed",
    });
    expect(assembleMarketMoversResponse([unavailableFetch("auth_failed")], "gainer", 10, NOW).structuredContent.status).toBe("unavailable");
  });

  it("maps timeout and network failure to unavailable", async () => {
    expect(classifyFetchFailure(Object.assign(new Error("aborted"), { name: "TimeoutError" }))).toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "timeout",
    });
    expect(classifyFetchFailure(new TypeError("fetch failed"))).toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "network_failure",
    });

    const timeoutFetch: typeof fetch = async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    };
    await expect(fetchMarketDataTickers("gainers", { url: "https://example.supabase.co", key: "pub" }, timeoutFetch)).resolves.toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "timeout",
    });

    const networkFetch: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(fetchMarketDataTickers("losers", { url: "https://example.supabase.co", key: "pub" }, networkFetch)).resolves.toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "network_failure",
    });

    const timeoutResult = assembleMarketMoversResponse([unavailableFetch("timeout")], "gainer", 10, NOW);
    expect(timeoutResult.structuredContent.status).toBe("unavailable");
    expect(timeoutResult.structuredContent.reason).toBe("timeout");
    expect(timeoutResult.structuredContent.message).toBe(MOVER_UNAVAILABLE_MESSAGE);
  });

  it("maps upstream 5xx to unavailable", () => {
    expect(parseMarketDataPayload(503, { tickers: [] })).toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "upstream_error",
    });
    expect(parseMarketDataPayload(500, { tickers: [ticker("AAA", 21, 20, 1)] }).unavailable).toBe(true);
    expect(assembleMarketMoversResponse([unavailableFetch("upstream_error")], "gainer", 10, NOW).structuredContent.status).toBe("unavailable");
  });

  it("maps malformed JSON payloads to unavailable", async () => {
    expect(parseMarketDataPayload(200, "not-json-object")).toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "malformed_payload",
    });
    expect(parseMarketDataPayload(200, { foo: 1 })).toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "malformed_payload",
    });

    const malformedFetch: typeof fetch = async () => ({
      status: 200,
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    }) as Response;
    await expect(fetchMarketDataTickers("gainers", { url: "https://example.supabase.co", key: "pub" }, malformedFetch)).resolves.toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "malformed_payload",
    });
  });

  it("maps an upstream error envelope to unavailable", () => {
    expect(parseMarketDataPayload(200, {
      status: "ERROR",
      message: "Data temporarily unavailable",
      tickers: [],
    })).toEqual({
      tickers: [],
      unavailable: true,
      freshness: "unavailable",
      reason: "upstream_error",
    });
    const result = assembleMarketMoversResponse([unavailableFetch("upstream_error")], "gainer", 10, NOW);
    expect(result.structuredContent.status).toBe("unavailable");
    expect(result.structuredContent.movers).toEqual([]);
    expect(result.content[0].text).not.toContain("POLYGON");
    expect(result.content[0].text).not.toContain("apiKey");
  });

  it("maps a failed refresh with last-success data to stale, not current or empty", () => {
    expect(parseMarketDataPayload(200, {
      tickers: [ticker("AAA", 21, 20, 1_000_000)],
      status: "stale",
      freshness: "last_success",
    })).toEqual({
      tickers: [ticker("AAA", 21, 20, 1_000_000)],
      unavailable: false,
      freshness: "last_success",
      reason: "last_success",
    });

    const result = assembleMarketMoversResponse(
      [lastSuccessFetch([ticker("AAA", 21, 20, 1_000_000)])],
      "gainer",
      10,
      NOW,
    );
    expect(result.structuredContent.status).toBe("stale");
    expect(result.structuredContent.freshness).toBe("last_success");
    expect(result.structuredContent.reason).toBe("last_success");
    expect(result.structuredContent.message).toBe(MOVER_STALE_MESSAGE);
    expect(result.structuredContent.movers.map((m) => m.symbol)).toEqual(["AAA"]);
    expect(result.structuredContent.status).not.toBe("available");
    expect(result.structuredContent.status).not.toBe("empty");
  });

  it("maps a Polygon outage without last-success data to unavailable", () => {
    const merged = mergeMarketDataFetches([unavailableFetch("upstream_error")]);
    expect(merged.freshness).toBe("unavailable");
    const result = assembleMarketMoversResponse([unavailableFetch("upstream_error")], "gainer", 10, NOW);
    expect(result.structuredContent.status).toBe("unavailable");
    expect(result.structuredContent.movers).toEqual([]);
  });

  it("treats invalid rows filtered from a successful response as empty, not unavailable", () => {
    const result = assembleMarketMoversResponse(
      [currentFetch([
        ticker("BAD", 977, 96, 1, { lastTrade: { p: 97.7, t: NOW }, min: { c: 97.7 }, todaysChangePerc: 900 }),
      ])],
      "gainer",
      10,
      NOW,
    );
    expect(result.structuredContent.status).toBe("empty");
    expect(result.structuredContent.movers).toEqual([]);
    expect(result.structuredContent.reason).toBeUndefined();
    expect(result.structuredContent.message).toBeUndefined();
  });

  it("does not label last-success invalid-only payloads as empty", () => {
    const result = assembleMarketMoversResponse(
      [lastSuccessFetch([
        ticker("BAD", 977, 96, 1, { lastTrade: { p: 97.7, t: NOW }, min: { c: 97.7 }, todaysChangePerc: 900 }),
      ])],
      "gainer",
      10,
      NOW,
    );
    expect(result.structuredContent.status).toBe("stale");
    expect(result.structuredContent.freshness).toBe("last_success");
    expect(result.structuredContent.movers).toEqual([]);
  });

  it("prefers current data over last-success when merging dual fetches", () => {
    const merged = mergeMarketDataFetches([
      currentFetch([ticker("CUR", 12, 10, 100)]),
      lastSuccessFetch([ticker("OLD", 22, 20, 100)]),
    ]);
    expect(merged.freshness).toBe("current");
    expect(merged.tickers).toHaveLength(1);
  });

  it("uses last-success when every live fetch failed but a prior payload exists", () => {
    const merged = mergeMarketDataFetches([
      unavailableFetch("upstream_error"),
      lastSuccessFetch([ticker("OLD", 22, 20, 100)]),
    ]);
    expect(merged.freshness).toBe("last_success");
    expect(merged.reason).toBe("last_success");
  });

  it("does not expose internal error text or credentials in the tool response", () => {
    const result = buildMoverToolResponse([], "unavailable", "auth_failed");
    const blob = JSON.stringify(result);
    expect(blob).toContain(MOVER_UNAVAILABLE_MESSAGE);
    expect(blob).not.toContain("Bearer");
    expect(blob).not.toContain("POLYGON_API_KEY");
    expect(blob).not.toContain("secret");
    expect(result.content[0].text).toBe("[]");
  });
});
