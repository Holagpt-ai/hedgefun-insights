import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyBaselineDay,
  publishableBaselineRows,
  type StagingRow,
} from "../_shared/screeners/baseline-accumulate.ts";
import {
  APPLY_DAY_RPC,
  type BaselineSyncDeps,
  type DbClient,
  type DbQuery,
  type DbSelectResult,
  FINALIZE_JOB_RPC,
  handleSyncScreener52wBaselines,
  START_JOB_RPC,
} from "./handler.ts";

const SYNC_SECRET = "test-sync-secret";
const SERVICE_ROLE = "test-service-role-key";
const POLY_KEY = "poly-test-key";
const GEN = "11111111-2222-3333-4444-555555555555";
const PRIOR_GEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const FIXED_ISO = "2026-08-12T20:00:01.000Z";
const AFTER_CLOSE_MS = Date.parse(FIXED_ISO);
const DURING_SESSION_MS = Date.parse("2026-08-12T18:00:00.000Z");

type RpcCall = { fn: string; args: Record<string, unknown> };
type FetchCall = { url: string; auth: string | null };

type PublishedState = {
  status: string;
  period_end: string | null;
  current_generation_id: string | null;
};

type JobRow = {
  generation_id: string;
  period_start: string;
  period_end: string;
  status: "running" | "idle";
  last_applied_date: string | null;
  dates_total: number;
  dates_applied: number;
};

