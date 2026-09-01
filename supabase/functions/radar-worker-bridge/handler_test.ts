import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeRadarWorker } from "./auth.ts";
import {
  ACQUIRE_LEASE_RPC,
  BASELINE_STATE_TABLE,
  CALENDAR_TABLE,
  HEARTBEAT_LEASE_RPC,
  REPLACE_52W_RPC,
  REPLACE_RADAR_RPC,
  REPLACE_RADAR_V2_RPC,
  RELEASE_LEASE_RPC,
  SET_RADAR_STATUS_RPC,
  type BridgeDeps,
  type DbClient,
  type DbQuery,
  type DbSelectResult,
  handleRadarWorkerBridge,
} from "./handler.ts";

const WORKER_SECRET = "test-radar-worker-secret";
const SERVICE_ROLE = "test-service-role-key";
const SUPABASE_URL = "https://example.supabase.co";
const HOLDER = "radar-holder-1";

type RpcCall = { fn: string; args: Record<string, unknown> };
type SelectCall = { table: string; cols: string; eq?: [string, string] };

function env(overrides: Record<string, string | undefined> = {}) {
  return (k: string) => {
    if (k in overrides) return overrides[k];
    if (k === "RADAR_WORKER_SECRET") return WORKER_SECRET;
    if (k === "SUPABASE_URL") return SUPABASE_URL;
    if (k === "SUPABASE_SERVICE_ROLE_KEY") return SERVICE_ROLE;
    return undefined;
  };
}

class FakeDb implements DbClient {
  rpcCalls: RpcCall[] = [];
  selectCalls: SelectCall[] = [];
  rpcImpl: (fn: string, args: Record<string, unknown>) => {
    data: unknown;
    error: { message: string } | null;
  } = (_fn, _args) => ({ data: true, error: null });
  calendarRows: Array<Record<string, unknown>> = [];
  stateRows: Array<Record<string, unknown>> = [];
  selectError: { message: string } | null = null;

  from(table: string) {
    return {
      select: (cols: string): DbQuery => {
        const call: SelectCall = { table, cols };
        this.selectCalls.push(call);
        const self = this;
        const builder: DbQuery = {
          eq(col: string, value: string) {
            call.eq = [col, value];
            return builder;
          },
          limit(_n: number) {
            return builder;
          },
          then(onFulfilled, onRejected) {
            const rows = table === CALENDAR_TABLE
              ? self.calendarRows
              : table === BASELINE_STATE_TABLE
              ? self.stateRows
              : [];
            return Promise.resolve({
              data: self.selectError ? null : rows,
              error: self.selectError,
            } satisfies DbSelectResult).then(
              onFulfilled ?? undefined,
              onRejected ?? undefined,
            );
          },
        };
        return builder;
      },
    };
  }

  rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    return Promise.resolve(this.rpcImpl(fn, args));
  }
}

function deps(db: FakeDb, envFn = env()): BridgeDeps {
  return {
    env: envFn,
    createClient: () => db,
  };
}

function post(
  body: unknown,
  headers: Record<string, string> = {
    Authorization: `Bearer ${WORKER_SECRET}`,
  },
): Request {
  return new Request("https://example.test/radar-worker-bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readJson(
  res: Response,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

Deno.test("auth: valid RADAR_WORKER_SECRET Bearer succeeds", async () => {
  const r = await authorizeRadarWorker(
    `Bearer ${WORKER_SECRET}`,
    env(),
  );
  assertEquals(r.ok, true);
});

Deno.test("auth: missing token rejected 401", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(post({ action: "get_calendar" }, {}), deps(db));
  const out = await readJson(res);
  assertEquals(out.status, 401);
  assertEquals(out.body.error, "unauthorized");
  assertEquals(db.rpcCalls.length, 0);
  assertEquals(db.selectCalls.length, 0);
});

Deno.test("auth: wrong token rejected 401", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({ action: "get_calendar" }, { Authorization: "Bearer wrong" }),
    deps(db),
  );
  const out = await readJson(res);
  assertEquals(out.status, 401);
  assertEquals(out.body.error, "unauthorized");
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("auth: missing configured secret fails closed 401", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({ action: "get_calendar" }),
    deps(db, env({ RADAR_WORKER_SECRET: undefined })),
  );
  const out = await readJson(res);
  assertEquals(out.status, 401);
  assertEquals(out.body.error, "unauthorized");
});

