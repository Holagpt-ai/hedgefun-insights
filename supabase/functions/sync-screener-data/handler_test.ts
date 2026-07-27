import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DbClient,
  handleSyncScreenerData,
  type SyncDeps,
} from "./handler.ts";
import type { ScreenerResultRow } from "../_shared/screeners/rows.ts";

const SYNC_SECRET = "test-sync-secret";
const SERVICE_ROLE = "test-service-role-key";
const POLY_KEY = "poly-test-key";
const FIXED_ISO = "2026-07-27T20:00:00.000Z";

type Mutation =
  | { kind: "upsert"; rows: ScreenerResultRow[] }
  | { kind: "delete" }
  | { kind: "select"; symbols: string[] };

type FetchCall = { url: string; auth: string | null };

function mockDb(
  mutations: Mutation[],
  nameRows: Array<{ symbol: string; name: string }> = [],
): DbClient {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        in: async (_col: string, values: string[]) => {
          mutations.push({ kind: "select", symbols: [...values] });
          const wanted = new Set(values);
          return {
            data: nameRows.filter((r) => wanted.has(r.symbol)),
          };
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
  opts: { change?: number; price?: number; open?: number; prevClose?: number } =
    {},
) {
  const price = opts.price ?? 5;
  return {
    ticker: sym,
    todaysChangePerc: opts.change ?? 15,
    day: { c: price, o: opts.open ?? 5.5, v: vol },
    prevDay: { c: opts.prevClose ?? 5, v: prevVol },
    lastTrade: { p: price },
  };
}

function trackFetch(
  calls: FetchCall[],
  impl: (url: string) => Promise<Response>,
): SyncDeps["fetch"] {
  return async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      auth: headers.get("Authorization"),
    });
    return impl(url);
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
        ? POLY_KEY
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

Deno.test(
  "handler: large market response queries names only for selected symbols",
  async () => {
    const mutations: Mutation[] = [];
    const snap: ReturnType<typeof mk>[] = [];
    // 80 names that fail every tab's qualifying criteria.
    for (let i = 0; i < 80; i++) {
      snap.push(
        mk(`N${String(i).padStart(2, "0")}`, 100_000 + i, 100_000, {
          change: 1,
          price: 50,
          open: 50,
          prevClose: 50, // gap 0%, RVOL ~1
        }),
      );
    }
    snap.push(mk("SEL1", 9_000_000, 100_000));
    snap.push(mk("SEL2", 8_000_000, 100_000));

    const calls: FetchCall[] = [];
    const deps: SyncDeps = {
      env: baseEnv(),
      fetch: trackFetch(calls, async (url) => {
        if (url.includes("/gainers")) {
          return okTickersResponse([mk("GSEL", 700_000, 100_000)]);
        }
        if (url.includes("/losers")) {
          return okTickersResponse([mk("LSEL", 600_000, 100_000)]);
        }
        return okTickersResponse(snap);
      }),
      createClient: () =>
        mockDb(mutations, [
          { symbol: "SEL1", name: "Selected One" },
          { symbol: "SEL2", name: "Selected Two" },
          { symbol: "GSEL", name: "Gainer Sel" },
          { symbol: "LSEL", name: "Loser Sel" },
        ]),
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

    const selects = mutations.filter((m) => m.kind === "select") as Array<{
      kind: "select";
      symbols: string[];
    }>;
    assertEquals(selects.length, 1);
    const queried = new Set(selects[0].symbols);
    // Must include selected qualifiers and exclude non-qualifying Nxx universe.
    assertEquals(
      [...queried].sort(),
      ["GSEL", "LSEL", "SEL1", "SEL2"],
    );
    assertEquals(queried.has("N00"), false);
    assertEquals(snap.length > queried.size, true);
  },
);

Deno.test("handler: no reference-ticker provider request occurs", async () => {
  const mutations: Mutation[] = [];
  const calls: FetchCall[] = [];
  const deps: SyncDeps = {
    env: baseEnv(),
    fetch: trackFetch(calls, async (url) => {
      if (url.includes("/gainers")) {
        return okTickersResponse([mk("G1", 500_000, 100_000)]);
      }
      if (url.includes("/losers")) {
        return okTickersResponse([mk("L1", 2_000_000, 100_000)]);
      }
      return okTickersResponse([
        mk("A", 1_000_000, 50_000),
        mk("B", 8_000_000, 1_500_000),
      ]);
    }),
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
  assertEquals(calls.length, 3);
  assertEquals(calls.every((c) => !c.url.includes("/reference/")), true);
});

Deno.test("handler: no provider URL contains apiKey or credential", async () => {
  const mutations: Mutation[] = [];
  const calls: FetchCall[] = [];
  const deps: SyncDeps = {
    env: baseEnv(),
    fetch: trackFetch(calls, async (url) => {
      if (url.includes("/gainers")) return okTickersResponse([]);
      if (url.includes("/losers")) return okTickersResponse([]);
      return okTickersResponse([mk("B", 8_000_000, 1_500_000)]);
    }),
    createClient: () => mockDb(mutations),
    nowIso: () => FIXED_ISO,
  };
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
    const deps: SyncDeps = {
      env: baseEnv(),
      fetch: trackFetch(calls, async (url) => {
        if (url.includes("/gainers")) return okTickersResponse([]);
        if (url.includes("/losers")) return okTickersResponse([]);
        return okTickersResponse([]);
      }),
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
    assertEquals(calls.length, 3);
    const paths = calls.map((c) => c.url).sort();
    assertEquals(
      paths.some((u) => u.includes("/tickers?include_otc=false")),
      true,
    );
    assertEquals(paths.some((u) => u.includes("/gainers")), true);
    assertEquals(paths.some((u) => u.includes("/losers")), true);
    for (const c of calls) {
      assertEquals(c.auth, `Bearer ${POLY_KEY}`);
    }
  },
);

Deno.test("handler: missing company names fall back to normalized symbol", async () => {
  const mutations: Mutation[] = [];
  const deps: SyncDeps = {
    env: baseEnv(),
    fetch: async (input) => {
      const url = String(input);
      if (url.includes("/gainers")) return okTickersResponse([]);
      if (url.includes("/losers")) return okTickersResponse([]);
      return okTickersResponse([
        mk("zzz", 9_000_000, 100_000),
        mk("aaa", 8_000_000, 100_000),
      ]);
    },
    // stocks returns no names → fallback to symbol
    createClient: () => mockDb(mutations, []),
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
  const upsert = mutations.find((m) => m.kind === "upsert") as {
    kind: "upsert";
    rows: ScreenerResultRow[];
  };
  const dayTrade = upsert.rows.filter((r) => r.tab_id === "day_trade_radar");
  assertEquals(dayTrade.length, 2);
  for (const row of dayTrade) {
    assertEquals(row.company_name, row.symbol);
  }
  assertEquals(dayTrade.map((r) => r.symbol), ["ZZZ", "AAA"]);
});
