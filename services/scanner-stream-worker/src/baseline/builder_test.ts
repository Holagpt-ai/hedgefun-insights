import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createRadarBridge } from "../bridge.ts";
import { createDailyCache, runBaselineJob } from "./builder.ts";
import { lastCompletedRegularSessionDate } from "./dates.ts";
import { groupedUrl } from "./grouped.ts";
import type { BaselineState, ReplaceGenerationArgs, RpcFn } from "./persist.ts";

const GEN_NEW = "11111111-2222-3333-4444-555555555555";
const GEN_PRIOR = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const PRIOR_STATE: BaselineState = {
  current_generation_id: GEN_PRIOR,
  status: "available",
  period_start: "2025-08-11",
  period_end: "2026-08-11",
  symbol_count: 1,
  provider_as_of: "2026-08-11T20:00:01.000Z",
};

const UNUSABLE_PRIOR: BaselineState = {
  ...PRIOR_STATE,
  status: "unavailable",
};

type FetchCall = { url: string; auth: string | null };

function groupedResponse(
  rows: Array<{ T: string; h: number; l: number; t?: number }>,
): Response {
  return new Response(
    JSON.stringify({ status: "OK", resultsCount: rows.length, results: rows }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function fakeGroupedFetch(
  days: Record<string, Array<{ T: string; h: number; l: number }>>,
  calls: FetchCall[],
  opts: { failDates?: Set<string>; statusForFail?: number } = {},
): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const auth = init?.headers instanceof Headers
      ? init.headers.get("Authorization")
      : (init?.headers as Record<string, string> | undefined)?.Authorization ??
        null;
    calls.push({ url, auth });
    const match = url.match(/stocks\/(\d{4}-\d{2}-\d{2})/);
    if (!match) return new Response("not_found", { status: 404 });
    const date = match[1];
    if (opts.failDates?.has(date)) {
      return new Response("nope", { status: opts.statusForFail ?? 500 });
    }
    return groupedResponse(days[date] ?? []);
  };
}

function recordingRpc(calls: ReplaceGenerationArgs[]): RpcFn {
  return async (args) => {
    calls.push(args);
    return { error: null };
  };
}

function instantSleep() {
  return Promise.resolve();
}

Deno.test("current regular session is excluded from the window", () => {
  const exceptions: never[] = [];
  const duringSession = Date.parse("2026-08-12T18:00:00.000Z");
  const afterClose = Date.parse("2026-08-12T20:00:01.000Z");
  assertEquals(
    lastCompletedRegularSessionDate(duringSession, exceptions),
    "2026-08-11",
  );
  assertEquals(
    lastCompletedRegularSessionDate(afterClose, exceptions),
    "2026-08-12",
  );
});

Deno.test("builder excludes the in-progress session from grouped fetches", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationArgs[] = [];
  const nowMs = Date.parse("2026-08-12T18:00:00.000Z");
  await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({
      "2026-08-10": [{ T: "AAPL", h: 10, l: 5 }],
      "2026-08-11": [{ T: "AAPL", h: 12, l: 4 }],
      "2026-08-12": [{ T: "AAPL", h: 99, l: 1 }],
    }, fetchCalls),
    polygonApiKey: "test-key",
    rpc: recordingRpc(rpcCalls),
    loadState: async () => ({
      current_generation_id: null,
      status: "initializing",
      period_start: null,
      period_end: null,
      symbol_count: 0,
      provider_as_of: null,
    }),
    loadExceptions: async () => [],
    minSessions: 1,
    lookbackCalendarDays: 3,
    cache: createDailyCache(),
    lastSuccessfulPeriodEnd: null,
    newGenerationId: () => GEN_NEW,
    sleep: instantSleep,
  });

  const fetched = fetchCalls.map((c) => c.url);
  assertEquals(fetched.includes(groupedUrl("2026-08-12")), false);
  assertEquals(fetched.includes(groupedUrl("2026-08-11")), true);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].p_period_end, "2026-08-11");
  assertEquals(rpcCalls[0].p_rows[0].high_52w, 12);
  assertEquals(rpcCalls[0].p_rows[0].low_52w, 4);
  for (const call of fetchCalls) {
    assertEquals(call.url.includes("apiKey"), false);
    assertEquals(call.url.includes("adjusted=true"), true);
    assertEquals(new URL(call.url).searchParams.get("adjusted"), "true");
    assertEquals(call.auth, "Bearer test-key");
  }
});