Deno.test("auth: service-role key rejected as invocation token", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({ action: "get_calendar" }, { Authorization: `Bearer ${SERVICE_ROLE}` }),
    deps(db),
  );
  const out = await readJson(res);
  assertEquals(out.status, 401);
  assertEquals(out.body.error, "unauthorized");
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("auth: close-but-wrong token does not leak configured secret", async () => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const db = new FakeDb();
    const res = await handleRadarWorkerBridge(
      post({ action: "get_calendar" }, {
        Authorization: `Bearer ${WORKER_SECRET}x`,
      }),
      deps(db),
    );
    const out = await readJson(res);
    assertEquals(out.status, 401);
    assertEquals(out.body.error, "unauthorized");
    const dumped = JSON.stringify(out.body) + logs.join("");
    assertEquals(dumped.includes(WORKER_SECRET), false);
  } finally {
    console.error = original;
  }
});

Deno.test("action: acquire_lease maps to hardcoded lease RPC", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({ action: "acquire_lease", holder_id: HOLDER, ttl_ms: 15_000 }),
    deps(db),
  );
  const out = await readJson(res);
  assertEquals(out.status, 200);
  assertEquals(out.body.ok, true);
  assertEquals(out.body.result, true);
  assertEquals(db.rpcCalls.map((c) => c.fn), [ACQUIRE_LEASE_RPC]);
  assertEquals(db.rpcCalls[0].args.p_holder_id, HOLDER);
  assertEquals(db.rpcCalls[0].args.p_ttl_ms, 15_000);
  assertEquals(db.rpcCalls[0].args.p_lease_key, "radar_v22");
});

Deno.test("action: heartbeat_lease maps to hardcoded heartbeat RPC", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({ action: "heartbeat_lease", holder_id: HOLDER, ttl_ms: 15_000 }),
    deps(db),
  );
  assertEquals(res.status, 200);
  assertEquals(db.rpcCalls.map((c) => c.fn), [HEARTBEAT_LEASE_RPC]);
});

Deno.test("action: release_lease maps to hardcoded release RPC", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({ action: "release_lease", holder_id: HOLDER }),
    deps(db),
  );
  assertEquals(res.status, 200);
  assertEquals(db.rpcCalls.map((c) => c.fn), [RELEASE_LEASE_RPC]);
});

Deno.test("action: get_calendar reads hardcoded calendar table", async () => {
  const db = new FakeDb();
  db.calendarRows = [{
    session_date: "2026-08-10",
    market_status: "early_close",
    regular_open_et: "09:30:00",
    regular_close_et: "13:00:00",
    after_hours_end_et: "17:00:00",
    holiday_name: "Test",
  }];
  const res = await handleRadarWorkerBridge(post({ action: "get_calendar" }), deps(db));
  const out = await readJson(res);
  assertEquals(out.status, 200);
  assertEquals(out.body.ok, true);
  assertEquals(db.selectCalls.map((c) => c.table), [CALENDAR_TABLE]);
  assertEquals(Array.isArray(out.body.rows), true);
});

Deno.test("action: publish_generation maps to hardcoded radar replace RPC", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({
      action: "publish_generation",
      p_generation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      p_rows: [],
      p_archive: [],
      p_session_date: "2026-08-10",
      p_synced_at: "2026-08-10T14:00:05.000Z",
      p_status: "empty",
      p_last_provider_event_at: null,
    }),
    deps(db),
  );
  assertEquals(res.status, 200);
  assertEquals(db.rpcCalls.map((c) => c.fn), [REPLACE_RADAR_RPC]);
});

