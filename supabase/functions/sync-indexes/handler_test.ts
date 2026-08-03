import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DbClient,
  type MarketIndexRow,
  handleSyncIndexes,
  INDEXES,
  type SyncDeps,
} from "./handler.ts";

const SYNC_SECRET = "test-sync-secret";
const SERVICE_ROLE = "test-service-role-key";
const POLY_KEY = "poly-test-key";
const FIXED_ISO = "2026-08-02T20:00:00.000Z";
const FIXED_MS = Date.parse(FIXED_ISO);

/** Exact frontend displayed universe from MarketTicker / DashboardIndexCards. */
const DISPLAYED_FRONTEND_SYMBOLS = [
  "SPY",
  "QQQ",
  "DIA",
  "IWM",
  "VIXY",
  "GLD",
  "SLV",
  "IBIT",
  "BNO",
  "UNG",
  "TLT",
  "UUP",
] as const;

const REQUIRED_MAPPINGS: Record<(typeof DISPLAYED_FRONTEND_SYMBOLS)[number], string> = {
  SPY: "S&P 500",
  QQQ: "Nasdaq 100",
  DIA: "Dow Jones",
  IWM: "Russell 2000",
  VIXY: "VIX",
  GLD: "Gold",
  SLV: "Silver",
  IBIT: "Bitcoin",
  BNO: "Brent Crude",
  UNG: "Nat Gas",
  TLT: "20Y Treasury",
  UUP: "US Dollar",
};

type UpsertCall = { table: string; row: MarketIndexRow; onConflict: string };

function baseEnv(extra: Record<string, string> = {}): SyncDeps["env"] {
  const map: Record<string, string> = {
    SYNC_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
    SUPABASE_URL: "https://example.supabase.co",
    POLYGON_API_KEY: POLY_KEY,
    ...extra,
  };
  return (k) => map[k];
}

function mockDb(upserts: UpsertCall[], failSymbols: Set<string> = new Set()): DbClient {
  return {
    from: (table: string) => ({
      upsert: async (row: MarketIndexRow, opts: { onConflict: string }) => {
        if (failSymbols.has(row.symbol)) {
          return { error: { message: `forced upsert failure for ${row.symbol}` } };
        }
        upserts.push({ table, row, onConflict: opts.onConflict });
        return { error: null };
      },
    }),
  };
}

