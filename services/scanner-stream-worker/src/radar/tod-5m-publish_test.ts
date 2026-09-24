import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { WorkerEnv } from "../env.ts";
import { mergeRadarConfig } from "./config.ts";
import { computeMomentumMetrics, regularSessionBucketIndex } from "./momentum-metrics.ts";
import { createTod5mBaselineCache } from "./tod-5m-baseline-cache.ts";
import { startRadarV22 } from "./run.ts";
import type { RadarWsHandle } from "./ws.ts";
import type { SecondBar } from "./types.ts";
import { resolveScheduleAt } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";

const T0 = Date.parse("2026-09-24T18:30:00.000Z");

const env: WorkerEnv = {
  polygonApiKey: "test-key",
  radarBridgeUrl: "https://example.supabase.co/functions/v1/radar-worker-bridge",
  radarWorkerSecret: "secret",
  port: 8080,
  marketDataProvider: "polygon",
  marketDataFeedMode: "delayed",
  massiveWsMode: "delayed",
  baselineMinSessions: 120,
  baselineLookbackCalendarDays: 366,
  radarSentinelEnabled: true,
  radarPersistenceV2Enabled: true,
  radarPersistenceV2CheckpointMs: 30_000,
};

function bar(sym = "AAA"): string {
  return JSON.stringify({
    ev: "A",
    sym,
    v: 20_000,
    o: 10,
    h: 10,
    l: 10,
    c: 10,
    s: T0 - 1000,
    e: T0,
  });
}

function liveBars(): Map<number, SecondBar> {
  const bars = new Map<number, SecondBar>();
  const start = T0 - 5 * 60_000;
  for (let i = 0; i < 300; i++) {
    const startMs = start + i * 1000;
    bars.set(startMs, {
      startMs,
      endMs: startMs + 1000,
      volume: 100,
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      vwap: 10,
      sessionVwap: 10,
      sessionOpen: 10,
      accumulatedVolume: 100,
      dollarVolume: 1000,
      priceComplete: true,
      lateCorrected: false,
      correctionCount: 0,
    });
  }
  return bars;
}

Deno.test("slow 5m history does not block generation publish", async () => {
  let historyStarted = 0;
  let publishes = 0;
  const ac = new AbortController();
  const runtime = startRadarV22({
    env,
    signal: ac.signal,
    nowMs: () => T0,
    sleep: () => new Promise((r) => setTimeout(r, 5)),
    config: mergeRadarConfig({
      sentinelEnabled: true,
      evaluationIntervalMs: 30,
      snapshotRefreshMs: 60_000,
      leaseRenewMs: 60_000,
      globalFeedStaleMs: 60_000,
    }),
    loadExceptions: async () => [],
    health: { applyRadar() {} },
    lease: {
      tryAcquire: async () => true,
      heartbeat: async () => true,
      release: async () => {},
    },
    rpc: async () => {
      publishes += 1;
      return { error: null };
    },
    rpcV2: async () => {
      publishes += 1;
      return { error: null };
    },
    setStatus: async () => ({ error: null }),
    fetch: async (input) => {
      const url = String(input);
      if (url.includes("/range/5/minute/")) {
        historyStarted += 1;
        return new Promise(() => {});
      }
      return new Response(JSON.stringify({ tickers: [] }), { status: 200 });
    },
    connect: (_url, handlers) => {
      const handle: RadarWsHandle = {
        send: (data) => {
          const parsed = JSON.parse(data) as { action?: string };
          if (parsed.action === "auth") {
            handlers.onMessage(JSON.stringify({ ev: "status", status: "auth_success" }));
            handlers.onMessage(bar());
          }
        },
        close: () => handlers.onClose(),
      };
      queueMicrotask(() => handlers.onOpen());
      return handle;
    },
  });

  await new Promise((r) => setTimeout(r, 400));
  ac.abort();
  await runtime.stop();
  assert(historyStarted >= 1, "history fetch should have started");
  assert(publishes >= 2, `expected publish cadence while history hung, got ${publishes}`);
});

Deno.test("failed 5m history does not block generation publish", async () => {
  let publishes = 0;
  const ac = new AbortController();
  const runtime = startRadarV22({
    env,
    signal: ac.signal,
    nowMs: () => T0,
    sleep: () => new Promise((r) => setTimeout(r, 5)),
    config: mergeRadarConfig({
      sentinelEnabled: true,
      evaluationIntervalMs: 30,
      snapshotRefreshMs: 60_000,
      leaseRenewMs: 60_000,
      globalFeedStaleMs: 60_000,
    }),
    loadExceptions: async () => [],
    health: { applyRadar() {} },
    lease: {
      tryAcquire: async () => true,
      heartbeat: async () => true,
      release: async () => {},
    },
    rpc: async () => {
      publishes += 1;
      return { error: null };
    },
    rpcV2: async (args) => {
      publishes += 1;
      for (const row of args.p_candidates) {
        assertEquals(row.rvol_5m, null);
      }
      return { error: null };
    },
    setStatus: async () => ({ error: null }),
    fetch: async (input) => {
      const url = String(input);
      if (url.includes("/range/5/minute/")) {
        return new Response("no", { status: 503 });
      }
      return new Response(JSON.stringify({ tickers: [] }), { status: 200 });
    },
    connect: (_url, handlers) => {
      const handle: RadarWsHandle = {
        send: (data) => {
          const parsed = JSON.parse(data) as { action?: string };
          if (parsed.action === "auth") {
            handlers.onMessage(JSON.stringify({ ev: "status", status: "auth_success" }));
            handlers.onMessage(bar());
          }
        },
        close: () => handlers.onClose(),
      };
      queueMicrotask(() => handlers.onOpen());
      return handle;
    },
  });
  await new Promise((r) => setTimeout(r, 250));
  ac.abort();
  await runtime.stop();
  assert(publishes >= 1);
});

Deno.test("missing history leaves rvol null and a later cycle can enrich it", async () => {
  const schedule = resolveScheduleAt(T0, []);
  assert(schedule);
  const bucket = regularSessionBucketIndex(T0, schedule);
  assert(bucket !== null);
  let release: (bars: { t: number; v: number }[]) => void = () => {};
  const pending = new Promise<{ t: number; v: number }[]>((r) => {
    release = r;
  });
  const cache = createTod5mBaselineCache({
    apiKey: "k",
    exceptions: () => [],
    fetch: async () => {
      const results = await pending;
      return new Response(JSON.stringify({ results }), { status: 200 });
    },
  });
  const warming = cache.warm(["AAA"], "2026-09-24");
  await new Promise((r) => setTimeout(r, 20));
  assertEquals(cache.get("AAA", bucket), null);
  const before = computeMomentumMetrics({
    bars: liveBars(),
    eventNowMs: T0,
    sessionKind: "market",
    schedule,
    todBaseline: cache.get("AAA", bucket),
  });
  assertEquals(before.rvol_5m, null);
  assert(before.volume_velocity !== null);

  const prior = ["2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23"];
  release(prior.map((d) => ({ t: Date.parse(`${d}T18:30:00.000Z`), v: 500 })));
  await warming;
  const baseline = cache.get("AAA", bucket);
  assert(baseline);
  assertEquals(baseline.sampleCount >= 5, true);
  const after = computeMomentumMetrics({
    bars: liveBars(),
    eventNowMs: T0,
    sessionKind: "market",
    schedule,
    todBaseline: baseline,
  });
  assert(after.rvol_5m !== null && after.rvol_5m > 0);
});
