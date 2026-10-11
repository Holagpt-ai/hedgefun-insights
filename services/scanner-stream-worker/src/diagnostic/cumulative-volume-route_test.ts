import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createFixedWindowRateLimiter,
  CUMULATIVE_VOLUME_DIAG_MAX_REQUESTS,
  handleCumulativeVolumeDiagnostic,
} from "./cumulative-volume-route.ts";

const SECRET = "test-worker-secret";
const KEY = "polygon-key-should-not-leak";

function req(symbol: string, secret = SECRET): Request {
  return new Request(
    `http://127.0.0.1/diagnostic/cumulative-volume?symbol=${encodeURIComponent(symbol)}`,
    { headers: { "x-radar-worker-secret": secret } },
  );
}

Deno.test("cumulative volume route rejects missing auth before polygon", async () => {
  let fetchCalls = 0;
  const res = await handleCumulativeVolumeDiagnostic(
    req("AAPL", "wrong"),
    { radarWorkerSecret: SECRET, polygonApiKey: KEY, fetchFn: async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 200 });
    } },
    createFixedWindowRateLimiter({ maxRequests: 100, windowMs: 60_000 }),
  );
  assertEquals(res.status, 401);
  assertEquals(fetchCalls, 0);
});

Deno.test("cumulative volume route rejects invalid symbols before polygon", async () => {
  let fetchCalls = 0;
  const res = await handleCumulativeVolumeDiagnostic(
    req("1AAPL"),
    { radarWorkerSecret: SECRET, polygonApiKey: KEY, fetchFn: async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 200 });
    } },
    createFixedWindowRateLimiter({ maxRequests: 100, windowMs: 60_000 }),
  );
  assertEquals(res.status, 400);
  const body = await res.json() as { error: string };
  assertEquals(body.error, "invalid_symbol");
  assertEquals(fetchCalls, 0);
});

Deno.test("cumulative volume route enforces rate limit", async () => {
  let fetchCalls = 0;
  const limiter = createFixedWindowRateLimiter({
    maxRequests: 2,
    windowMs: 60_000,
  });
  const deps = {
    radarWorkerSecret: SECRET,
    polygonApiKey: KEY,
    nowMs: () => 1_000_000,
    fetchFn: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({
        ticker: { day: { v: 1 }, min: { av: 1 }, updated: 1, market: { session: "regular" } },
      }), { status: 200 });
    },
  };
  assertEquals((await handleCumulativeVolumeDiagnostic(req("AAPL"), deps, limiter)).status, 200);
  assertEquals((await handleCumulativeVolumeDiagnostic(req("MSFT"), deps, limiter)).status, 200);
  const limited = await handleCumulativeVolumeDiagnostic(req("NVDA"), deps, limiter);
  assertEquals(limited.status, 429);
  assertEquals(fetchCalls, 2);
});

Deno.test("cumulative volume route never returns api key material", async () => {
  const res = await handleCumulativeVolumeDiagnostic(
    req("AAPL"),
    {
      radarWorkerSecret: SECRET,
      polygonApiKey: KEY,
      fetchFn: async () =>
        new Response(JSON.stringify({
          ticker: {
            day: { v: 100 },
            min: { av: 90 },
            updated: 1,
            market: { session: "regular" },
          },
        }), { status: 200 }),
    },
    createFixedWindowRateLimiter({ maxRequests: 100, windowMs: 60_000 }),
  );
  assertEquals(res.status, 200);
  const text = await res.text();
  assert(!text.includes(KEY));
  assert(!text.includes("apiKey"));
});

Deno.test("cumulative volume route default limit matches release constant", () => {
  const limiter = createFixedWindowRateLimiter({
    maxRequests: CUMULATIVE_VOLUME_DIAG_MAX_REQUESTS,
    windowMs: 60_000,
  });
  const deps = {
    radarWorkerSecret: SECRET,
    polygonApiKey: KEY,
    nowMs: () => 5_000,
    fetchFn: async () => new Response("{}", { status: 200 }),
  };
  return (async () => {
    for (let i = 0; i < CUMULATIVE_VOLUME_DIAG_MAX_REQUESTS; i++) {
      const res = await handleCumulativeVolumeDiagnostic(req("AAPL"), deps, limiter);
      assertEquals(res.status, 200);
    }
    assertEquals((await handleCumulativeVolumeDiagnostic(req("AAPL"), deps, limiter)).status, 429);
  })();
});
