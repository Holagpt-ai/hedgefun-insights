import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assessSnapshot, classifyFetchFailure, computeBasis, fetchWithOutcome, normalizeBars,
} from "./market-data.ts";

const sessionDate = "2026-07-23";
// 10:00 ET → 14:00 UTC for a weekday in summer
const now = new Date("2026-07-23T15:00:00Z");
const t930 = Date.parse("2026-07-23T13:30:00Z"); // 09:30 ET
const t931 = Date.parse("2026-07-23T13:31:00Z");

Deno.test("normalizeBars keeps valid bars, rejects malformed", () => {
  const r = normalizeBars(
    [
      { t: t930, o: 100, h: 101, l: 99, c: 100.5, v: 1000 },
      { t: t931, o: 100.5, h: 102, l: 100, c: 101, v: 800 },
      { t: t931, o: -1, h: 1, l: 1, c: 1, v: 1 }, // invalid → rejected
      { t: t931, o: 101, h: 102, l: 100, c: 101.5, v: 400 }, // dup t → last wins
    ],
    sessionDate,
    now,
  );
  assertEquals(r.bars.length, 2);
  assertEquals(r.bars[1].c, 101.5);
});

Deno.test("normalizeBars rejects future bars", () => {
  const r = normalizeBars(
    [{ t: now.getTime() + 60_000, o: 1, h: 1, l: 1, c: 1, v: 1 }],
    sessionDate,
    now,
  );
  assertEquals(r.bars.length, 0);
});

Deno.test("assessSnapshot flags stale timestamp", () => {
  const body = {
    ticker: {
      prevDay: { c: 100 }, day: { c: 101, v: 10_000 },
      lastTrade: { t: now.getTime() - 60 * 60 * 1000 },
    },
  };
  const a = assessSnapshot(body, now);
  assertEquals(a.quality, "stale");
});

Deno.test("assessSnapshot returns missing when no ticker", () => {
  assertEquals(assessSnapshot({}, now).quality, "missing");
});

Deno.test("assessSnapshot: fresh lastTrade timestamp passes", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastTrade: { t: now.getTime() - 60_000 } } };
  assertEquals(assessSnapshot(body, now).quality, "ok");
});

Deno.test("assessSnapshot: fresh lastQuote timestamp passes", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastQuote: { t: now.getTime() - 60_000 } } };
  assertEquals(assessSnapshot(body, now).quality, "ok");
});

Deno.test("assessSnapshot: fresh ticker.updated (ns) passes without trade/quote", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, updated: (now.getTime() - 60_000) * 1e6 } };
  const a = assessSnapshot(body, now);
  assertEquals(a.quality, "ok");
  assert(a.lastTradeTs !== null && Math.abs(a.lastTradeTs - (now.getTime() - 60_000)) < 5);
});

Deno.test("assessSnapshot: fresh min.t (ms) passes without trade/quote", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, min: { t: now.getTime() - 30_000 } } };
  assertEquals(assessSnapshot(body, now).quality, "ok");
});

Deno.test("assessSnapshot: newest valid candidate wins", () => {
  const body = {
    ticker: {
      prevDay: { c: 100 }, day: { c: 101, v: 1 },
      lastTrade: { t: now.getTime() - 40 * 60 * 1000 },
      min: { t: now.getTime() - 60_000 },
    },
  };
  const a = assessSnapshot(body, now);
  assertEquals(a.quality, "ok");
  assert(a.lastTradeTs !== null && a.lastTradeTs >= now.getTime() - 60_000 - 5);
});

Deno.test("assessSnapshot: 44min age passes; 46min is stale", () => {
  const ok = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastTrade: { t: now.getTime() - 44 * 60 * 1000 } } };
  const stale = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastTrade: { t: now.getTime() - 46 * 60 * 1000 } } };
  assertEquals(assessSnapshot(ok, now).quality, "ok");
  assertEquals(assessSnapshot(stale, now).quality, "stale");
});

Deno.test("assessSnapshot: future timestamp (>5min) is rejected", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastTrade: { t: now.getTime() + 10 * 60 * 1000 } } };
  assertEquals(assessSnapshot(body, now).quality, "missing");
});

Deno.test("assessSnapshot: malformed timestamps rejected", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastTrade: { t: "nope" }, min: { t: -1 }, updated: NaN } };
  assertEquals(assessSnapshot(body, now).quality, "missing");
});

Deno.test("assessSnapshot: no permitted timestamp remains missing (SNAPSHOT_MISSING)", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 } } };
  assertEquals(assessSnapshot(body, now).quality, "missing");
});


// ── Transport failure diagnostics ────────────────────────────────────────

const PROVIDER_URL = "https://api.polygon.io/v2/aggs/ticker/AAPL?apiKey=SECRET_KEY_VALUE";