Deno.test("invalid bars are skipped and incomplete history is omitted", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationArgs[] = [];
  const nowMs = Date.parse("2026-08-12T20:00:01.000Z");
  const result = await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({
      "2026-08-10": [
        { T: "AAPL", h: 10, l: 5 },
        { T: "bad ticker", h: 8, l: 2 },
        { T: "TOOLONGSYMBOLX", h: 8, l: 2 },
        { T: "MSFT", h: Number.NaN, l: 2 },
        { T: "IBM", h: 3, l: 9 },
        { T: "AMD", h: 20, l: 11 },
      ],
      "2026-08-11": [
        { T: "AAPL", h: 12, l: 4 },
        { T: "AMD", h: 19, l: 10 },
      ],
      "2026-08-12": [
        { T: "AAPL", h: 11, l: 6 },
      ],
    }, fetchCalls),
    polygonApiKey: "test-key",
    rpc: recordingRpc(rpcCalls),
    loadState: async () => ({
      current_generation_id: null,
      status: "initializing",
      period_start: null,
      period_end: null,
      symbol_count: 0,
      provider_as_of: null,
    }),
    loadExceptions: async () => [],
    minSessions: 3,
    lookbackCalendarDays: 3,
    cache: createDailyCache(),
    lastSuccessfulPeriodEnd: null,
    newGenerationId: () => GEN_NEW,
    sleep: instantSleep,
  });

  assertEquals(result.errorCode, null);
  assertEquals(rpcCalls.length, 1);
  const symbols = rpcCalls[0].p_rows.map((r) => r.symbol).sort();
  assertEquals(symbols, ["AAPL"]);
  assertEquals(rpcCalls[0].p_rows[0].sessions_observed, 3);
  assertEquals(rpcCalls[0].p_rows[0].high_52w, 12);
  assertEquals(rpcCalls[0].p_rows[0].low_52w, 4);
});

Deno.test("failed provider build retains prior generation and never calls RPC", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationArgs[] = [];
  const nowMs = Date.parse("2026-08-12T20:00:01.000Z");
  const result = await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch(
      {
        "2026-08-10": [{ T: "AAPL", h: 10, l: 5 }],
        "2026-08-11": [{ T: "AAPL", h: 12, l: 4 }],
        "2026-08-12": [{ T: "AAPL", h: 11, l: 6 }],
      },
      fetchCalls,
      { failDates: new Set(["2026-08-12"]), statusForFail: 500 },
    ),
    polygonApiKey: "test-key",
    rpc: recordingRpc(rpcCalls),
    loadState: async () => UNUSABLE_PRIOR,
    loadExceptions: async () => [],
    minSessions: 1,
    lookbackCalendarDays: 3,
    cache: createDailyCache(),
    lastSuccessfulPeriodEnd: "2026-08-11",
    newGenerationId: () => GEN_NEW,
    sleep: instantSleep,
  });

  assertEquals(rpcCalls.length, 0);
  assertEquals(result.didRebuild, false);
  assertEquals(result.state.current_generation_id, GEN_PRIOR);
  assertEquals(result.state.period_end, "2026-08-11");
  assertEquals(result.lastSuccessfulPeriodEnd, "2026-08-11");
  assertEquals(result.errorCode, "provider_unavailable");
});

Deno.test("RPC failure retains prior generation pointer", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationArgs[] = [];
  const nowMs = Date.parse("2026-08-12T20:00:01.000Z");
  const result = await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({
      "2026-08-10": [{ T: "AAPL", h: 10, l: 5 }],
      "2026-08-11": [{ T: "AAPL", h: 12, l: 4 }],
      "2026-08-12": [{ T: "AAPL", h: 11, l: 6 }],
    }, fetchCalls),
    polygonApiKey: "test-key",
    rpc: async (args) => {
      rpcCalls.push(args);
      return { error: { message: "persist_failed" } };
    },
    loadState: async () => UNUSABLE_PRIOR,
    loadExceptions: async () => [],
    minSessions: 1,
    lookbackCalendarDays: 3,
    cache: createDailyCache(),
    lastSuccessfulPeriodEnd: "2026-08-11",
    newGenerationId: () => GEN_NEW,
    sleep: instantSleep,
  });

  assertEquals(rpcCalls.length, 1);
  assertEquals(result.didRebuild, false);
  assertEquals(result.state.current_generation_id, GEN_PRIOR);
  assertEquals(result.lastSuccessfulPeriodEnd, "2026-08-11");
  assertEquals(result.errorCode, "persist_failed");
});

