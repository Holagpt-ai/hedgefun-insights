import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DbClient,
  handleSyncScreenerData,
  type SyncDeps,
} from "./handler.ts";
import type { ScreenerResultRow } from "../_shared/screeners/rows.ts";

const SYNC_SECRET = "test-sync-secret";
const SERVICE_ROLE = "test-service-role-key";
const FIXED_ISO = "2026-07-27T20:00:00.000Z";

type Mutation =
  | { kind: "upsert"; rows: ScreenerResultRow[] }
  | { kind: "delete" }
  | { kind: "select" };

function mockDb(mutations: Mutation[]): DbClient {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        in: async (_col: string, _values: string[]) => {
          mutations.push({ kind: "select" });
          return { data: [] };
        },
      }),
      upsert: async (rows: ScreenerResultRow[]) => {
        mutations.push({ kind: "upsert", rows });
        return { error: null };
      },
      delete: () => ({
        lt: async () => {
          mutations.push({ kind: "delete" });
          return { error: null };
        },
      }),
    }),
  };
}

function baseEnv(extra: Record<string, string> = {}): SyncDeps["env"] {
  const map: Record<string, string> = {
    SYNC_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
    SUPABASE_URL: "https://example.supabase.co",
    POLYGON_API_KEY: "poly-test-key",
    ...extra,
  };
  return (k) => map[k];
}

function okTickersResponse(tickers: unknown[]) {
  return new Response(JSON.stringify({ tickers }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.test("handler: OPTIONS allowed without auth", async () => {
  let fetchCount = 0;
  const mutations: Mutation[] = [];
  const deps: SyncDeps = {
    env: () => undefined,
    fetch: async () => {
      fetchCount++;
      return okTickersResponse([]);
    },
    createClient: () => mockDb(mutations),
    nowIso: () => FIXED_ISO,
  };
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", { method: "OPTIONS" }),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(fetchCount, 0);
  assertEquals(mutations.length, 0);
});

Deno.test("handler: non-POST methods return 405", async () => {
  const mutations: Mutation[] = [];
  let fetchCount = 0;
  const deps: SyncDeps = {
    env: baseEnv(),
    fetch: async () => {
      fetchCount++;
      return okTickersResponse([]);
    },
    createClient: () => mockDb(mutations),
    nowIso: () => FIXED_ISO,
  };
  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    const res = await handleSyncScreenerData(
      new Request("https://example.test/sync", { method }),
      deps,
    );
    assertEquals(res.status, 405);
  }
  assertEquals(fetchCount, 0);
  assertEquals(mutations.length, 0);
});

Deno.test("handler: unauthorized makes no provider call and no DB mutation", async () => {
  const mutations: Mutation[] = [];
  let fetchCount = 0;
  const deps: SyncDeps = {
    env: baseEnv(),
    fetch: async () => {
      fetchCount++;
      return okTickersResponse([]);
    },
    createClient: () => mockDb(mutations),
    nowIso: () => FIXED_ISO,
  };
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    }),
    deps,
  );
  assertEquals(res.status, 403);
  assertEquals(fetchCount, 0);
  assertEquals(mutations.length, 0);
});

Deno.test(
  "handler: service-role Bearer rejected as invocation token",
  async () => {
    const mutations: Mutation[] = [];
    let fetchCount = 0;
    const deps: SyncDeps = {
      env: baseEnv(),
      fetch: async () => {
        fetchCount++;
        return okTickersResponse([]);
      },
      createClient: () => mockDb(mutations),
      nowIso: () => FIXED_ISO,
    };
    const res = await handleSyncScreenerData(
      new Request("https://example.test/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
      }),
      deps,
    );
    assertEquals(res.status, 403);
    assertEquals(fetchCount, 0);
    assertEquals(mutations.length, 0);
  },
);

Deno.test("handler: missing SYNC_SECRET fails closed with zero I/O", async () => {
  const mutations: Mutation[] = [];
  let fetchCount = 0;
  const deps: SyncDeps = {
    env: (k) =>
      k === "SUPABASE_SERVICE_ROLE_KEY"
        ? SERVICE_ROLE
        : k === "SUPABASE_URL"
        ? "https://example.supabase.co"
        : k === "POLYGON_API_KEY"
        ? "poly-test-key"
        : undefined,
    fetch: async () => {
      fetchCount++;
      return okTickersResponse([]);
    },
    createClient: () => mockDb(mutations),
    nowIso: () => FIXED_ISO,
  };
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
    }),
    deps,
  );
  assertEquals(res.status, 403);
  assertEquals(fetchCount, 0);
  assertEquals(mutations.length, 0);
});

Deno.test("handler: provider HTTP failure causes zero DB mutations", async () => {
  const mutations: Mutation[] = [];
  const deps: SyncDeps = {
    env: baseEnv(),
    fetch: async () => new Response("err", { status: 502 }),
    createClient: () => mockDb(mutations),
    nowIso: () => FIXED_ISO,
  };
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "provider_unavailable");
  assertEquals(mutations.length, 0);
});

Deno.test("handler: provider timeout causes zero DB mutations", async () => {
  const mutations: Mutation[] = [];
  const deps: SyncDeps = {
    env: baseEnv(),
    fetch: () => Promise.reject(new DOMException("Aborted", "AbortError")),
    createClient: () => mockDb(mutations),
    nowIso: () => FIXED_ISO,
  };
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 503);
  assertEquals(mutations.length, 0);
});

Deno.test("handler: invalid provider JSON/shape causes zero DB mutations", async () => {
  const mutations: Mutation[] = [];
  const deps: SyncDeps = {
    env: baseEnv(),
    fetch: async () =>
      new Response(JSON.stringify({ status: "OK" }), { status: 200 }),
    createClient: () => mockDb(mutations),
    nowIso: () => FIXED_ISO,
  };
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 503);
  assertEquals(mutations.length, 0);
});

Deno.test("handler: happy path upserts volume-first rows", async () => {
  const mutations: Mutation[] = [];
  const mk = (sym: string, vol: number, prevVol: number) => ({
    ticker: sym,
    todaysChangePerc: 15,
    day: { c: 5, o: 5.5, v: vol },
    prevDay: { c: 5, v: prevVol },
    lastTrade: { p: 5 },
  });
  // B has higher volume than A; A has higher RVOL.
  const snap = [mk("A", 1_000_000, 50_000), mk("B", 8_000_000, 1_500_000)];
  const deps: SyncDeps = {
    env: baseEnv(),
    fetch: async (input) => {
      const url = String(input);
      if (url.includes("/gainers")) {
        return okTickersResponse([mk("G1", 500_000, 100_000)]);
      }
      if (url.includes("/losers")) {
        return okTickersResponse([mk("L1", 2_000_000, 100_000)]);
      }
      if (url.includes("/reference/")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      return okTickersResponse(snap);
    },
    createClient: () => mockDb(mutations),
    nowIso: () => FIXED_ISO,
  };
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 200);
  const upserts = mutations.filter((m) => m.kind === "upsert") as Array<{
    kind: "upsert";
    rows: ScreenerResultRow[];
  }>;
  assertEquals(upserts.length >= 1, true);
  const dayTrade = upserts[0].rows.filter((r) =>
    r.tab_id === "day_trade_radar"
  );
  assertEquals(dayTrade.map((r) => r.symbol), ["B", "A"]);
  const gl = upserts[0].rows.filter((r) => r.tab_id === "gainers_losers");
  assertEquals(gl.map((r) => r.symbol), ["L1", "G1"]);
  assertEquals(mutations.some((m) => m.kind === "delete"), true);
});