Deno.test("action: publish_candidates_v2 maps to Persistence V2 RPC", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({
      action: "publish_candidates_v2",
      p_generation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      p_trading_date: "2026-08-10",
      p_session_kind: "market",
      p_synced_at: "2026-08-10T14:00:05.000Z",
      p_candidates: [],
      p_events: [],
      p_sentinel_enabled: true,
      p_last_provider_event_at: null,
      p_last_receive_at: null,
    }),
    deps(db),
  );
  const out = await readJson(res);
  assertEquals(out.status, 200);
  assertEquals(out.body.ok, true);
  assertEquals(db.rpcCalls.map((c) => c.fn), [REPLACE_RADAR_V2_RPC]);
  assertEquals(db.rpcCalls[0].args.p_session_kind, "market");
});

Deno.test("action: publish_candidates_v2 rejects invalid worker secret", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({
      action: "publish_candidates_v2",
      p_generation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      p_trading_date: "2026-08-10",
      p_session_kind: "market",
      p_synced_at: "2026-08-10T14:00:05.000Z",
      p_candidates: [],
      p_events: [],
    }, { Authorization: "Bearer wrong" }),
    deps(db),
  );
  const out = await readJson(res);
  assertEquals(out.status, 401);
  assertEquals(out.body.error, "unauthorized");
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("action: set_feed_status maps to hardcoded status RPC", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({
      action: "set_feed_status",
      p_status: "stale",
      p_last_provider_event_at: null,
      p_synced_at: "2026-08-10T14:00:05.000Z",
    }),
    deps(db),
  );
  assertEquals(res.status, 200);
  assertEquals(db.rpcCalls.map((c) => c.fn), [SET_RADAR_STATUS_RPC]);
});

Deno.test("action: replace_52w_baseline maps to hardcoded 52w RPC", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({
      action: "replace_52w_baseline",
      p_generation_id: "11111111-2222-3333-4444-555555555555",
      p_rows: [],
      p_period_start: "2025-08-10",
      p_period_end: "2026-08-10",
      p_provider_as_of: "2026-08-10T20:00:00.000Z",
      p_status: "empty",
    }),
    deps(db),
  );
  assertEquals(res.status, 200);
  assertEquals(db.rpcCalls.map((c) => c.fn), [REPLACE_52W_RPC]);
});

Deno.test("action: get_52w_state reads hardcoded baseline state table", async () => {
  const db = new FakeDb();
  db.stateRows = [{
    current_generation_id: "11111111-2222-3333-4444-555555555555",
    status: "available",
    period_start: "2025-08-10",
    period_end: "2026-08-10",
    symbol_count: 10,
    provider_as_of: "2026-08-10T20:00:00.000Z",
  }];
  const res = await handleRadarWorkerBridge(post({ action: "get_52w_state" }), deps(db));
  const out = await readJson(res);
  assertEquals(out.status, 200);
  assertEquals(out.body.ok, true);
  assertEquals(db.selectCalls.map((c) => c.table), [BASELINE_STATE_TABLE]);
  assertEquals(db.selectCalls[0].eq, ["state_key", "current"]);
});

Deno.test("unknown action rejected and does not call DB", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({ action: "drop_table" }),
    deps(db),
  );
  const out = await readJson(res);
  assertEquals(out.status, 400);
  assertEquals(out.body.error, "unknown_action");
  assertEquals(db.rpcCalls.length, 0);
  assertEquals(db.selectCalls.length, 0);
});

Deno.test("RPC name in body is ignored; only hardcoded action runs", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    post({
      action: "acquire_lease",
      holder_id: HOLDER,
      ttl_ms: 15_000,
      rpc: "delete_from_users",
      table: "auth.users",
    }),
    deps(db),
  );
  assertEquals(res.status, 200);
  assertEquals(db.rpcCalls.map((c) => c.fn), [ACQUIRE_LEASE_RPC]);
  assertEquals(db.selectCalls.length, 0);
});