function okSnapshot(prevClose = 100, dayClose = 101) {
  return new Response(
    JSON.stringify({
      status: "OK",
      ticker: {
        day: { c: dayClose },
        min: { c: dayClose },
        lastTrade: { p: dayClose },
        prevDay: { c: prevClose },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function okAggs(closes = [99, 100, 101]) {
  return new Response(
    JSON.stringify({
      status: "OK",
      results: closes.map((c) => ({ c })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function failingSnapshot() {
  return new Response(JSON.stringify({ status: "ERROR" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(failTickers: Set<string> = new Set()): SyncDeps["fetch"] {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    const snapMatch = url.match(/\/tickers\/([A-Z]+)\?/);
    const aggMatch = url.match(/\/aggs\/ticker\/([A-Z]+)\//);
    const ticker = snapMatch?.[1] ?? aggMatch?.[1];
    assertExists(ticker, `unexpected fetch URL: ${url}`);

    if (url.includes("/snapshot/")) {
      if (failTickers.has(ticker)) return failingSnapshot();
      return okSnapshot();
    }
    if (url.includes("/aggs/")) {
      return okAggs();
    }
    throw new Error(`unexpected fetch URL: ${url}`);
  };
}

function authReq(): Request {
  return new Request("https://example.supabase.co/functions/v1/sync-indexes", {
    method: "POST",
    headers: { Authorization: `Bearer ${SYNC_SECRET}` },
  });
}

Deno.test("sync universe contains exactly the required 12 symbols with no duplicates", () => {
  assertEquals(INDEXES.length, 12);
  const tickers = INDEXES.map((i) => i.ticker);
  assertEquals(tickers, [...DISPLAYED_FRONTEND_SYMBOLS]);
  assertEquals(new Set(tickers).size, 12);
});

Deno.test("every currently displayed frontend symbol is represented in the sync universe", () => {
  const syncSet = new Set(INDEXES.map((i) => i.ticker));
  for (const symbol of DISPLAYED_FRONTEND_SYMBOLS) {
    assertEquals(syncSet.has(symbol), true, `missing sync symbol: ${symbol}`);
  }
});

Deno.test("required symbol/name mappings are exact", () => {
  for (const idx of INDEXES) {
    assertEquals(idx.name, REQUIRED_MAPPINGS[idx.ticker], `mapping mismatch for ${idx.ticker}`);
  }
});

Deno.test("failure for one symbol does not prevent later symbols from being processed", async () => {
  const upserts: UpsertCall[] = [];
  // Fail the first of the newly added symbols; later symbols must still run.
  const failTickers = new Set(["VIXY"]);
  const res = await handleSyncIndexes(authReq(), {
    env: baseEnv(),
    fetch: mockFetch(failTickers),
    createClient: () => mockDb(upserts),
    nowIso: () => FIXED_ISO,
    nowMs: () => FIXED_MS,
  });

  assertEquals(res.status, 207);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.partial, true);
  assertEquals(body.successCount, 11);
  assertEquals(body.failureCount, 1);

  const resultTickers = body.results.map((r: { ticker: string }) => r.ticker);
  assertEquals(resultTickers, [...DISPLAYED_FRONTEND_SYMBOLS]);

  const vixy = body.results.find((r: { ticker: string }) => r.ticker === "VIXY");
  assertEquals(vixy.status, "error");

  const written = upserts.map((u) => u.row.symbol);
  assertEquals(written.includes("VIXY"), false);
  assertEquals(written.includes("GLD"), true);
  assertEquals(written.includes("UUP"), true);
  assertEquals(written.length, 11);
});

Deno.test("failed symbol is not written or assigned a fresh updated_at", async () => {
  const upserts: UpsertCall[] = [];
  const res = await handleSyncIndexes(authReq(), {
    env: baseEnv(),
    fetch: mockFetch(new Set(["GLD"])),
    createClient: () => mockDb(upserts),
    nowIso: () => FIXED_ISO,
    nowMs: () => FIXED_MS,
  });

  assertEquals(res.status, 207);
  const written = upserts.map((u) => u.row.symbol);
  assertEquals(written.includes("GLD"), false);
  for (const call of upserts) {
    assertEquals(call.row.updated_at, FIXED_ISO);
    assertEquals(call.onConflict, "symbol");
    assertEquals(call.table, "market_indexes");
  }
});

Deno.test("successful symbols are still written when another symbol fails", async () => {
  const upserts: UpsertCall[] = [];
  const res = await handleSyncIndexes(authReq(), {
    env: baseEnv(),
    fetch: mockFetch(new Set(["IBIT"])),
    createClient: () => mockDb(upserts),
    nowIso: () => FIXED_ISO,
    nowMs: () => FIXED_MS,
  });

  assertEquals(res.status, 207);
  const body = await res.json();
  assertEquals(body.successCount, 11);
  assertEquals(body.failureCount, 1);

  const written = new Set(upserts.map((u) => u.row.symbol));
  for (const symbol of DISPLAYED_FRONTEND_SYMBOLS) {
    if (symbol === "IBIT") {
      assertEquals(written.has(symbol), false);
    } else {
      assertEquals(written.has(symbol), true, `expected write for ${symbol}`);
    }
  }
});

Deno.test("partial failure retains existing 207 response/status behavior", async () => {
  const upserts: UpsertCall[] = [];
  const res = await handleSyncIndexes(authReq(), {
    env: baseEnv(),
    fetch: mockFetch(new Set(["TLT"])),
    createClient: () => mockDb(upserts),
    nowIso: () => FIXED_ISO,
    nowMs: () => FIXED_MS,
  });

  assertEquals(res.status, 207);
  const body = await res.json();
  assertEquals(body, {
    success: false,
    partial: true,
    successCount: 11,
    failureCount: 1,
    results: body.results,
  });
  assertEquals(body.results.length, 12);
});

Deno.test("all symbols succeeding returns 200 success:true", async () => {
  const upserts: UpsertCall[] = [];
  const res = await handleSyncIndexes(authReq(), {
    env: baseEnv(),
    fetch: mockFetch(),
    createClient: () => mockDb(upserts),
    nowIso: () => FIXED_ISO,
    nowMs: () => FIXED_MS,
  });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.successCount, 12);
  assertEquals(body.failureCount, 0);
  assertEquals(upserts.length, 12);
});

Deno.test("all symbols failing returns 502 success:false", async () => {
  const upserts: UpsertCall[] = [];
  const failAll = new Set([...DISPLAYED_FRONTEND_SYMBOLS]);
  const res = await handleSyncIndexes(authReq(), {
    env: baseEnv(),
    fetch: mockFetch(failAll),
    createClient: () => mockDb(upserts),
    nowIso: () => FIXED_ISO,
    nowMs: () => FIXED_MS,
  });

  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(body.success, false);
  assertEquals(body.successCount, 0);
  assertEquals(body.failureCount, 12);
  assertEquals(upserts.length, 0);
});
