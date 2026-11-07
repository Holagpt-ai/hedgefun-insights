/**
 * Batch 215 — staged cron session gate (handler level).
 *
 * Closed sessions: no new generation (no provider snapshot), but expired-job
 * cleanup, stranded-publish reconcile and in-flight resume still run.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleSyncScreenerData } from "./handler.ts";
import { MemorySyncStagingStore } from "../_shared/screeners/sync-staging-memory.ts";
import { emptyChunkArtifacts } from "../_shared/screeners/sync-staging-types.ts";
import type { StagedGenerationJob } from "../_shared/screeners/sync-staging-types.ts";

const SECRET = "test-sync-secret-batch215";

class SpyStore extends MemorySyncStagingStore {
  calls: string[] = [];
  override async abortExpired(nowMs: number): Promise<number> {
    this.calls.push("abortExpired");
    return super.abortExpired(nowMs);
  }
  override async findPostPublishReconcileCandidate(nowMs: number) {
    this.calls.push("reconcileCandidate");
    return super.findPostPublishReconcileCandidate(nowMs);
  }
  override async findResumableJob(nowMs: number) {
    this.calls.push("findResumable");
    return super.findResumableJob(nowMs);
  }
  override async claimWork(params: Parameters<MemorySyncStagingStore["claimWork"]>[0]) {
    this.calls.push(`claim:${params.mode}`);
    return super.claimWork(params);
  }
}

/** Chainable fake PostgREST client; calendar rows configurable, everything else empty. */
function fakeDb(calendar: { data: unknown; error: unknown }) {
  const reads: string[] = [];
  const builder = (table: string) => {
    const result = table === "market_session_calendar" ? calendar : { data: [], error: null };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "order", "limit", "range", "gte", "lte", "is", "not"]) {
      b[m] = () => b;
    }
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
    return b;
  };
  return {
    reads,
    client: {
      from: (table: string) => {
        reads.push(table);
        return builder(table);
      },
      rpc: () => Promise.resolve({ data: null, error: { message: "rpc not stubbed" } }),
    },
  };
}

function run(opts: {
  nowIso: string;
  store: SpyStore;
  calendar?: { data: unknown; error: unknown };
  env?: Record<string, string>;
}) {
  const fetched: string[] = [];
  const db = fakeDb(opts.calendar ?? { data: [], error: null });
  const env: Record<string, string> = {
    SYNC_SECRET: SECRET,
    SCREENER_SYNC_STAGED: "memory",
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    POLYGON_API_KEY: "polygon-test",
    ...(opts.env ?? {}),
  };
  const req = new Request("http://localhost/functions/v1/sync-screener-data", {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const response = handleSyncScreenerData(req, {
    env: (k: string) => env[k],
    fetch: ((url: string | URL | Request) => {
      const u = String(url instanceof Request ? url.url : url);
      fetched.push(u);
      if (u.includes("polygon.io")) return Promise.reject(new Error("provider offline in test"));
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    }) as typeof fetch,
    createClient: () => db.client as never,
    nowIso: () => opts.nowIso,
    nowMs: () => Date.parse(opts.nowIso),
    stagingStore: opts.store,
  } as never);
  return { response, fetched, reads: db.reads };
}

function chunkingJob(nowMs: number, over: Partial<StagedGenerationJob> = {}): StagedGenerationJob {
  return {
    id: "aaaaaaaa-1111-4222-8333-444444444444",
    status: "chunking",
    observation: {
      nowMs: nowMs - 6 * 60_000,
      sessionKind: "after-hours",
      extendedSession: true,
      observationSessionFields: true,
      syncedAt: new Date(nowMs - 6 * 60_000).toISOString(),
      syncRunId: "bbbbbbbb-1111-4222-8333-444444444444",
    },
    allTickers: [],
    gainers: [],
    losers: [],
    chunkSize: 2200,
    nextChunkIndex: 0,
    totalChunks: 1,
    merged: emptyChunkArtifacts(),
    leaseToken: "cccccccc-1111-4222-8333-444444444444",
    leaseExpiresMs: nowMs - 60_000, // expired → resumable
    createdAtMs: nowMs - 6 * 60_000,
    updatedAtMs: nowMs - 5 * 60_000,
    nhlBaselineLoaded: true,
    nhlBaselineSnapshot: null,
    stateVersion: 1,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: null,
    finalizeLeaseExpiresMs: null,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
    ...over,
  };
}

const SATURDAY_NOON = "2026-11-07T17:00:00.000Z";
const FRIDAY_2005 = "2026-11-14T01:05:00.000Z"; // Fri 20:05 EST
const MONDAY_1030 = "2026-11-09T15:30:00.000Z";
const THANKSGIVING_1000 = "2026-11-26T15:00:00.000Z";

Deno.test("Batch 215 gate: Saturday cron skips new generation without touching the provider", async () => {
  const store = new SpyStore();
  const { response, fetched, reads } = run({ nowIso: SATURDAY_NOON, store });
  const res = await response;
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.skipped, true);
  assertEquals(body.reason, "session_closed");
  assertEquals(body.phase, "weekend_closure");
  assertEquals(body.skip_reason, "weekend_closure");
  assertEquals(fetched.filter((u) => u.includes("polygon.io")), [], "no provider snapshot on closed session");
  // Cleanup and recovery still ran before the gate.
  assertEquals(store.calls.slice(0, 3), ["abortExpired", "reconcileCandidate", "findResumable"]);
  assert(reads.includes("market_session_calendar"));
  assert(!reads.includes("screener_52w_baseline_state"), "no generation setup reads on skip");
});

Deno.test("Batch 215 gate: expired jobs are still aborted during a closed session", async () => {
  const store = new SpyStore();
  const nowMs = Date.parse(SATURDAY_NOON);
  // Created long ago (beyond job TTL) → expired by abortExpired, not resumable.
  store.seedJob(chunkingJob(nowMs, { createdAtMs: nowMs - 6 * 3_600_000, updatedAtMs: nowMs - 6 * 3_600_000 }));
  const res = await run({ nowIso: SATURDAY_NOON, store }).response;
  assertEquals((await res.json()).skipped, true);
  const job = await store.getPreflight("aaaaaaaa-1111-4222-8333-444444444444");
  assert(job, "job still present");
  assert(job.status === "aborted" || job.status === "failed", `expired job cleaned up, got ${job.status}`);
});

Deno.test("Batch 215 gate: an in-flight generation crossing into the weekend still resumes", async () => {
  const store = new SpyStore();
  const nowMs = Date.parse(FRIDAY_2005);
  store.seedJob(chunkingJob(nowMs));
  const res = await run({ nowIso: FRIDAY_2005, store }).response;
  const body = await res.json();
  assert(body.reason !== "session_closed", `resume must not be gated: ${JSON.stringify(body)}`);
  assert(store.calls.includes("claim:chunk"), `resume claimed the chunk: ${store.calls.join(",")}`);
});

Deno.test("Batch 215 gate: open session proceeds to the provider snapshot (provider down → 503, not a skip)", async () => {
  const store = new SpyStore();
  const { response, fetched } = run({ nowIso: MONDAY_1030, store });
  const res = await response;
  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "provider_unavailable");
  assert(fetched.some((u) => u.includes("polygon.io")), "provider snapshot attempted during an open session");
});