Deno.test("GET is rejected", async () => {
  const db = new FakeDb();
  const res = await handleRadarWorkerBridge(
    new Request("https://example.test/radar-worker-bridge", { method: "GET" }),
    deps(db),
  );
  assertEquals(res.status, 405);
});

Deno.test("database RPC failure returns persist_failed without secrets", async () => {
  const db = new FakeDb();
  db.rpcImpl = () => ({ data: null, error: { message: "boom" } });
  const res = await handleRadarWorkerBridge(
    post({ action: "acquire_lease", holder_id: HOLDER, ttl_ms: 15_000 }),
    deps(db),
  );
  const out = await readJson(res);
  assertEquals(out.status, 502);
  assertEquals(out.body.error, "persist_failed");
  const dumped = JSON.stringify(out.body);
  assertEquals(dumped.includes(WORKER_SECRET), false);
  assertEquals(dumped.includes(SERVICE_ROLE), false);
});

Deno.test("edge logs request_id, action, received, rpc stages, and final status", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (msg?: unknown) => {
    lines.push(String(msg ?? ""));
  };
  try {
    const db = new FakeDb();
    const requestId = "req-edge-telemetry-1";
    const res = await handleRadarWorkerBridge(
      post({
        action: "acquire_lease",
        holder_id: HOLDER,
        ttl_ms: 15_000,
        request_id: requestId,
      }),
      deps(db),
    );
    assertEquals(res.status, 200);
    const logs = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    assertEquals(logs[0].msg, "radar_bridge_received");
    assertEquals(logs[0].request_id, requestId);
    assertEquals(logs[0].action, "acquire_lease");
    assertEquals(logs[0].received, true);
    assertEquals(logs[1].msg, "radar_bridge_rpc_started");
    assertEquals(logs[1].rpc_name, ACQUIRE_LEASE_RPC);
    assertEquals(logs[2].msg, "radar_bridge_rpc_completed");
    assertEquals(typeof logs[2].rpc_elapsed_ms, "number");
    assertEquals(logs[3].msg, "radar_bridge_complete");
    assertEquals(logs[3].http_status, 200);
    assertEquals(typeof logs[3].elapsed_ms, "number");
    const dumped = lines.join("\n");
    assertEquals(dumped.includes(WORKER_SECRET), false);
    assertEquals(dumped.includes(SERVICE_ROLE), false);
    assertEquals(dumped.includes(HOLDER), false);
  } finally {
    console.log = original;
  }
});

Deno.test("edge RPC error logs rpc_error without payload contents", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (msg?: unknown) => {
    lines.push(String(msg ?? ""));
  };
  try {
    const db = new FakeDb();
    db.rpcImpl = () => ({ data: null, error: { message: "boom" } });
    const res = await handleRadarWorkerBridge(
      post({
        action: "replace_52w_baseline",
        request_id: "req-rpc-error-1",
        p_generation_id: "11111111-2222-3333-4444-555555555555",
        p_rows: [{ symbol: "AAA", high_52w: 10 }],
        p_period_start: "2025-08-10",
        p_period_end: "2026-08-10",
        p_provider_as_of: "2026-08-10T20:00:00.000Z",
        p_status: "empty",
      }),
      deps(db),
    );
    assertEquals(res.status, 502);
    const logs = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    assertEquals(logs.some((row) => row.msg === "radar_bridge_received"), true);
    assertEquals(logs.some((row) => row.msg === "radar_bridge_rpc_started"), true);
    assertEquals(logs.some((row) => row.msg === "radar_bridge_rpc_error"), true);
    const complete = logs.find((row) => row.msg === "radar_bridge_complete");
    assertEquals(complete?.http_status, 502);
    assertEquals(complete?.action, "replace_52w_baseline");
    const dumped = lines.join("\n");
    assertEquals(dumped.includes("AAA"), false);
    assertEquals(dumped.includes("high_52w"), false);
    assertEquals(dumped.includes(WORKER_SECRET), false);
  } finally {
    console.log = original;
  }
});
