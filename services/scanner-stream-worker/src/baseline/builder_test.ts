import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createDailyCache, runBaselineJob } from "./builder.ts";
import { lastCompletedRegularSessionDate } from "./dates.ts";
import { groupedUrl } from "./grouped.ts";
import type {
  BaselineState,
  ReplaceGenerationWithExclusionsArgs,
  StagedPublishClient,
} from "./persist.ts";

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

function recordingStaged(
  calls: ReplaceGenerationWithExclusionsArgs[],
  opts?: { failAt?: "start" | "finalize" },
): StagedPublishClient {
  const rows: ReplaceGenerationWithExclusionsArgs["p_rows"] = [];
  const exclusions: ReplaceGenerationWithExclusionsArgs["p_exclusions"] = [];
  let start: {
    p_generation_id: string;
    p_period_start: string;
    p_period_end: string;
    p_provider_as_of: string;
    p_min_sessions: number;
  } | null = null;
  return {
    async start(args) {
      start = {
        p_generation_id: args.p_generation_id,
        p_period_start: args.p_period_start,
        p_period_end: args.p_period_end,
        p_provider_as_of: args.p_provider_as_of,
        p_min_sessions: args.p_min_sessions,
      };
      if (opts?.failAt === "start") {
        return { error: { message: "persist_failed" } };
      }
      return { error: null };
    },
    async appendRows(args) {
      rows.push(...args.p_rows);
      return { error: null };
    },
    async appendExclusions(args) {
      exclusions.push(...args.p_exclusions);
      return { error: null };
    },
    async finalize(args) {
      if (opts?.failAt === "finalize") {
        return { error: { message: "persist_failed" } };
      }
      if (!start) return { error: { message: "persist_failed" } };
      calls.push({
        p_generation_id: args.p_generation_id,
        p_rows: [...rows],
        p_period_start: start.p_period_start,
        p_period_end: start.p_period_end,
        p_provider_as_of: start.p_provider_as_of,
        p_status: rows.length === 0 ? "empty" : "available",
        p_exclusions: [...exclusions],
        p_min_sessions: start.p_min_sessions,
      });
      return { error: null };
    },
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
  const rpcCalls: ReplaceGenerationWithExclusionsArgs[] = [];
  const nowMs = Date.parse("2026-08-12T18:00:00.000Z");
  await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({
      "2026-08-10": [{ T: "AAPL", h: 10, l: 5 }],
      "2026-08-11": [{ T: "AAPL", h: 12, l: 4 }],
      "2026-08-12": [{ T: "AAPL", h: 99, l: 1 }],
    }, fetchCalls),
    polygonApiKey: "test-key",
    publish: recordingStaged(rpcCalls),
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
  assertEquals(rpcCalls[0].p_exclusions, []);
  assertEquals(rpcCalls[0].p_min_sessions, 1);
  for (const call of fetchCalls) {
    assertEquals(call.url.includes("apiKey"), false);
    assertEquals(call.url.includes("adjusted=true"), true);
    assertEquals(new URL(call.url).searchParams.get("adjusted"), "true");
    assertEquals(call.auth, "Bearer test-key");
  }
});

Deno.test("invalid bars are skipped and incomplete history is omitted", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationWithExclusionsArgs[] = [];
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
    publish: recordingStaged(rpcCalls),
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
  const excluded = rpcCalls[0].p_exclusions.map((e) => e.symbol).sort();
  assertEquals(excluded, ["AMD"]);
  assertEquals(rpcCalls[0].p_exclusions[0].sessions_observed, 2);
  assertEquals(rpcCalls[0].p_exclusions[0].min_sessions, 3);
  assertEquals(rpcCalls[0].p_min_sessions, 3);
});

