import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createRadarBridge } from "./bridge.ts";
import { log, sanitizeLogValue } from "./log.ts";
import type { FetchLike } from "./baseline/grouped.ts";

const BRIDGE_URL = "https://example.supabase.co/functions/v1/radar-worker-bridge";
const SECRET = "bridge-secret-value";
const HOLDER = "radar-holder-1";

type Captured = {
  url: string;
  method: string | undefined;
  auth: string | null;
  body: Record<string, unknown>;
};

function headerAuth(init?: RequestInit): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get("Authorization");
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === "authorization");
    return found?.[1] ?? null;
  }
  const rec = headers as Record<string, string>;
  return rec.Authorization ?? rec.authorization ?? null;
}

function capturingFetch(
  calls: Captured[],
  impl: (req: Captured) => Response | Promise<Response>,
): FetchLike {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const captured: Captured = {
      url,
      method: init?.method,
      auth: headerAuth(init),
      body,
    };
    calls.push(captured);
    return await impl(captured);
  };
}

function ok(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.test("bridge acquire_lease formats Bearer auth and hardcoded action", async () => {
  const calls: Captured[] = [];
  const fetchImpl = capturingFetch(calls, () => ok({ ok: true, result: true }));
  const bridge = createRadarBridge({
    bridgeUrl: BRIDGE_URL,
    workerSecret: SECRET,
    fetch: fetchImpl,
  });
  assertEquals(await bridge.lease.tryAcquire(HOLDER, 15_000), true);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, BRIDGE_URL);
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].auth, `Bearer ${SECRET}`);
  assertEquals(calls[0].body.action, "acquire_lease");
  assertEquals(calls[0].body.holder_id, HOLDER);
  assertEquals(calls[0].body.ttl_ms, 15_000);
  assertEquals("rpc" in calls[0].body, false);
  assertEquals("table" in calls[0].body, false);
});

Deno.test("bridge heartbeat and release use allowed actions only", async () => {
  const calls: Captured[] = [];
  const fetchImpl = capturingFetch(calls, (req) => {
    if (req.body.action === "heartbeat_lease") return ok({ ok: true, result: true });
    return ok({ ok: true });
  });
  const bridge = createRadarBridge({
    bridgeUrl: BRIDGE_URL,
    workerSecret: SECRET,
    fetch: fetchImpl,
  });
  assertEquals(await bridge.lease.heartbeat(HOLDER, 15_000), true);
  await bridge.lease.release(HOLDER);
  assertEquals(calls.map((c) => c.body.action), [
    "heartbeat_lease",
    "release_lease",
  ]);
});

Deno.test("bridge 401 auth failure does not throw and does not log the secret", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (msg?: unknown) => {
    lines.push(String(msg ?? ""));
  };
  try {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    const bridge = createRadarBridge({
      bridgeUrl: BRIDGE_URL,
      workerSecret: SECRET,
      fetch: fetchImpl,
    });
    assertEquals(await bridge.lease.tryAcquire(HOLDER, 15_000), false);
    const dumped = lines.join("\n");
    assertEquals(dumped.includes(SECRET), false);
    assertEquals(dumped.includes("Bearer "), false);
  } finally {
    console.log = original;
  }
});

Deno.test("bridge 5xx is retried then returns persist_failed", async () => {
  let attempts = 0;
  const fetchImpl: FetchLike = async () => {
    attempts += 1;
    return new Response("nope", { status: 503 });
  };
  const bridge = createRadarBridge({
    bridgeUrl: BRIDGE_URL,
    workerSecret: SECRET,
    fetch: fetchImpl,
    sleep: async () => {},
  });
  const published = await bridge.radarRpc({
    p_generation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    p_rows: [],
    p_archive: [],
    p_session_date: "2026-08-10",
    p_synced_at: "2026-08-10T14:00:05.000Z",
    p_status: "empty",
    p_last_provider_event_at: null,
  });
  assertEquals(published.error?.message, "persist_failed");
  assertEquals(attempts, 3);
});

Deno.test("bridge malformed JSON is persist_failed without crashing", async () => {
  const fetchImpl: FetchLike = async () =>
    new Response("not-json", { status: 200 });
  const bridge = createRadarBridge({
    bridgeUrl: BRIDGE_URL,
    workerSecret: SECRET,
    fetch: fetchImpl,
  });
  const published = await bridge.radarRpc({
    p_generation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    p_rows: [],
    p_archive: [],
    p_session_date: "2026-08-10",
    p_synced_at: "2026-08-10T14:00:05.000Z",
    p_status: "empty",
    p_last_provider_event_at: null,
  });
  assertEquals(published.error?.message, "persist_failed");
});

Deno.test("bridge timeout is persist_failed without crashing", async () => {
  const fetchImpl: FetchLike = async (_input, init) => {
    const signal = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  };
  const bridge = createRadarBridge({
    bridgeUrl: BRIDGE_URL,
    workerSecret: SECRET,
    fetch: fetchImpl,
    sleep: async () => {},
    timeoutMs: 20,
  });
  const status = await bridge.setStatus({
    p_status: "stale",
    p_last_provider_event_at: null,
    p_synced_at: "2026-08-10T14:00:05.000Z",
  });
  assertEquals(status.error?.message, "persist_failed");
});

