import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type AhSyncDeps,
  type DbClient,
  handleSyncAfterHoursMovers,
  REPLACE_AH_RPC,
} from "./handler.ts";
import type { AhClassifiedRow } from "../_shared/markets/after-hours-movers.ts";

const SYNC_SECRET = "test-sync-secret";
const FIXED_ISO = "2026-08-12T22:45:00.000Z";
const FIXED_MS = Date.parse(FIXED_ISO);
const AH_TRADE_MS = Date.parse("2026-08-12T20:00:00.001Z");
const GEN = "11111111-1111-4111-8111-111111111111";

type Mutation =
  | {
    kind: "rpc";
    fn: string;
    args: { p_rows: AhClassifiedRow[]; p_status: string };
  }
  | { kind: "select"; table: string };

function thenable(data: Array<Record<string, unknown>>): {
  eq: () => unknown;
  in: () => unknown;
  then: (
    onfulfilled?:
      | ((
        value: { data: Array<Record<string, unknown>> | null; error: null },
      ) => unknown)
      | null,
  ) => Promise<unknown>;
} {
  const result = { data, error: null };
  const builder = {
    eq: () => builder,
    in: () => builder,
    then: (
      onfulfilled?: ((value: typeof result) => unknown) | null,
    ) => Promise.resolve(result).then(onfulfilled ?? undefined),
  };
  return builder;
}

function mockDb(
  mutations: Mutation[],
  rpcError: { message: string } | null = null,
): DbClient {
  return {
    from: (table: string) => ({
      select: () => {
        mutations.push({ kind: "select", table });
        return thenable([]) as never;
      },
    }),
    rpc: async (fn, args) => {
      mutations.push({ kind: "rpc", fn, args });
      if (rpcError) return { data: null, error: rpcError };
      return { data: args.p_rows.length, error: null };
    },
  };
}

function depsWith(
  mutations: Mutation[],
  fetchImpl: AhSyncDeps["fetch"],
  rpcError: { message: string } | null = null,
): AhSyncDeps {
  return {
    env: (k) =>
      ({
        SYNC_SECRET,
        SUPABASE_SERVICE_ROLE_KEY: "svc",
        SUPABASE_URL: "https://example.supabase.co",
        POLYGON_API_KEY: "poly",
      } as Record<string, string>)[k],
    fetch: fetchImpl,
    createClient: () => mockDb(mutations, rpcError),
    nowIso: () => FIXED_ISO,
    nowMs: () => FIXED_MS,
    newGenerationId: () => GEN,
  };
}

function snap(tickers: unknown[]) {
  return async () =>
    new Response(JSON.stringify({ tickers }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

Deno.test("handler: unauthorized does not fetch or mutate", async () => {
  const mutations: Mutation[] = [];
  let fetches = 0;
  const deps = depsWith(mutations, async () => {
    fetches += 1;
    return new Response("nope", { status: 500 });
  });
  const res = await handleSyncAfterHoursMovers(
    new Request("https://example.test/sync", { method: "POST" }),
    deps,
  );
  assertEquals(res.status, 403);
  assertEquals(fetches, 0);
  assertEquals(mutations.length, 0);
});

Deno.test("handler: provider failure retains prior generation", async () => {
  const mutations: Mutation[] = [];
  const deps = depsWith(
    mutations,
    async () => new Response("nope", { status: 500 }),
  );
  const res = await handleSyncAfterHoursMovers(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.retained, true);
  assertEquals(body.reason, "provider_unavailable");
  assertEquals(mutations.some((m) => m.kind === "rpc"), false);
});

Deno.test("handler: snapshot request excludes OTC and uses bearer auth", async () => {
  const mutations: Mutation[] = [];
  let requested = "";
  let auth = "";
  const deps = depsWith(mutations, async (input, init) => {
    requested = typeof input === "string" ? input : String(input);
    const headers = init?.headers as Record<string, string> | undefined;
    auth = String(headers?.Authorization ?? headers?.authorization ?? "");
    return new Response(JSON.stringify({ tickers: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  await handleSyncAfterHoursMovers(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(requested.includes("include_otc=false"), true);
  assertEquals(
    requested.includes("/v2/snapshot/locale/us/markets/stocks/tickers"),
    true,
  );
  assertEquals(auth, "Bearer poly");
});

Deno.test("handler: full-market snapshot publishes capped classified movers", async () => {
  const mutations: Mutation[] = [];
  const tickers = [
    {
      ticker: "UP",
      todaysChangePerc: -50,
      day: { c: 10, v: 1_000_000 },
      lastTrade: { p: 11, t: AH_TRADE_MS },
    },
    {
      ticker: "DOWN",
      todaysChangePerc: 80,
      day: { c: 10, v: 2_000_000 },
      lastTrade: { p: 9, t: AH_TRADE_MS },
    },
  ];
  const deps = depsWith(mutations, snap(tickers));
  const res = await handleSyncAfterHoursMovers(
    new Request("https://example.test/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SYNC_SECRET}` },
    }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.retained, false);
  assertEquals(body.status, "available");
  const rpc = mutations.find((m) => m.kind === "rpc") as Extract<
    Mutation,
    { kind: "rpc" }
  >;
  assertEquals(rpc.fn, REPLACE_AH_RPC);
  assertEquals(rpc.args.p_rows.map((r) => r.symbol).sort(), ["DOWN", "UP"]);
  assertEquals(
    rpc.args.p_rows.every((r) =>
      (r as { todaysChangePerc?: unknown }).todaysChangePerc === undefined
    ),
    true,
  );
  const up = rpc.args.p_rows.find((r) => r.symbol === "UP")!;
  assertEquals(up.side, "gainer");
  assertEquals(up.change_percent, 10);
  const down = rpc.args.p_rows.find((r) => r.symbol === "DOWN")!;
  assertEquals(down.side, "loser");
  assertEquals(down.change_percent, -10);
});
