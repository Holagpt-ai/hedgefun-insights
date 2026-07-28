import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeScreenerSync } from "./auth.ts";
import {
  fetchJsonBounded,
  parseTickersPayload,
  ProviderUnavailableError,
} from "./provider.ts";
import {
  parseProviderAsOf,
  type PolygonTicker,
  PROVIDER_FUTURE_SKEW_MS,
  qualifiesDayTradeRadar,
  qualifiesGappers,
  qualifiesUnusualVolume,
  qualifiesVolumeSpikes,
  SCREENER_ROW_LIMIT,
  selectForTab,
  selectVolumeFirst,
} from "./selection.ts";

// ── Fixtures ──────────────────────────────────────────────────────────────

function ticker(partial: {
  ticker: string;
  volume: number;
  price?: number;
  change?: number;
  prevVol?: number;
  open?: number;
  prevClose?: number;
}): PolygonTicker {
  const price = partial.price ?? 10;
  const prevVol = partial.prevVol ?? 1_000_000;
  return {
    ticker: partial.ticker,
    todaysChangePerc: partial.change ?? 15,
    day: {
      c: price,
      o: partial.open ?? price,
      v: partial.volume,
    },
    prevDay: {
      c: partial.prevClose ?? price * 0.9,
      v: prevVol,
    },
    lastTrade: { p: price },
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────

Deno.test("auth: missing SYNC_SECRET fails closed", async () => {
  const r = await authorizeScreenerSync("Bearer anything", () => undefined);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 403);
});

Deno.test("auth: missing Authorization fails closed", async () => {
  const r = await authorizeScreenerSync(
    null,
    (k) => k === "SYNC_SECRET" ? "sync-value" : undefined,
  );
  assertEquals(r.ok, false);
});

Deno.test("auth: wrong Bearer fails closed", async () => {
  const r = await authorizeScreenerSync(
    "Bearer wrong",
    (k) => k === "SYNC_SECRET" ? "sync-value" : undefined,
  );
  assertEquals(r.ok, false);
});

Deno.test("auth: service-role key rejected as invocation token", async () => {
  const srk = "srk-secret-must-not-auth";
  const r = await authorizeScreenerSync(`Bearer ${srk}`, (k) => {
    if (k === "SUPABASE_SERVICE_ROLE_KEY") return srk;
    if (k === "SYNC_SECRET") return "sync-value";
    return undefined;
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 403);
});

Deno.test("auth: service-role alone still rejected when SYNC_SECRET unset", async () => {
  const srk = "srk-only";
  const r = await authorizeScreenerSync(
    `Bearer ${srk}`,
    (k) => k === "SUPABASE_SERVICE_ROLE_KEY" ? srk : undefined,
  );
  assertEquals(r.ok, false);
});

Deno.test("auth: valid SYNC_SECRET Bearer succeeds", async () => {
  const r = await authorizeScreenerSync(
    "Bearer sync-value",
    (k) => k === "SYNC_SECRET" ? "sync-value" : undefined,
  );
  assertEquals(r.ok, true);
});

// ── Provider ──────────────────────────────────────────────────────────────

Deno.test("provider: HTTP failure throws ProviderUnavailableError", async () => {
  const fetchImpl = () =>
    Promise.resolve(new Response("nope", { status: 500 }));
  await assertRejects(
    () => fetchJsonBounded("https://example.test/x", {}, { fetchImpl }),
    ProviderUnavailableError,
  );
});

Deno.test("provider: invalid JSON throws ProviderUnavailableError", async () => {
  const fetchImpl = () =>
    Promise.resolve(new Response("not-json{", { status: 200 }));
  await assertRejects(
    () => fetchJsonBounded("https://example.test/x", {}, { fetchImpl }),
    ProviderUnavailableError,
  );
});

Deno.test("provider: timeout throws ProviderUnavailableError", async () => {
  const fetchImpl = (_u: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  await assertRejects(
    () =>
      fetchJsonBounded("https://example.test/x", {}, {
        fetchImpl,
        timeoutMs: 20,
      }),
    ProviderUnavailableError,
  );
});

Deno.test("provider: invalid tickers shape fails closed", () => {
  let threw = false;
  try {
    parseTickersPayload({ status: "OK" });
  } catch (e) {
    threw = e instanceof ProviderUnavailableError;
  }
  assertEquals(threw, true);
});

Deno.test("provider: valid tickers payload accepted", () => {
  assertEquals(parseTickersPayload({ tickers: [] }).length, 0);
  assertEquals(parseTickersPayload({ tickers: [{ ticker: "A" }] }).length, 1);
});

// ── Volume-first selection ────────────────────────────────────────────────

Deno.test("selection: more than 20 qualifiers sliced by volume", () => {
  const rows: PolygonTicker[] = [];
  for (let i = 0; i < 25; i++) {
    const sym = `T${String(i).padStart(2, "0")}`;
    rows.push(
      ticker({
        ticker: sym,
        volume: (i + 1) * 1000,
        price: 5,
        change: 12,
        prevVol: 100, // RVOL huge
      }),
    );
  }
  const selected = selectForTab("day_trade_radar", rows);
  assertEquals(selected.length, SCREENER_ROW_LIMIT);
  assertEquals(selected[0].ticker, "T24"); // volume 25000
  assertEquals(selected[19].ticker, "T05"); // volume 6000
});

Deno.test("selection: higher volume outranks lower RVOL", () => {
  const lowRvolHighVol = ticker({
    ticker: "HIGHVOL",
    volume: 10_000_000,
    price: 5,
    change: 12,
    prevVol: 2_000_000, // RVOL 5.0
  });
  const highRvolLowVol = ticker({
    ticker: "HIGHRVOL",
    volume: 1_000_000,
    price: 5,
    change: 12,
    prevVol: 50_000, // RVOL 20
  });
  assertEquals(qualifiesDayTradeRadar(lowRvolHighVol), true);
  assertEquals(qualifiesDayTradeRadar(highRvolLowVol), true);
  const selected = selectForTab("day_trade_radar", [
    highRvolLowVol,
    lowRvolHighVol,
  ]);
  assertEquals(selected.map((t) => t.ticker), ["HIGHVOL", "HIGHRVOL"]);
});

Deno.test("selection: higher volume outranks higher absolute gap", () => {
  const highVolSmallGap = ticker({
    ticker: "HV",
    volume: 9_000_000,
    open: 10.6,
    prevClose: 10, // gap 6%
  });
  const lowVolBigGap = ticker({
    ticker: "LV",
    volume: 1_000_000,
    open: 15,
    prevClose: 10, // gap 50%
  });
  assertEquals(qualifiesGappers(highVolSmallGap), true);
  assertEquals(qualifiesGappers(lowVolBigGap), true);
  const selected = selectForTab("gappers", [lowVolBigGap, highVolSmallGap]);
  assertEquals(selected.map((t) => t.ticker), ["HV", "LV"]);
});

Deno.test("selection: equal volume uses symbol ascending tie-breaker", () => {
  const a = ticker({ ticker: "BBB", volume: 5_000_000, prevVol: 100_000 });
  const b = ticker({ ticker: "AAA", volume: 5_000_000, prevVol: 100_000 });
  const selected = selectVolumeFirst([a, b]);
  assertEquals(selected.map((t) => t.ticker), ["AAA", "BBB"]);
});

Deno.test("selection: invalid/zero/negative volume excluded", () => {
  const good = ticker({ ticker: "GOOD", volume: 1000, prevVol: 100 });
  const zero = ticker({ ticker: "ZERO", volume: 0, prevVol: 100 });
  const neg = ticker({ ticker: "NEG", volume: -5, prevVol: 100 });
  const missing: PolygonTicker = {
    ticker: "MISS",
    todaysChangePerc: 15,
    day: { c: 5 },
    prevDay: { c: 4, v: 100 },
  };
  const selected = selectVolumeFirst([good, zero, neg, missing]);
  assertEquals(selected.map((t) => t.ticker), ["GOOD"]);
});

Deno.test("selection: duplicate symbols appear once (keep higher volume)", () => {
  const low = ticker({ ticker: "DUP", volume: 1000, prevVol: 100 });
  const high = ticker({ ticker: "dup", volume: 9000, prevVol: 100 });
  const selected = selectVolumeFirst([low, high]);
  assertEquals(selected.length, 1);
  assertEquals(selected[0].ticker, "DUP");
  assertEquals(selected[0].day?.v, 9000);
});

Deno.test("selection: all five implemented tabs use volume-first contract", () => {
  const mk = (
    sym: string,
    vol: number,
    opts: {
      change?: number;
      prevVol?: number;
      open?: number;
      prevClose?: number;
      price?: number;
    } = {},
  ) =>
    ticker({
      ticker: sym,
      volume: vol,
      price: opts.price ?? 8,
      change: opts.change ?? 15,
      prevVol: opts.prevVol ?? 100_000,
      open: opts.open ?? 10.8,
      prevClose: opts.prevClose ?? 10,
    });

  // Universe where volume order differs from RVOL/gap/change order.
  const universe = [
    mk("A", 1_000_000, { prevVol: 50_000 }), // high RVOL, low vol
    mk("B", 8_000_000, { prevVol: 1_500_000 }), // lower RVOL, high vol
    mk("C", 3_000_000, { prevVol: 400_000 }),
  ];

  const tabs = [
    "day_trade_radar",
    "gappers",
    "volume_spikes",
    "gainers_losers",
    "unusual_volume",
  ] as const;

  for (const tab of tabs) {
    const selected = selectForTab(tab, universe);
    assertEquals(selected.length >= 1, true, `${tab} should have qualifiers`);
    for (let i = 1; i < selected.length; i++) {
      const prev = Number(selected[i - 1].day?.v);
      const cur = Number(selected[i].day?.v);
      assertEquals(
        prev >= cur,
        true,
        `${tab}: volume must be non-increasing`,
      );
    }
    // Highest volume qualifier first among those that qualify.
    if (
      tab === "day_trade_radar" || tab === "volume_spikes" ||
      tab === "unusual_volume" || tab === "gainers_losers"
    ) {
      assertEquals(
        selected[0].ticker,
        "B",
        `${tab} must lead with highest volume`,
      );
    }
    if (tab === "gappers") {
      assertEquals(selected[0].ticker, "B");
    }
  }

  // Sanity: predicates still enforce criteria (not volume alone).
  assertEquals(
    qualifiesVolumeSpikes(mk("X", 9_000_000, { prevVol: 8_000_000 })),
    false,
  ); // RVOL < 3
  assertEquals(
    qualifiesUnusualVolume(mk("X", 9_000_000, { prevVol: 3_000_000 })),
    false,
  ); // RVOL = 3
  assertEquals(
    qualifiesGappers(mk("X", 9_000_000, { open: 10.1, prevClose: 10 })),
    false,
  );
});

// ── Provider freshness parser ─────────────────────────────────────────────

const NOW_ISO = "2026-07-27T20:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);

Deno.test("freshness: nanosecond number parses correctly", () => {
  const ns = NOW_MS * 1_000_000;
  assertEquals(parseProviderAsOf(ns, NOW_MS), NOW_ISO);
});

Deno.test("freshness: nanosecond string parses correctly", () => {
  const ns = String(NOW_MS * 1_000_000);
  assertEquals(parseProviderAsOf(ns, NOW_MS), NOW_ISO);
});

Deno.test("freshness: missing/malformed/nonpositive timestamp rejected", () => {
  assertEquals(parseProviderAsOf(undefined, NOW_MS), null);
  assertEquals(parseProviderAsOf(null, NOW_MS), null);
  assertEquals(parseProviderAsOf("", NOW_MS), null);
  assertEquals(parseProviderAsOf("not-a-number", NOW_MS), null);
  assertEquals(parseProviderAsOf(12.5, NOW_MS), null);
  assertEquals(parseProviderAsOf(0, NOW_MS), null);
  assertEquals(parseProviderAsOf(-5, NOW_MS), null);
  assertEquals(parseProviderAsOf("-1", NOW_MS), null);
  assertEquals(parseProviderAsOf({}, NOW_MS), null);
});

Deno.test("freshness: future timestamp beyond five minutes rejected", () => {
  const tooFarMs = NOW_MS + PROVIDER_FUTURE_SKEW_MS + 1_000;
  assertEquals(parseProviderAsOf(tooFarMs * 1_000_000, NOW_MS), null);
  // Within skew is accepted.
  const okMs = NOW_MS + PROVIDER_FUTURE_SKEW_MS - 1_000;
  assertEquals(
    parseProviderAsOf(okMs * 1_000_000, NOW_MS),
    new Date(okMs).toISOString(),
  );
});

Deno.test("freshness: older closed-market timestamps are accepted", () => {
  const oldMs = NOW_MS - 36 * 60 * 60 * 1000;
  assertEquals(
    parseProviderAsOf(oldMs * 1_000_000, NOW_MS),
    new Date(oldMs).toISOString(),
  );
});

Deno.test("freshness: extremely long digit string returns null", () => {
  const huge = "9".repeat(10_000);
  assertEquals(parseProviderAsOf(huge, NOW_MS), null);
});

Deno.test("freshness: out-of-range Date value returns null", () => {
  // Milliseconds beyond the JS Date range; nowMs aligned so future-skew is not
  // the rejecting branch — Invalid Date must still yield null.
  const beyondMs = 8.65e15;
  assertEquals(
    parseProviderAsOf(beyondMs * 1_000_000, beyondMs),
    null,
  );
});

Deno.test("freshness: invalid nowMs returns null", () => {
  const ns = NOW_MS * 1_000_000;
  assertEquals(parseProviderAsOf(ns, Number.NaN), null);
  assertEquals(parseProviderAsOf(ns, Number.POSITIVE_INFINITY), null);
  assertEquals(parseProviderAsOf(ns, Number.NEGATIVE_INFINITY), null);
});

Deno.test("freshness: never throws on adversarial inputs", () => {
  const inputs: unknown[] = [
    undefined,
    null,
    "",
    "abc",
    "9".repeat(50_000),
    -1,
    0,
    1.5,
    Number.MAX_VALUE,
    {},
    [],
    true,
    Symbol("x"),
  ];
  for (const raw of inputs) {
    let threw = false;
    let result: string | null = "sentinel";
    try {
      result = parseProviderAsOf(raw as never, NOW_MS);
    } catch {
      threw = true;
    }
    assertEquals(threw, false);
    assertEquals(result === null || typeof result === "string", true);
  }
  // Invalid nowMs must also never throw.
  let threwNow = false;
  try {
    assertEquals(parseProviderAsOf(NOW_MS * 1_000_000, Number.NaN), null);
  } catch {
    threwNow = true;
  }
  assertEquals(threwNow, false);
});