Deno.test("does not rebuild when period_end has not advanced", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationArgs[] = [];
  const nowMs = Date.parse("2026-08-12T18:00:00.000Z");
  const result = await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({}, fetchCalls),
    polygonApiKey: "test-key",
    rpc: recordingRpc(rpcCalls),
    loadState: async () => ({
      ...PRIOR_STATE,
      period_end: "2026-08-11",
    }),
    loadExceptions: async () => [],
    minSessions: 1,
    lookbackCalendarDays: 3,
    cache: createDailyCache(),
    lastSuccessfulPeriodEnd: "2026-08-11",
    newGenerationId: () => GEN_NEW,
    sleep: instantSleep,
  });

  assertEquals(result.didRebuild, false);
  assertEquals(result.refreshDeferred, false);
  assertEquals(fetchCalls.length, 0);
  assertEquals(rpcCalls.length, 0);
  assertEquals(result.state.current_generation_id, GEN_PRIOR);
});

Deno.test("Phase B one-session stale AVAILABLE baseline defers full replace", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationArgs[] = [];
  const lines: string[] = [];
  const original = console.log;
  console.log = (msg?: unknown) => {
    lines.push(String(msg ?? ""));
  };
  const nowMs = Date.parse("2026-09-02T00:52:20.000Z");
  try {
    const result = await runBaselineJob({
      nowMs: () => nowMs,
      fetch: fakeGroupedFetch({}, fetchCalls),
      polygonApiKey: "test-key",
      rpc: recordingRpc(rpcCalls),
      loadState: async () => ({
        current_generation_id: GEN_PRIOR,
        status: "available",
        period_start: "2025-08-31",
        period_end: "2026-08-31",
        symbol_count: 11_931,
        provider_as_of: "2026-08-31T20:00:01.000Z",
      }),
      loadExceptions: async () => [],
      minSessions: 120,
      lookbackCalendarDays: 366,
      cache: createDailyCache(),
      lastSuccessfulPeriodEnd: "2026-08-31",
      newGenerationId: () => GEN_NEW,
      sleep: instantSleep,
    });

    assertEquals(result.didRebuild, false);
    assertEquals(result.refreshDeferred, true);
    assertEquals(result.errorCode, null);
    assertEquals(result.state.status, "available");
    assertEquals(result.state.period_end, "2026-08-31");
    assertEquals(result.state.symbol_count, 11_931);
    assertEquals(result.state.current_generation_id, GEN_PRIOR);
    assertEquals(result.lastSuccessfulPeriodEnd, "2026-08-31");
    assertEquals(result.desiredPeriodEnd, "2026-09-01");
    assertEquals(fetchCalls.length, 0);
    assertEquals(rpcCalls.length, 0);

    const deferred = lines
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((row) => row?.msg === "baseline_refresh_deferred");
    assertEquals(deferred?.reason, "available_baseline_preserved_for_radar_startup");
    assertEquals(deferred?.current_period_end, "2026-08-31");
    assertEquals(deferred?.desired_period_end, "2026-09-01");
    assertEquals(deferred?.symbol_count, 11_931);
    assertEquals(deferred?.status, "available");
    assertEquals(deferred?.current_generation_id, GEN_PRIOR);
  } finally {
    console.log = original;
  }
});

