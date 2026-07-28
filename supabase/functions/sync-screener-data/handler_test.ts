import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DbClient,
  handleSyncScreenerData,
  REPLACE_GENERATION_RPC,
  type SyncDeps,
} from "./handler.ts";
import type { ScreenerResultRow } from "../_shared/screeners/rows.ts";

const SYNC_SECRET = "test-sync-secret";
const SERVICE_ROLE = "test-service-role-key";
const POLY_KEY = "poly-test-key";
const FIXED_ISO = "2026-07-27T20:00:00.000Z";
const FIXED_MS = Date.parse(FIXED_ISO);
const FIXED_NS = FIXED_MS * 1_000_000;
const RUN_ID = "11111111-2222-3333-4444-555555555555";

type Mutation =
  | { kind: "select"; symbols: string[] }
  | {
    kind: "rpc";
    fn: string;
    args: {
      p_rows: ScreenerResultRow[];
      p_sync_run_id: string;
      p_synced_at: string;
    };
  };

type FetchCall = { url: string; auth: string | null };

function mockDb(
  mutations: Mutation[],
  opts: {
    nameRows?: Array<{ symbol: string; name: string }>;
    rpcError?: { message: string } | null;
    rpcData?: number;
  } = {},
): DbClient {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        in: async (_col: string, values: string[]) => {
          mutations.push({ kind: "select", symbols: [...values] });
          const wanted = new Set(values);
          return {
            data: (opts.nameRows ?? []).filter((r) => wanted.has(r.symbol)),
          };
        },
      }),
    }),
    rpc: async (fn, args) => {
      mutations.push({ kind: "rpc", fn, args });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return {
        data: opts.rpcData ?? args.p_rows.length,
        error: null,
      };
    },
  };
}

function baseEnv(extra: Record<string, string> = {}): SyncDeps["env"] {
  const map: Record<string, string> = {
    SYNC_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
    SUPABASE_URL: "https://example.supabase.co",
    POLYGON_API_KEY: POLY_KEY,
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

function mk(
  sym: string,
  vol: number,
  prevVol: number,
  opts: {
    change?: number;
    price?: number;
    open?: number;
    prevClose?: number;
    updated?: number | string | null;
  } = {},
) {
  const price = opts.price ?? 5;
  const updated = opts.updated === undefined ? FIXED_NS : opts.updated;
  const row: Record<string, unknown> = {
    ticker: sym,
    todaysChangePerc: opts.change ?? 15,
    day: { c: price, o: opts.open ?? 5.5, v: vol },
    prevDay: { c: opts.prevClose ?? 5, v: prevVol },
    lastTrade: { p: price },
  };
  if (updated !== null) row.updated = updated;
  return row;
}

function trackFetch(
  calls: FetchCall[],
  impl: (url: string) => Promise<Response>,
): SyncDeps["fetch"] {
  return async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get("Authorization") });
    return impl(url);
  };
}

function depsWith(
  mutations: Mutation[],
  fetchImpl: SyncDeps["fetch"],
  dbOpts: Parameters<typeof mockDb>[1] = {},
): SyncDeps {
  return {
    env: baseEnv(),
    fetch: fetchImpl,
    createClient: () => mockDb(mutations, dbOpts),
    nowIso: () => FIXED_ISO,
    nowMs: () => FIXED_MS,
    newSyncRunId: () => RUN_ID,
  };
}

function marketFetch(
  snap: unknown[],
  gainers: unknown[] = [],
  losers: unknown[] = [],
) {
  return async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/gainers")) return okTickersResponse(gainers);
    if (url.includes("/losers")) return okTickersResponse(losers);
    return okTickersResponse(snap);
  };
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
    nowMs: () => FIXED_MS,
    newSyncRunId: () => RUN_ID,
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
  const deps = depsWith(mutations, async () => {
    fetchCount++;
    return okTickersResponse([]);
  });
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
  const deps = depsWith(mutations, async () => {
    fetchCount++;
    return okTickersResponse([]);
  });
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
    const deps = depsWith(mutations, async () => {
      fetchCount++;
      return okTickersResponse([]);
    });
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
        ? POLY_KEY
        : undefined,
    fetch: async () => {
      fetchCount++;
      return okTickersResponse([]);
    },
    createClient: () => mockDb(mutations),
    nowIso: () => FIXED_ISO,
    nowMs: () => FIXED_MS,
    newSyncRunId: () => RUN_ID,
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
  const deps = depsWith(
    mutations,
    async () => new Response("err", { status: 502 }),
  );
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 503);
  assertEquals((await res.json()).error, "provider_unavailable");
  assertEquals(mutations.length, 0);
});