Deno.test("failed provider build retains prior generation and never calls RPC", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationWithExclusionsArgs[] = [];
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
    publish: recordingStaged(rpcCalls),
    loadState: async () => PRIOR_STATE,
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
  const rpcCalls: ReplaceGenerationWithExclusionsArgs[] = [];
  const nowMs = Date.parse("2026-08-12T20:00:01.000Z");
  const result = await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({
      "2026-08-10": [{ T: "AAPL", h: 10, l: 5 }],
      "2026-08-11": [{ T: "AAPL", h: 12, l: 4 }],
      "2026-08-12": [{ T: "AAPL", h: 11, l: 6 }],
    }, fetchCalls),
    polygonApiKey: "test-key",
    publish: recordingStaged(rpcCalls, { failAt: "finalize" }),
    loadState: async () => PRIOR_STATE,
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
  assertEquals(result.lastSuccessfulPeriodEnd, "2026-08-11");
  assertEquals(result.errorCode, "persist_failed");
});

Deno.test("does not rebuild when period_end has not advanced", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationWithExclusionsArgs[] = [];
  const nowMs = Date.parse("2026-08-12T18:00:00.000Z");
  const result = await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({}, fetchCalls),
    polygonApiKey: "test-key",
    publish: recordingStaged(rpcCalls),
    loadState: async () => ({
      ...PRIOR_STATE,
      period_end: "2026-08-11",
      policy_min_sessions: 1,
      policy_excluded_count: 0,
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
  assertEquals(fetchCalls.length, 0);
  assertEquals(rpcCalls.length, 0);
  assertEquals(result.state.current_generation_id, GEN_PRIOR);
});

Deno.test("mismatched policy_min_sessions rebuilds instead of skipping", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationWithExclusionsArgs[] = [];
  const nowMs = Date.parse("2026-08-12T18:00:00.000Z");
  const result = await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({
      "2026-08-10": [{ T: "AAPL", h: 10, l: 5 }],
      "2026-08-11": [{ T: "AAPL", h: 12, l: 4 }],
    }, fetchCalls),
    polygonApiKey: "test-key",
    publish: recordingStaged(rpcCalls),
    loadState: async () => ({
      ...PRIOR_STATE,
      period_end: "2026-08-11",
      policy_min_sessions: 120,
      policy_excluded_count: 0,
    }),
    loadExceptions: async () => [],
    minSessions: 1,
    lookbackCalendarDays: 3,
    cache: createDailyCache(),
    lastSuccessfulPeriodEnd: "2026-08-11",
    newGenerationId: () => GEN_NEW,
    sleep: instantSleep,
  });

  assertEquals(result.didRebuild, true);
  assertEquals(rpcCalls.length, 1);
  assertEquals(result.state.policy_min_sessions, 1);
});

Deno.test("current period without policy evidence rebuilds exclusion-aware generation", async () => {
  const fetchCalls: FetchCall[] = [];
  const rpcCalls: ReplaceGenerationWithExclusionsArgs[] = [];
  const nowMs = Date.parse("2026-08-12T18:00:00.000Z");
  const result = await runBaselineJob({
    nowMs: () => nowMs,
    fetch: fakeGroupedFetch({
      "2026-08-10": [{ T: "AAPL", h: 10, l: 5 }],
      "2026-08-11": [{ T: "AAPL", h: 12, l: 4 }],
    }, fetchCalls),
    polygonApiKey: "test-key",
    publish: recordingStaged(rpcCalls),
    loadState: async () => ({
      ...PRIOR_STATE,
      period_end: "2026-08-11",
      policy_min_sessions: null,
      policy_excluded_count: null,
    }),
    loadExceptions: async () => [],
    minSessions: 1,
    lookbackCalendarDays: 3,
    cache: createDailyCache(),
    lastSuccessfulPeriodEnd: "2026-08-11",
    newGenerationId: () => GEN_NEW,
    sleep: instantSleep,
  });

  assertEquals(result.didRebuild, true);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].p_generation_id, GEN_NEW);
  assertEquals(result.state.policy_min_sessions, 1);
  assertEquals(result.state.policy_excluded_count, 0);
  assertEquals(Array.isArray(rpcCalls[0].p_exclusions), true);
});