async function withFetch<T>(
  impl: () => Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (() => impl()) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("fetchWithOutcome: 429 keeps RATE_LIMITED with status 429", async () => {
  const r = await withFetch(
    () => Promise.resolve(new Response("rate limited", { status: 429 })),
    () => fetchWithOutcome(PROVIDER_URL, 1000),
  );
  assertEquals(r.kind, "transport_failure");
  if (r.kind !== "transport_failure") return;
  assertEquals(r.code, "RATE_LIMITED");
  assertEquals(r.http_status, 429);
  assertEquals(r.failure_kind, "http_error");
});

for (const status of [401, 403, 404, 500]) {
  Deno.test(`fetchWithOutcome: HTTP ${status} keeps PROVIDER_ERROR and reports status`, async () => {
    const r = await withFetch(
      () => Promise.resolve(new Response("upstream body", { status })),
      () => fetchWithOutcome(PROVIDER_URL, 1000),
    );
    assertEquals(r.kind, "transport_failure");
    if (r.kind !== "transport_failure") return;
    assertEquals(r.code, "PROVIDER_ERROR");
    assertEquals(r.http_status, status);
    assertEquals(r.failure_kind, "http_error");
  });
}

Deno.test("fetchWithOutcome: 200 with invalid JSON is PROVIDER_ERROR/200/invalid_json", async () => {
  const r = await withFetch(
    () => Promise.resolve(new Response("<html>not json</html>", { status: 200 })),
    () => fetchWithOutcome(PROVIDER_URL, 1000),
  );
  assertEquals(r.kind, "transport_failure");
  if (r.kind !== "transport_failure") return;
  assertEquals(r.code, "PROVIDER_ERROR");
  assertEquals(r.http_status, 200);
  assertEquals(r.failure_kind, "invalid_json");
});

Deno.test("fetchWithOutcome: timeout keeps PROVIDER_TIMEOUT and fabricates no status", async () => {
  const r = await withFetch(
    () => Promise.reject(new DOMException("Signal timed out.", "TimeoutError")),
    () => fetchWithOutcome(PROVIDER_URL, 1000),
  );
  assertEquals(r.kind, "transport_failure");
  if (r.kind !== "transport_failure") return;
  assertEquals(r.code, "PROVIDER_TIMEOUT");
  assertEquals(r.http_status, null);
  assertEquals(r.failure_kind, "timeout");
});

Deno.test("fetchWithOutcome: non-timeout fetch failure keeps PROVIDER_TIMEOUT but reads fetch_error", async () => {
  const r = await withFetch(
    () => Promise.reject(new TypeError("error sending request")),
    () => fetchWithOutcome(PROVIDER_URL, 1000),
  );
  assertEquals(r.kind, "transport_failure");
  if (r.kind !== "transport_failure") return;
  assertEquals(r.code, "PROVIDER_TIMEOUT");
  assertEquals(r.http_status, null);
  assertEquals(r.failure_kind, "fetch_error");
});

Deno.test("classifyFetchFailure distinguishes timeout from other fetch errors", () => {
  assertEquals(classifyFetchFailure(new DOMException("t", "TimeoutError")), "timeout");
  assertEquals(classifyFetchFailure(new DOMException("a", "AbortError")), "fetch_error");
  assertEquals(classifyFetchFailure(new TypeError("boom")), "fetch_error");
  assertEquals(classifyFetchFailure(null), "fetch_error");
});

Deno.test("transport failure carries no url, key, or response body", async () => {
  const r = await withFetch(
    () => Promise.resolve(new Response("SECRET_BODY apiKey=SECRET_KEY_VALUE", { status: 500 })),
    () => fetchWithOutcome(PROVIDER_URL, 1000),
  );
  assertEquals(Object.keys(r).sort(), ["code", "failure_kind", "http_status", "kind"]);
  const serialized = JSON.stringify(r);
  for (const forbidden of ["SECRET_KEY_VALUE", "SECRET_BODY", "apiKey", "http://", "https://", "polygon"]) {
    assert(!serialized.includes(forbidden), `leaked ${forbidden}`);
  }
});

Deno.test("computeBasis uses last bar price and cumulative volume", () => {
  const bars = [
    { t: t930, o: 100, h: 101, l: 99, c: 100.5, v: 1000 },
    { t: t931, o: 100.5, h: 102, l: 100, c: 101, v: 800 },
  ];
  const b = computeBasis(bars, {
    quality: "ok",
    lastTradeTs: t931,
    priorClose: 99.5,
    dayClose: 101,
    dayVolume: 20000,
    lastTradePrice: 101,
    minClose: 101,
    vwap: 100.8,
    symbol: "AAPL",
    quote: null,
  });
  assertEquals(b.price, 101);
  assertEquals(b.volume, 1800);
  assert(b.change_pct !== null && Math.abs(b.change_pct - ((101 - 99.5) / 99.5 * 100)) < 1e-6);
});

Deno.test("computeBasis rejects decimal-scale mismatch among corroborating fields", () => {
  const b = computeBasis([], {
    quality: "ok",
    lastTradeTs: t931,
    priorClose: 97,
    dayClose: 977,
    dayVolume: 20_000,
    lastTradePrice: 97.7,
    minClose: 97.65,
    vwap: 97.1,
    symbol: "EXAMPLE",
    quote: null,
  }, "EXAMPLE");
  assertEquals(b.price, null);
  assertEquals(b.quote?.valid, false);
  assertEquals(b.quote?.rejection_reason, "DECIMAL_SCALE_MISMATCH");
});