Deno.test("handler: provider timeout causes zero DB mutations", async () => {
  const mutations: Mutation[] = [];
  const deps = depsWith(
    mutations,
    () => Promise.reject(new DOMException("Aborted", "AbortError")),
  );
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
  const deps = depsWith(
    mutations,
    async () => new Response(JSON.stringify({ status: "OK" }), { status: 200 }),
  );
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

Deno.test("handler: happy path volume-first + single replacement RPC", async () => {
  const mutations: Mutation[] = [];
  const snap = [mk("A", 1_000_000, 50_000), mk("B", 8_000_000, 1_500_000)];
  const deps = depsWith(
    mutations,
    marketFetch(snap, [mk("G1", 500_000, 100_000)], [
      mk("L1", 2_000_000, 100_000),
    ]),
  );
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.sync_run_id, RUN_ID);
  assertEquals(body.synced_at, FIXED_ISO);

  const rpcs = mutations.filter((m) => m.kind === "rpc") as Array<{
    kind: "rpc";
    fn: string;
    args: {
      p_rows: ScreenerResultRow[];
      p_sync_run_id: string;
      p_synced_at: string;
    };
  }>;
  assertEquals(rpcs.length, 1);
  assertEquals(rpcs[0].fn, REPLACE_GENERATION_RPC);
  assertEquals(
    mutations.some((m) => (m as { kind: string }).kind === "upsert"),
    false,
  );
  assertEquals(
    mutations.some((m) => (m as { kind: string }).kind === "delete"),
    false,
  );

  const rows = rpcs[0].args.p_rows;
  const dayTrade = rows.filter((r) => r.tab_id === "day_trade_radar");
  assertEquals(dayTrade.map((r) => r.symbol), ["B", "A"]);
  const gl = rows.filter((r) => r.tab_id === "gainers_losers");
  assertEquals(gl.map((r) => r.symbol), ["L1", "G1"]);

  for (const r of rows) {
    assertEquals(r.sync_run_id, RUN_ID);
    assertEquals(r.updated_at, FIXED_ISO);
    assertEquals(r.provider_as_of, FIXED_ISO);
  }
});

Deno.test(
  "handler: selected row without valid timestamp fails before DB",
  async () => {
    const mutations: Mutation[] = [];
    let clientCreated = 0;
    const deps: SyncDeps = {
      env: baseEnv(),
      fetch: marketFetch([
        mk("B", 8_000_000, 1_500_000, { updated: null }),
      ]),
      createClient: () => {
        clientCreated++;
        return mockDb(mutations);
      },
      nowIso: () => FIXED_ISO,
      nowMs: () => FIXED_MS,
      newSyncRunId: () => RUN_ID,
    };
    const res = await handleSyncScreenerData(
      new Request("https://example.test/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${SYNC_SECRET}` },
      }),
      deps,
    );
    assertEquals(res.status, 503);
    assertEquals((await res.json()).error, "provider_freshness_unavailable");
    assertEquals(clientCreated, 0);
    assertEquals(mutations.length, 0);
  },
);

Deno.test("handler: per-row provider_as_of comes from that ticker", async () => {
  const mutations: Mutation[] = [];
  const olderMs = FIXED_MS - 60_000;
  const deps = depsWith(
    mutations,
    marketFetch([
      mk("B", 8_000_000, 1_500_000, { updated: FIXED_NS }),
      mk("A", 1_000_000, 50_000, { updated: olderMs * 1_000_000 }),
    ]),
  );
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 200);
  const rpc = mutations.find((m) => m.kind === "rpc") as {
    kind: "rpc";
    args: { p_rows: ScreenerResultRow[] };
  };
  const dayTrade = rpc.args.p_rows.filter((r) =>
    r.tab_id === "day_trade_radar"
  );
  assertEquals(
    dayTrade.find((r) => r.symbol === "B")!.provider_as_of,
    FIXED_ISO,
  );
  assertEquals(
    dayTrade.find((r) => r.symbol === "A")!.provider_as_of,
    new Date(olderMs).toISOString(),
  );
  const body = await res.json();
  assertEquals(body.provider_as_of_min, new Date(olderMs).toISOString());
  assertEquals(body.provider_as_of_max, FIXED_ISO);
});

Deno.test("handler: empty qualifying results still invoke empty replacement", async () => {
  const mutations: Mutation[] = [];
  const deps = depsWith(mutations, marketFetch([], [], []));
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 200);
  const rpcs = mutations.filter((m) => m.kind === "rpc") as Array<{
    kind: "rpc";
    args: { p_rows: ScreenerResultRow[] };
  }>;
  assertEquals(rpcs.length, 1);
  assertEquals(rpcs[0].args.p_rows.length, 0);
  assertEquals(mutations.filter((m) => m.kind === "select").length, 0);
});