Deno.test("bridge calendar and 52w state parse successful payloads", async () => {
  const fetchImpl = capturingFetch([], (req) => {
    if (req.body.action === "get_calendar") {
      return ok({
        ok: true,
        rows: [{
          session_date: "2026-08-10",
          market_status: "early_close",
          regular_open_et: "09:30:00",
          regular_close_et: "13:00:00",
          after_hours_end_et: "17:00:00",
          holiday_name: "Test",
        }],
      });
    }
    return ok({
      ok: true,
      state: {
        current_generation_id: "11111111-2222-3333-4444-555555555555",
        status: "available",
        period_start: "2025-08-10",
        period_end: "2026-08-10",
        symbol_count: 3,
        provider_as_of: "2026-08-10T20:00:00.000Z",
      },
    });
  });
  const bridge = createRadarBridge({
    bridgeUrl: BRIDGE_URL,
    workerSecret: SECRET,
    fetch: fetchImpl,
  });
  const calendar = await bridge.loadExceptions();
  assertEquals(calendar?.length, 1);
  assertEquals(calendar?.[0].session_date, "2026-08-10");
  const state = await bridge.loadState();
  assertEquals(state?.status, "available");
  assertEquals(state?.symbol_count, 3);
});

Deno.test("bridge log helper never prints worker secret", () => {
  log("info", "listening", {
    RADAR_WORKER_SECRET: SECRET,
    Authorization: `Bearer ${SECRET}`,
  });
  const sanitized = sanitizeLogValue(`Authorization: Bearer ${SECRET}`);
  assertEquals(sanitized, "[redacted]");
});

function parseBridgeLogs(lines: string[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") out.push(parsed);
    } catch {
      // ignore non-JSON console noise
    }
  }
  return out;
}

Deno.test("bridge retries share request_id and record action-level telemetry", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (msg?: unknown) => {
    lines.push(String(msg ?? ""));
  };
  let attempts = 0;
  try {
    const fetchImpl: FetchLike = async (_input, init) => {
      attempts += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      assertEquals(typeof body.request_id, "string");
      return new Response("nope", { status: 503 });
    };
    const bridge = createRadarBridge({
      bridgeUrl: BRIDGE_URL,
      workerSecret: SECRET,
      fetch: fetchImpl,
      sleep: async () => {},
    });
    const published = await bridge.radarRpc({
      p_generation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      p_rows: [],
      p_archive: [],
      p_session_date: "2026-08-10",
      p_synced_at: "2026-08-10T14:00:05.000Z",
      p_status: "empty",
      p_last_provider_event_at: null,
    });
    assertEquals(published.error?.message, "persist_failed");
    assertEquals(attempts, 3);
    const logs = parseBridgeLogs(lines);
    const attemptsLogged = logs.filter((row) => row.msg === "bridge_request");
    assertEquals(attemptsLogged.length, 3);
    const ids = new Set(attemptsLogged.map((row) => row.request_id));
    assertEquals(ids.size, 1);
    assertEquals(attemptsLogged.map((row) => row.attempt), [1, 2, 3]);
    for (const row of attemptsLogged) {
      assertEquals(row.action, "publish_generation");
      assertEquals(row.outcome, "http_error");
      assertEquals(row.http_status, 503);
      assertEquals(row.timeout_ms, 15_000);
      assertEquals(typeof row.elapsed_ms, "number");
      assertEquals(typeof row.payload_bytes, "number");
      assertEquals((row.payload_bytes as number) > 0, true);
    }
    const dumped = lines.join("\n");
    assertEquals(dumped.includes(SECRET), false);
    assertEquals(dumped.includes("Bearer "), false);
    assertEquals(dumped.includes("p_rows"), false);
    assertEquals(dumped.includes("p_archive"), false);
  } finally {
    console.log = original;
  }
});

Deno.test("bridge timeout telemetry uses timeout outcome without changing retry count", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (msg?: unknown) => {
    lines.push(String(msg ?? ""));
  };
  try {
    const fetchImpl: FetchLike = async (_input, init) => {
      const signal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    };
    const bridge = createRadarBridge({
      bridgeUrl: BRIDGE_URL,
      workerSecret: SECRET,
      fetch: fetchImpl,
      sleep: async () => {},
      timeoutMs: 20,
    });
    const status = await bridge.setStatus({
      p_status: "stale",
      p_last_provider_event_at: null,
      p_synced_at: "2026-08-10T14:00:05.000Z",
    });
    assertEquals(status.error?.message, "persist_failed");
    const attemptsLogged = parseBridgeLogs(lines).filter((row) =>
      row.msg === "bridge_request"
    );
    assertEquals(attemptsLogged.length, 3);
    for (const row of attemptsLogged) {
      assertEquals(row.action, "set_feed_status");
      assertEquals(row.outcome, "timeout");
      assertEquals(row.http_status, null);
      assertEquals(row.timeout_ms, 20);
    }
  } finally {
    console.log = original;
  }
});

Deno.test("baseline bridge success logs the 60s timeout budget", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (msg?: unknown) => {
    lines.push(String(msg ?? ""));
  };
  try {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const bridge = createRadarBridge({
      bridgeUrl: BRIDGE_URL,
      workerSecret: SECRET,
      fetch: fetchImpl,
    });
    const result = await bridge.baselineRpc({
      p_generation_id: "11111111-2222-3333-4444-555555555555",
      p_rows: [],
      p_period_start: "2025-08-10",
      p_period_end: "2026-08-10",
      p_provider_as_of: "2026-08-10T20:00:00.000Z",
      p_status: "empty",
    });
    assertEquals(result.error, null);
    const attemptsLogged = parseBridgeLogs(lines).filter((row) =>
      row.msg === "bridge_request"
    );
    assertEquals(attemptsLogged.length, 1);
    assertEquals(attemptsLogged[0].action, "replace_52w_baseline");
    assertEquals(attemptsLogged[0].outcome, "ok");
    assertEquals(attemptsLogged[0].http_status, 200);
    assertEquals(attemptsLogged[0].timeout_ms, 60_000);
    assertEquals(attemptsLogged[0].attempt, 1);
  } finally {
    console.log = original;
  }
});
