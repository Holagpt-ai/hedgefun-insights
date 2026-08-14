import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CALENDAR_SOURCE } from "../_shared/markets/session-calendar.ts";
import {
  type CalendarSyncDeps,
  type DbClient,
  handleSyncMarketCalendar,
  REPLACE_CALENDAR_RPC,
} from "./handler.ts";

const SYNC_SECRET = "test-sync-secret";
const SERVICE_ROLE = "test-service-role-key";
const POLY_KEY = "poly-test-key";
const FIXED_ISO = "2026-08-13T14:00:00.000Z"; // 10:00 AM EDT
const FIXED_MS = Date.parse(FIXED_ISO);

type RpcCall = {
  fn: string;
  args: {
    p_rows: unknown[];
    p_as_of_date: string;
    p_provider_as_of: string;
  };
};

function mockDb(
  calls: RpcCall[],
  opts: { error?: { message: string } | null; data?: number } = {},
): DbClient {
  return {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (opts.error) return { data: null, error: opts.error };
      return { data: opts.data ?? args.p_rows.length, error: null };
    },
  };
}

function baseEnv(extra: Record<string, string> = {}): CalendarSyncDeps["env"] {
  const map: Record<string, string> = {
    SYNC_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
    SUPABASE_URL: "https://example.supabase.co",
    POLYGON_API_KEY: POLY_KEY,
    ...extra,
  };
  return (k) => map[k];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function upcomingOk() {
  return [
    {
      exchange: "NYSE",
      name: "Labor Day",
      date: "2026-09-07",
      status: "closed",
    },
    {
      exchange: "NASDAQ",
      name: "Labor Day",
      date: "2026-09-07",
      status: "closed",
    },
    {
      exchange: "NYSE",
      name: "Day After Thanksgiving",
      date: "2026-11-27",
      status: "early-close",
      open: "09:30",
      close: "13:00",
    },
    {
      exchange: "NASDAQ",
      name: "Day After Thanksgiving",
      date: "2026-11-27",
      status: "early-close",
      open: "09:30",
      close: "13:00",
    },
  ];
}

function makeDeps(
  calls: RpcCall[],
  fetchImpl: CalendarSyncDeps["fetch"],
  dbOpts?: { error?: { message: string } | null },
): CalendarSyncDeps {
  return {
    env: baseEnv(),
    fetch: fetchImpl,
    createClient: () => mockDb(calls, dbOpts),
    nowIso: () => FIXED_ISO,
    nowMs: () => FIXED_MS,
  };
}

function post(): Request {
  return new Request(
    "https://example.supabase.co/functions/v1/sync-market-calendar",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    },
  );
}

Deno.test("sync-market-calendar persists validated upcoming exceptions", async () => {
  const calls: RpcCall[] = [];
  const res = await handleSyncMarketCalendar(
    post(),
    makeDeps(calls, async () => jsonResponse(upcomingOk())),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.rows, 2);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, REPLACE_CALENDAR_RPC);
  assertEquals(calls[0].args.p_as_of_date, "2026-08-13");
  assertEquals(calls[0].args.p_rows.length, 2);
  for (const row of calls[0].args.p_rows) {
    const source = (row as { source?: unknown }).source;
    assertEquals(typeof source, "string");
    assertEquals(source, CALENDAR_SOURCE);
    assertEquals((source as string).length > 0, true);
  }
});

Deno.test("sync-market-calendar persist failure retains previous calendar", async () => {
  const calls: RpcCall[] = [];
  const res = await handleSyncMarketCalendar(
    post(),
    makeDeps(calls, async () => jsonResponse(upcomingOk()), {
      error: { message: "invalid source" },
    }),
  );
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "persist_failed");
  assertEquals(calls.length, 1);
  assertEquals(body.ok, undefined);
});

Deno.test("sync-market-calendar does not mutate on provider failure", async () => {
  const calls: RpcCall[] = [];
  const res = await handleSyncMarketCalendar(
    post(),
    makeDeps(calls, async () => jsonResponse({ error: "nope" }, 500)),
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "provider_unavailable");
  assertEquals(calls.length, 0);
});

Deno.test("sync-market-calendar does not mutate on malformed provider body", async () => {
  const calls: RpcCall[] = [];
  const res = await handleSyncMarketCalendar(
    post(),
    makeDeps(calls, async () => jsonResponse({ status: "closed" })),
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "provider_response_invalid");
  assertEquals(calls.length, 0);
});

Deno.test("sync-market-calendar does not mutate on contradictory venues", async () => {
  const calls: RpcCall[] = [];
  const res = await handleSyncMarketCalendar(
    post(),
    makeDeps(calls, async () =>
      jsonResponse([
        { exchange: "NYSE", date: "2026-09-07", status: "closed" },
        {
          exchange: "NASDAQ",
          date: "2026-09-07",
          status: "early-close",
          close: "13:00",
        },
      ])),
  );
  assertEquals(res.status, 503);
  assertEquals(calls.length, 0);
});

Deno.test("sync-market-calendar rejects missing auth", async () => {
  const calls: RpcCall[] = [];
  const res = await handleSyncMarketCalendar(
    new Request(
      "https://example.supabase.co/functions/v1/sync-market-calendar",
      {
        method: "POST",
      },
    ),
    makeDeps(calls, async () => jsonResponse(upcomingOk())),
  );
  assertEquals(res.status, 403);
  assertEquals(calls.length, 0);
});

Deno.test("sync-market-calendar never returns the provider key", async () => {
  const calls: RpcCall[] = [];
  const res = await handleSyncMarketCalendar(
    post(),
    makeDeps(calls, async () => jsonResponse({ error: "nope" }, 500)),
  );
  const text = await res.text();
  assertEquals(text.includes(POLY_KEY), false);
  assertEquals(text.includes("apiKey"), false);
});