Deno.test("Batch 215 gate: confirmed holiday skips; unreadable calendar does not skip a weekday", async () => {
  const holidayRows = [{
    session_date: "2026-11-26",
    market_status: "closed",
    regular_open_et: "09:30:00",
    regular_close_et: "16:00:00",
    after_hours_end_et: "20:00:00",
    holiday_name: "Thanksgiving Day",
  }];
  const holiday = await run({ nowIso: THANKSGIVING_1000, store: new SpyStore(), calendar: { data: holidayRows, error: null } }).response;
  const hb = await holiday.json();
  assertEquals(hb.skip_reason, "holiday_closure");
  assertEquals(hb.holiday_name, "Thanksgiving Day");

  const unreadable = run({ nowIso: THANKSGIVING_1000, store: new SpyStore(), calendar: { data: null, error: { message: "permission denied" } } });
  const ur = await unreadable.response;
  assertEquals(ur.status, 503, "fails open to a normal attempt");
  assert(unreadable.fetched.some((u) => u.includes("polygon.io")));
});

Deno.test("Batch 215 gate: activation env alone does not start overnight generations (pipeline not ready)", async () => {
  const store = new SpyStore();
  const { response, fetched } = run({
    nowIso: "2026-11-10T05:00:00.000Z", // Tue 00:00 EST
    store,
    env: {
      STOCKSIST_EQUITY_23X5_OWNER_AUTHORIZED: "true",
      STOCKSIST_EQUITY_23X5_EXCHANGE_EFFECTIVE_DATE: "2026-11-02",
      STOCKSIST_EQUITY_23X5_PROVIDER_OVERNIGHT_CONFIRMED: "true",
    },
  });
  const body = await (await response).json();
  assertEquals(body.phase, "overnight");
  assertEquals(body.trade_date, "2026-11-10");
  assertEquals(body.skip_reason, "overnight_pipeline_not_ready");
  assertEquals(fetched.filter((u) => u.includes("polygon.io")), []);
});

Deno.test("Batch 215 gate: continue/finalize actions are never session-gated", async () => {
  const store = new SpyStore();
  const nowMs = Date.parse(SATURDAY_NOON);
  store.seedJob(chunkingJob(nowMs, { leaseToken: null, leaseExpiresMs: null }));
  const db = fakeDb({ data: [], error: null });
  const req = new Request("http://localhost/functions/v1/sync-screener-data", {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "continue", generation_id: "aaaaaaaa-1111-4222-8333-444444444444" }),
  });
  const env: Record<string, string> = {
    SYNC_SECRET: SECRET,
    SCREENER_SYNC_STAGED: "memory",
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    POLYGON_API_KEY: "polygon-test",
  };
  const res = await handleSyncScreenerData(req, {
    env: (k: string) => env[k],
    fetch: (() => Promise.resolve(new Response("{}", { status: 202 }))) as typeof fetch,
    createClient: () => db.client as never,
    nowIso: () => SATURDAY_NOON,
    nowMs: () => nowMs,
    stagingStore: store,
  } as never);
  const body = await res.json();
  assert(body.reason !== "session_closed");
  assert(!db.reads.includes("market_session_calendar"), "continue path does not consult the session gate");
});