function thenableQuery(
  execute: () => Promise<DbSelectResult>,
): DbQuery {
  const builder: DbQuery = {
    eq: (_col: string, _value: string) => builder,
    limit: (_n: number) => builder,
    then: (
      onFulfilled?: ((value: DbSelectResult) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => execute().then(onFulfilled ?? undefined, onRejected ?? undefined),
  };
  return builder;
}

function groupedResponse(
  rows: Array<{ T: string; h: number; l: number }>,
): Response {
  return new Response(
    JSON.stringify({ status: "OK", resultsCount: rows.length, results: rows }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function fakeGroupedFetch(
  days: Record<string, Array<{ T: string; h: number; l: number }>>,
  calls: FetchCall[],
  opts: { failDates?: Set<string> } = {},
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
      return new Response("nope", { status: 500 });
    }
    return groupedResponse(days[date] ?? []);
  };
}

class FakeBaselineDb {
  published: PublishedState;
  job: JobRow | null = null;
  staging = new Map<string, StagingRow>();
  processed = new Set<string>();
  rpcCalls: RpcCall[] = [];
  finalizeError: { message: string } | null = null;

  constructor(published?: PublishedState) {
    this.published = published ?? {
      status: "initializing",
      period_end: null,
      current_generation_id: null,
    };
  }

  client(): DbClient {
    return {
      from: (table: string) => ({
        select: (_cols: string) => {
          const execute = async (): Promise<DbSelectResult> => {
            if (table === "market_session_calendar") {
              return { data: [], error: null };
            }
            if (table === "screener_52w_baseline_state") {
              return { data: [this.published], error: null };
            }
            if (table === "screener_52w_baseline_job") {
              return {
                data: this.job ? [this.job] : [],
                error: null,
              };
            }
            return { data: [], error: null };
          };
          return thenableQuery(execute);
        },
      }),
      rpc: async (fn, args) => {
        this.rpcCalls.push({ fn, args });
        if (fn === START_JOB_RPC) {
          const periodStart = String(args.p_period_start);
          const periodEnd = String(args.p_period_end);
          if (
            this.job &&
            this.job.status === "running" &&
            this.job.period_start === periodStart &&
            this.job.period_end === periodEnd
          ) {
            return {
              data: { ...this.job, resumed: true },
              error: null,
            };
          }
          this.staging = new Map();
          this.processed = new Set();
          this.job = {
            generation_id: String(args.p_generation_id),
            period_start: periodStart,
            period_end: periodEnd,
            status: "running",
            last_applied_date: null,
            dates_total: Number(args.p_dates_total),
            dates_applied: 0,
          };
          return { data: { ...this.job, resumed: false }, error: null };
        }
        if (fn === APPLY_DAY_RPC) {
          if (!this.job) {
            return { data: null, error: { message: "job missing" } };
          }
          const date = String(args.p_session_date);
          const bars = Array.isArray(args.p_bars) ? args.p_bars : [];
          const result = applyBaselineDay(
            this.staging,
            this.processed,
            date,
            bars as unknown[],
          );
          if (result.applied) {
            this.job.last_applied_date = date;
            this.job.dates_applied += 1;
          }
          return {
            data: {
              skipped: result.skipped,
              dates_applied: this.job.dates_applied,
              last_applied_date: this.job.last_applied_date,
            },
            error: null,
          };
        }
        if (fn === FINALIZE_JOB_RPC) {
          if (this.finalizeError) {
            return { data: null, error: this.finalizeError };
          }
          if (!this.job) {
            return { data: null, error: { message: "job missing" } };
          }
          const minSessions = Number(args.p_min_sessions);
          const rows = publishableBaselineRows(
            this.staging,
            minSessions,
            this.job.period_start,
            this.job.period_end,
            String(args.p_provider_as_of),
          );
          const status = rows.length === 0 ? "empty" : "available";
          this.published = {
            status,
            period_end: this.job.period_end,
            current_generation_id: this.job.generation_id,
          };
          this.job.status = "idle";
          return {
            data: {
              published: true,
              symbol_count: rows.length,
              status,
              symbols: rows.map((r) => r.symbol),
            },
            error: null,
          };
        }
        return { data: null, error: { message: "unknown rpc" } };
      },
    };
  }
}

function baseEnv(): BaselineSyncDeps["env"] {
  const map: Record<string, string> = {
    SYNC_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
    SUPABASE_URL: "https://example.supabase.co",
    POLYGON_API_KEY: POLY_KEY,
  };
  return (k) => map[k];
}

function post(): Request {
  return new Request(
    "https://example.supabase.co/functions/v1/sync-screener-52w-baselines",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    },
  );
}

function makeDeps(
  db: FakeBaselineDb,
  fetchImpl: BaselineSyncDeps["fetch"],
  extra: Partial<BaselineSyncDeps> = {},
): BaselineSyncDeps {
  return {
    env: baseEnv(),
    fetch: fetchImpl,
    createClient: () => db.client(),
    nowIso: () => FIXED_ISO,
    nowMs: () => AFTER_CLOSE_MS,
    newGenerationId: () => GEN,
    datesPerInvocation: 2,
    lookbackCalendarDays: 3,
    minSessions: 2,
    ...extra,
  };
}

const SAMPLE_DAYS: Record<string, Array<{ T: string; h: number; l: number }>> =
  {
    "2026-08-10": [
      { T: "AAA", h: 10, l: 5 },
      { T: "SHORT", h: 8, l: 4 },
      { T: "BAD", h: 0, l: 1 },
    ],
    "2026-08-11": [{ T: "AAA", h: 12, l: 4 }],
    "2026-08-12": [{ T: "AAA", h: 11, l: 6 }],
  };

Deno.test("baseline batches resume instead of restarting", async () => {
  const db = new FakeBaselineDb();
  const calls: FetchCall[] = [];
  const fetchImpl = fakeGroupedFetch(SAMPLE_DAYS, calls);
  const first = await handleSyncScreener52wBaselines(
    post(),
    makeDeps(db, fetchImpl),
  );
  assertEquals(first.status, 200);
  const firstBody = await first.json();
  assertEquals(firstBody.status, "running");
  assertEquals(db.job?.dates_applied, 2);
  const firstDates = calls.map((c) =>
    c.url.match(/stocks\/(\d{4}-\d{2}-\d{2})/)?.[1]
  );
  assertEquals(firstDates, ["2026-08-10", "2026-08-11"]);

  const secondCalls: FetchCall[] = [];
  const second = await handleSyncScreener52wBaselines(
    post(),
    makeDeps(db, fakeGroupedFetch(SAMPLE_DAYS, secondCalls)),
  );
  const secondBody = await second.json();
  assertEquals(second.status, 200);
  assertEquals(secondBody.status, "available");
  const secondDates = secondCalls.map((c) =>
    c.url.match(/stocks\/(\d{4}-\d{2}-\d{2})/)?.[1]
  );
  assertEquals(secondDates, ["2026-08-12"]);
  assertEquals(
    db.rpcCalls.filter((c) => c.fn === START_JOB_RPC).length,
    1,
  );
});

Deno.test("repeated date processing is idempotent at the RPC boundary", async () => {
  const db = new FakeBaselineDb();
  db.job = {
    generation_id: GEN,
    period_start: "2026-08-10",
    period_end: "2026-08-12",
    status: "running",
    last_applied_date: null,
    dates_total: 3,
    dates_applied: 0,
  };
  const bars = [{ symbol: "AAA", h: 10, l: 5 }];
  await db.client().rpc(APPLY_DAY_RPC, {
    p_generation_id: GEN,
    p_session_date: "2026-08-10",
    p_bars: bars,
    p_provider_as_of: FIXED_ISO,
  });
  await db.client().rpc(APPLY_DAY_RPC, {
    p_generation_id: GEN,
    p_session_date: "2026-08-10",
    p_bars: [{ symbol: "AAA", h: 99, l: 1 }],
    p_provider_as_of: FIXED_ISO,
  });
  assertEquals(db.staging.get("AAA")?.high_52w, 10);
  assertEquals(db.staging.get("AAA")?.sessions_observed, 1);
  assertEquals(db.job.dates_applied, 1);
});

Deno.test("current session is excluded from grouped fetches", async () => {
  const db = new FakeBaselineDb();
  const calls: FetchCall[] = [];
  const res = await handleSyncScreener52wBaselines(
    post(),
    makeDeps(db, fakeGroupedFetch(SAMPLE_DAYS, calls), {
      nowMs: () => DURING_SESSION_MS,
      datesPerInvocation: 10,
    }),
  );
  assertEquals(res.status, 200);
  const dates = calls.map((c) =>
    c.url.match(/stocks\/(\d{4}-\d{2}-\d{2})/)?.[1]
  );
  assertEquals(dates.includes("2026-08-12"), false);
  for (const call of calls) {
    assertEquals(call.url.includes("apiKey"), false);
    assertEquals(call.auth, `Bearer ${POLY_KEY}`);
  }
});

Deno.test("incomplete history is omitted on atomic publish", async () => {
  const db = new FakeBaselineDb();
  const calls: FetchCall[] = [];
  await handleSyncScreener52wBaselines(
    post(),
    makeDeps(db, fakeGroupedFetch(SAMPLE_DAYS, calls), {
      datesPerInvocation: 10,
    }),
  );
  const finalize = db.rpcCalls.find((c) => c.fn === FINALIZE_JOB_RPC);
  assertEquals(!!finalize, true);
  const published = db.rpcCalls[db.rpcCalls.length - 1];
  void published;
  assertEquals(db.published.status, "available");
  assertEquals(db.published.current_generation_id, GEN);
  const rows = publishableBaselineRows(
    db.staging,
    2,
    "2026-08-10",
    "2026-08-12",
    FIXED_ISO,
  );
  assertEquals(rows.map((r) => r.symbol), ["AAA"]);
});

Deno.test("failed batches retain the previous generation", async () => {
  const db = new FakeBaselineDb({
    status: "available",
    period_end: "2026-08-11",
    current_generation_id: PRIOR_GEN,
  });
  const calls: FetchCall[] = [];
  const res = await handleSyncScreener52wBaselines(
    post(),
    makeDeps(
      db,
      fakeGroupedFetch(SAMPLE_DAYS, calls, {
        failDates: new Set(["2026-08-10"]),
      }),
    ),
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "provider_unavailable");
  assertEquals(db.published.current_generation_id, PRIOR_GEN);
  assertEquals(db.published.status, "available");
  assertEquals(
    db.rpcCalls.some((c) => c.fn === FINALIZE_JOB_RPC),
    false,
  );
  assertEquals(body.error.includes(POLY_KEY), false);
});

Deno.test("complete validation atomically publishes", async () => {
  const db = new FakeBaselineDb({
    status: "available",
    period_end: "2026-08-11",
    current_generation_id: PRIOR_GEN,
  });
  const calls: FetchCall[] = [];
  const res = await handleSyncScreener52wBaselines(
    post(),
    makeDeps(db, fakeGroupedFetch(SAMPLE_DAYS, calls), {
      datesPerInvocation: 10,
    }),
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.status, "available");
  assertEquals(body.generation_id, GEN);
  assertEquals(db.published.current_generation_id, GEN);
  assertEquals(db.published.period_end, "2026-08-12");
  assertEquals(
    db.rpcCalls.filter((c) => c.fn === FINALIZE_JOB_RPC).length,
    1,
  );
});

Deno.test("finalize failure retains the previous generation", async () => {
  const db = new FakeBaselineDb({
    status: "available",
    period_end: "2026-08-11",
    current_generation_id: PRIOR_GEN,
  });
  db.finalizeError = { message: "boom" };
  const res = await handleSyncScreener52wBaselines(
    post(),
    makeDeps(db, fakeGroupedFetch(SAMPLE_DAYS, []), {
      datesPerInvocation: 10,
    }),
  );
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "persist_failed");
  assertEquals(db.published.current_generation_id, PRIOR_GEN);
});

Deno.test("missing auth does not fetch or persist", async () => {
  const db = new FakeBaselineDb();
  const calls: FetchCall[] = [];
  const res = await handleSyncScreener52wBaselines(
    new Request(
      "https://example.supabase.co/functions/v1/sync-screener-52w-baselines",
      { method: "POST" },
    ),
    makeDeps(db, fakeGroupedFetch(SAMPLE_DAYS, calls)),
  );
  assertEquals(res.status, 403);
  assertEquals(calls.length, 0);
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("current published baseline is a no-op", async () => {
  const db = new FakeBaselineDb({
    status: "available",
    period_end: "2026-08-12",
    current_generation_id: GEN,
  });
  const calls: FetchCall[] = [];
  const res = await handleSyncScreener52wBaselines(
    post(),
    makeDeps(db, fakeGroupedFetch(SAMPLE_DAYS, calls)),
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.status, "current");
  assertEquals(body.generation_id, GEN);
  assertEquals(calls.length, 0);
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("period mismatch starts a new generation and clears prior staging", async () => {
  const db = new FakeBaselineDb({
    status: "available",
    period_end: "2026-08-11",
    current_generation_id: PRIOR_GEN,
  });
  db.job = {
    generation_id: PRIOR_GEN,
    period_start: "2026-08-09",
    period_end: "2026-08-11",
    status: "running",
    last_applied_date: "2026-08-10",
    dates_total: 3,
    dates_applied: 2,
  };
  db.staging.set("OLD", {
    symbol: "OLD",
    high_52w: 9,
    low_52w: 1,
    high_date: "2026-08-10",
    low_date: "2026-08-10",
    sessions_observed: 1,
  });
  db.processed.add("2026-08-10");
  const calls: FetchCall[] = [];
  const res = await handleSyncScreener52wBaselines(
    post(),
    makeDeps(db, fakeGroupedFetch(SAMPLE_DAYS, calls)),
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.status, "running");
  assertEquals(db.job.generation_id, GEN);
  assertEquals(db.job.dates_applied, 2);
  assertEquals(db.job.last_applied_date, "2026-08-11");
  assertEquals(db.staging.has("OLD"), false);
  assertEquals(
    db.rpcCalls.filter((c) => c.fn === START_JOB_RPC).length,
    1,
  );
  assertEquals(
    db.rpcCalls.find((c) => c.fn === START_JOB_RPC)?.args.p_generation_id,
    GEN,
  );
});

Deno.test("matching current-period job resumes without starting a new generation", async () => {
  const db = new FakeBaselineDb({
    status: "initializing",
    period_end: null,
    current_generation_id: null,
  });
  db.job = {
    generation_id: GEN,
    period_start: "2026-08-10",
    period_end: "2026-08-12",
    status: "running",
    last_applied_date: "2026-08-10",
    dates_total: 3,
    dates_applied: 1,
  };
  const calls: FetchCall[] = [];
  const res = await handleSyncScreener52wBaselines(
    post(),
    makeDeps(db, fakeGroupedFetch(SAMPLE_DAYS, calls), {
      datesPerInvocation: 1,
    }),
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.status, "running");
  assertEquals(body.generation_id, GEN);
  assertEquals(db.job.dates_applied, 2);
  assertEquals(
    db.rpcCalls.filter((c) => c.fn === START_JOB_RPC).length,
    0,
  );
  assertEquals(
    db.rpcCalls.filter((c) => c.fn === FINALIZE_JOB_RPC).length,
    0,
  );
});