Deno.test("handler: RPC failure returns database_error", async () => {
  const mutations: Mutation[] = [];
  const deps = depsWith(
    mutations,
    marketFetch([mk("B", 8_000_000, 1_500_000)]),
    { rpcError: { message: "boom" } },
  );
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "database_error");
});

Deno.test(
  "handler: large market response queries names only for selected symbols",
  async () => {
    const mutations: Mutation[] = [];
    const snap: ReturnType<typeof mk>[] = [];
    for (let i = 0; i < 80; i++) {
      snap.push(
        mk(`N${String(i).padStart(2, "0")}`, 100_000 + i, 100_000, {
          change: 1,
          price: 50,
          open: 50,
          prevClose: 50,
        }),
      );
    }
    snap.push(mk("SEL1", 9_000_000, 100_000));
    snap.push(mk("SEL2", 8_000_000, 100_000));
    const deps = depsWith(
      mutations,
      marketFetch(snap, [mk("GSEL", 700_000, 100_000)], [
        mk("LSEL", 600_000, 100_000),
      ]),
      {
        nameRows: [
          { symbol: "SEL1", name: "Selected One" },
          { symbol: "SEL2", name: "Selected Two" },
          { symbol: "GSEL", name: "Gainer Sel" },
          { symbol: "LSEL", name: "Loser Sel" },
        ],
      },
    );
    const res = await handleSyncScreenerData(
      new Request("https://example.test/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${SYNC_SECRET}` },
      }),
      deps,
    );
    assertEquals(res.status, 200);
    const selects = mutations.filter((m) => m.kind === "select") as Array<{
      kind: "select";
      symbols: string[];
    }>;
    assertEquals(selects.length, 1);
    assertEquals([...new Set(selects[0].symbols)].sort(), [
      "GSEL",
      "LSEL",
      "SEL1",
      "SEL2",
    ]);
  },
);

Deno.test("handler: no reference-ticker provider request occurs", async () => {
  const mutations: Mutation[] = [];
  const calls: FetchCall[] = [];
  const deps = depsWith(
    mutations,
    trackFetch(
      calls,
      marketFetch(
        [mk("A", 1_000_000, 50_000), mk("B", 8_000_000, 1_500_000)],
        [mk("G1", 500_000, 100_000)],
        [mk("L1", 2_000_000, 100_000)],
      ),
    ),
  );
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(calls.length, 3);
  assertEquals(calls.every((c) => !c.url.includes("/reference/")), true);
});

Deno.test("handler: no provider URL contains apiKey or credential", async () => {
  const mutations: Mutation[] = [];
  const calls: FetchCall[] = [];
  const deps = depsWith(
    mutations,
    trackFetch(calls, marketFetch([mk("B", 8_000_000, 1_500_000)])),
  );
  await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  for (const c of calls) {
    assertEquals(/apiKey=/i.test(c.url), false);
    assertEquals(c.url.includes(POLY_KEY), false);
    assertEquals(c.url.includes(SYNC_SECRET), false);
    assertEquals(c.url.includes(SERVICE_ROLE), false);
  }
});

Deno.test(
  "handler: all three required requests carry Polygon Authorization",
  async () => {
    const mutations: Mutation[] = [];
    const calls: FetchCall[] = [];
    const deps = depsWith(
      mutations,
      trackFetch(calls, marketFetch([], [], [])),
    );
    const res = await handleSyncScreenerData(
      new Request("https://example.test/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${SYNC_SECRET}` },
      }),
      deps,
    );
    assertEquals(res.status, 200);
    assertEquals(calls.length, 3);
    assertEquals(calls.every((c) => c.auth === `Bearer ${POLY_KEY}`), true);
  },
);

Deno.test("handler: missing company names fall back to normalized symbol", async () => {
  const mutations: Mutation[] = [];
  const deps = depsWith(
    mutations,
    marketFetch([
      mk("zzz", 9_000_000, 100_000),
      mk("aaa", 8_000_000, 100_000),
    ]),
  );
  const res = await handleSyncScreenerData(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 200);
  const rpc = mutations.find((m) => m.kind === "rpc") as {
    kind: "rpc";
    args: { p_rows: ScreenerResultRow[] };
  };
  const dayTrade = rpc.args.p_rows.filter((r) =>
    r.tab_id === "day_trade_radar"
  );
  assertEquals(dayTrade.map((r) => r.symbol), ["ZZZ", "AAA"]);
  for (const row of dayTrade) {
    assertEquals(row.company_name, row.symbol);
  }
});