Deno.test("missing baseline still attempts full replace", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationArgs[] = [];
  const nowMs = Date.parse("2026-08-12T20:00:01.000Z");
  const result = await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({
      "2026-08-10": [{ T: "AAPL", h: 10, l: 5 }],
      "2026-08-11": [{ T: "AAPL", h: 12, l: 4 }],
      "2026-08-12": [{ T: "AAPL", h: 11, l: 6 }],
    }, fetchCalls),
    polygonApiKey: "test-key",
    rpc: recordingRpc(rpcCalls),
    loadState: async () => ({
      current_generation_id: null,
      status: "initializing",
      period_start: null,
      period_end: null,
      symbol_count: 0,
      provider_as_of: null,
    }),
    loadExceptions: async () => [],
    minSessions: 1,
    lookbackCalendarDays: 3,
    cache: createDailyCache(),
    lastSuccessfulPeriodEnd: null,
    newGenerationId: () => GEN_NEW,
    sleep: instantSleep,
  });

  assertEquals(result.didRebuild, true);
  assertEquals(result.refreshDeferred, false);
  assertEquals(result.errorCode, null);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].p_generation_id, GEN_NEW);
  assertEquals(fetchCalls.length > 0, true);
});

Deno.test("empty available-ineligible baseline still attempts replace", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationArgs[] = [];
  const nowMs = Date.parse("2026-08-12T20:00:01.000Z");
  const result = await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({
      "2026-08-10": [{ T: "AAPL", h: 10, l: 5 }],
      "2026-08-11": [{ T: "AAPL", h: 12, l: 4 }],
      "2026-08-12": [{ T: "AAPL", h: 11, l: 6 }],
    }, fetchCalls),
    polygonApiKey: "test-key",
    rpc: recordingRpc(rpcCalls),
    loadState: async () => ({
      current_generation_id: GEN_PRIOR,
      status: "empty",
      period_start: "2025-08-11",
      period_end: "2026-08-11",
      symbol_count: 0,
      provider_as_of: "2026-08-11T20:00:01.000Z",
    }),
    loadExceptions: async () => [],
    minSessions: 1,
    lookbackCalendarDays: 3,
    cache: createDailyCache(),
    lastSuccessfulPeriodEnd: "2026-08-11",
    newGenerationId: () => GEN_NEW,
    sleep: instantSleep,
  });

  assertEquals(result.refreshDeferred, false);
  assertEquals(rpcCalls.length, 1);
  assertEquals(result.didRebuild, true);
});

Deno.test("lease acquire/heartbeat succeed while stale AVAILABLE baseline is preserved", async () => {
  const actions: string[] = [];
  const bridgeFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    actions.push(String(body.action));
    if (body.action === "replace_52w_baseline") {
      return new Response("nope", { status: 502 });
    }
    if (body.action === "get_52w_state") {
      return new Response(
        JSON.stringify({
          ok: true,
          state: {
            current_generation_id: GEN_PRIOR,
            status: "available",
            period_start: "2025-08-31",
            period_end: "2026-08-31",
            symbol_count: 11_931,
            provider_as_of: "2026-08-31T20:00:01.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (body.action === "get_calendar") {
      return new Response(JSON.stringify({ ok: true, rows: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const bridge = createRadarBridge({
    bridgeUrl: "https://example.supabase.co/functions/v1/radar-worker-bridge",
    workerSecret: "bridge-secret-value",
    fetch: bridgeFetch,
    sleep: instantSleep,
  });
  const fetchCalls: FetchCall[] = [];
  assertEquals(await bridge.lease.tryAcquire("radar-holder-1", 15_000), true);
  const result = await runBaselineJob({
    nowMs: () => Date.parse("2026-09-02T00:52:20.000Z"),
    fetch: fakeGroupedFetch({}, fetchCalls),
    polygonApiKey: "test-key",
    rpc: bridge.baselineRpc,
    loadState: bridge.loadState,
    loadExceptions: bridge.loadExceptions,
    minSessions: 120,
    lookbackCalendarDays: 366,
    cache: createDailyCache(),
    lastSuccessfulPeriodEnd: "2026-08-31",
    newGenerationId: () => GEN_NEW,
    sleep: instantSleep,
  });
  assertEquals(await bridge.lease.heartbeat("radar-holder-1", 15_000), true);
  assertEquals(result.refreshDeferred, true);
  assertEquals(result.didRebuild, false);
  assertEquals(result.state.period_end, "2026-08-31");
  assertEquals(fetchCalls.length, 0);
  assertEquals(actions.includes("replace_52w_baseline"), false);
  assertEquals(actions.includes("acquire_lease"), true);
  assertEquals(actions.includes("heartbeat_lease"), true);
});
