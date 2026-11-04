import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FLOAT_CACHE_TTL_MS } from "../market-data/float.ts";
import type { QualificationDb } from "../day-trade/persist-qualification-lifecycle.ts";
import {
  attachVerifiedFloatSharesToRows,
  enrichPublishedRowsWithVerifiedFloat,
  resetScreenerFloatEnrichCacheForTests,
  resolveScreenerFloatSharesBySymbol,
} from "./screener-float-enrich.ts";
import type { ScreenerResultRow } from "./rows.ts";

function sampleRow(symbol: string, float: number | null = null): ScreenerResultRow {
  return {
    tab_id: "gappers",
    symbol,
    company_name: symbol,
    price: 10,
    change_percent: 1,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
    float_shares: float,
    gap_percent: 1,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 500_000,
    volume_ratio_prior_session: 2,
    day_high: 11,
    day_low: 9,
    avg_volume_20d: null,
    rvol_20d: null,
    provider_as_of: "2026-11-04T15:00:00.000Z",
    sync_run_id: crypto.randomUUID(),
    updated_at: "2026-11-04T15:00:00.000Z",
  };
}

Deno.test("screener float enrich: maps verified Massive float onto rows", async () => {
  resetScreenerFloatEnrichCacheForTests();
  const fetchImpl = async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("ticker=GOOD")) {
      return new Response(JSON.stringify({
        results: { ticker: "GOOD", float: 4_500_000, as_of: "2026-11-01" },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ results: { outstanding_shares: 9_000_000 } }), {
      status: 200,
    });
  };
  const rows = await enrichPublishedRowsWithVerifiedFloat(
    [sampleRow("GOOD"), sampleRow("BAD")],
    {
      nowMs: Date.parse("2026-11-04T16:00:00.000Z"),
      apiKey: "test-key",
      fetchImpl,
    },
  );
  assertEquals(rows[0]?.float_shares, 4_500_000);
  assertEquals(rows[1]?.float_shares, null);
});

Deno.test("screener float enrich: provider failure leaves null without blocking", async () => {
  resetScreenerFloatEnrichCacheForTests();
  const fetchImpl = async () => new Response("rate limited", { status: 429 });
  const floats = await resolveScreenerFloatSharesBySymbol({
    symbols: ["AAA"],
    nowMs: Date.now(),
    apiKey: "key",
    fetchImpl,
  });
  assertEquals(floats.has("AAA"), false);
  const rows = attachVerifiedFloatSharesToRows([sampleRow("AAA")], floats);
  assertEquals(rows[0]?.float_shares, null);
});

Deno.test("screener float enrich: reuses fresh screener_results without refetch", async () => {
  resetScreenerFloatEnrichCacheForTests();
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ results: { float: 1 } }), { status: 200 });
  };
  const nowMs = Date.parse("2026-11-04T16:00:00.000Z");
  const db = {
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      select: () => ({
        in: () => ({
          not: () => ({
            order: () => ({
              limit: async () => ({
                data: [{
                  symbol: "FRESH",
                  float_shares: 3_300_000,
                  provider_as_of: new Date(nowMs - FLOAT_CACHE_TTL_MS + 60_000).toISOString(),
                }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as QualificationDb;

  const floats = await resolveScreenerFloatSharesBySymbol({
    symbols: ["FRESH"],
    nowMs,
    apiKey: "key",
    fetchImpl,
    db,
  });
  assertEquals(floats.get("FRESH"), 3_300_000);
  assertEquals(fetchCalls, 0);
});

Deno.test("screener float enrich: stale screener_results triggers refetch", async () => {
  resetScreenerFloatEnrichCacheForTests();
  const nowMs = Date.parse("2026-11-04T16:00:00.000Z");
  const db = {
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      select: () => ({
        in: () => ({
          not: () => ({
            order: () => ({
              limit: async () => ({
                data: [{
                  symbol: "STALE",
                  float_shares: 1_000_000,
                  provider_as_of: "2026-10-01T12:00:00.000Z",
                }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as QualificationDb;
  const fetchImpl = async () =>
    new Response(JSON.stringify({ results: { float: 2_000_000 } }), { status: 200 });

  const floats = await resolveScreenerFloatSharesBySymbol({
    symbols: ["STALE"],
    nowMs,
    apiKey: "key",
    fetchImpl,
    db,
  });
  assertEquals(floats.get("STALE"), 2_000_000);
});
