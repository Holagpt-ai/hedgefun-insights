import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeRadarConfig } from "./config.ts";
import { createRadarEngine } from "./engine.ts";
import { rankBoard } from "./rank.ts";
import { activePass, createRadarBook, detectPass } from "./bars.ts";
import { emptyLifecycle, stepLifecycle } from "./lifecycle.ts";
import { validateRadarGeneration } from "./persist.ts";
import {
  parseAggregateEvent,
  reconnectDelayMs,
  wsUrlForMode,
} from "./parse.ts";
import { providerTimestampMs } from "./time.ts";
import type { EligibleQuote, RankedCandidate } from "./types.ts";
import type { RadarV22BoardRow } from "../../../../supabase/functions/_shared/radar-v22/types.ts";
import { createRadarSocket, type RadarWsHandle } from "./ws.ts";
import { createLeaseClient } from "./lease.ts";

const T0 = Date.parse("2026-08-10T14:00:00.000Z"); // 10:00 ET Monday
const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function quote(
  symbol: string,
  overrides: Partial<EligibleQuote> = {},
): EligibleQuote {
  return {
    symbol,
    companyName: symbol,
    regularClose: 10,
    previousClose: 8,
    dayVolume: 2_000_000,
    priorVolume: 100_000,
    dayHigh: 12,
    dayLow: 8,
    volumeRatio: 20,
    changePercent: 25,
    ...overrides,
  };
}

function agg(opts: {
  sym: string;
  s: number;
  v: number;
  c: number;
  o?: number;
  h?: number;
  l?: number;
  vw?: number;
  av?: number;
}): Record<string, unknown> {
  const close = opts.c;
  return {
    ev: "A",
    sym: opts.sym,
    v: opts.v,
    av: opts.av ?? opts.v,
    op: 9.5,
    vw: opts.vw ?? close,
    o: opts.o ?? close,
    c: close,
    h: opts.h ?? close,
    l: opts.l ?? close,
    a: close,
    z: 10,
    s: opts.s,
    e: opts.s + 1_000,
  };
}

function ingestSeconds(
  engine: ReturnType<typeof createRadarEngine>,
  symbol: string,
  fromMs: number,
  count: number,
  volume: number,
  close: number,
  receiveMs: number,
  closeEnd?: number,
  startAv = 0,
): number {
  let last = fromMs;
  let av = startAv;
  for (let i = 0; i < count; i++) {
    const s = fromMs + i * 1_000;
    const px = closeEnd === undefined
      ? close
      : close + (closeEnd - close) * (count === 1 ? 1 : i / (count - 1));
    av += volume;
    engine.ingest(agg({ sym: symbol, s, v: volume, c: px, av }), receiveMs);
    last = s + 1_000;
  }
  return last;
}

function engineWith(symbols: string[]) {
  const engine = createRadarEngine({
    config: mergeRadarConfig(),
    exceptions: [],
  });
  const universe = new Map<string, EligibleQuote>();
  for (const s of symbols) universe.set(s, quote(s));
  engine.setUniverse(universe);
  return engine;
}

Deno.test("providerTimestampMs magnitude bands match market-session", () => {
  const sampleMs = Date.parse("2026-08-10T14:00:00.000Z");
  assertEquals(providerTimestampMs(Math.trunc(sampleMs / 1000)), sampleMs);
  assertEquals(providerTimestampMs(sampleMs), sampleMs);
  assertEquals(providerTimestampMs(sampleMs * 1_000), sampleMs);
  assertEquals(providerTimestampMs(sampleMs * 1_000_000), sampleMs);
  assertEquals(providerTimestampMs(NaN), null);
});

Deno.test("parseAggregateEvent rejects invalid A payloads", () => {
  assertEquals(parseAggregateEvent({ ev: "T", sym: "AAA" }), null);
  assertEquals(
    parseAggregateEvent({
      ev: "A",
      sym: "bad ticker",
      v: 1,
      s: T0,
      e: T0 + 1000,
    }),
    null,
  );
});

Deno.test("five-second window boundaries include exact 5 completed seconds", () => {
  const book = createRadarBook(mergeRadarConfig());
  const tracked = new Set(["AAA"]);
  for (let i = 0; i < 8; i++) {
    book.ingest(
      agg({ sym: "AAA", s: T0 + i * 1000, v: 1000, c: 10 }),
      T0,
      tracked,
    );
  }
  const eventNow = T0 + 5_000;
  const metrics = book.metrics("AAA", eventNow, quote("AAA"))!;
  assertEquals(metrics.vol5s, 5_000);
  assertEquals(metrics.vol15s, 5_000);
});

Deno.test("missing-second volume contributes zero and does not fabricate OHLC", () => {
  const book = createRadarBook(mergeRadarConfig());
  const tracked = new Set(["AAA"]);
  book.ingest(agg({ sym: "AAA", s: T0, v: 4000, c: 10 }), T0, tracked);
  book.ingest(agg({ sym: "AAA", s: T0 + 2000, v: 4000, c: 10.2 }), T0, tracked);
  const metrics = book.metrics("AAA", T0 + 3000, quote("AAA"))!;
  assertEquals(metrics.vol5s, 8_000);
  assertEquals(metrics.move15s.complete, false);
});

Deno.test("incomplete price evidence cannot detect or activate", () => {
  const config = mergeRadarConfig();
  const book = createRadarBook(config);
  const tracked = new Set(["AAA"]);
  for (let i = 0; i < 5; i++) {
    book.ingest(
      agg({ sym: "AAA", s: T0 + i * 1000, v: 30_000, c: 10 }),
      T0,
      tracked,
    );
  }
  const metrics = book.metrics("AAA", T0 + 5_000, quote("AAA"))!;
  assertEquals(metrics.vol60s >= 50_000, true);
  assertEquals(metrics.move15s.complete, false);
  assertEquals(detectPass(true, metrics, config), false);
  assertEquals(activePass(true, metrics, config), false);
});

Deno.test("duplicate event does not double volume", () => {
  const engine = engineWith(["AAA"]);
  const event = agg({ sym: "AAA", s: T0, v: 10_000, c: 10 });
  engine.ingest(event, T0);
  engine.ingest(event, T0 + 10);
  assertEquals(engine.counters().duplicateCount, 1);
  ingestSeconds(engine, "AAA", T0 + 1000, 20, 10_000, 10.1, T0 + 100);
  const board = engine.evaluate(T0 + 200, GEN);
  assert(board.counters.duplicateCount === 1);
});

Deno.test("corrected event updates stored volume by delta", () => {
  const book = createRadarBook(mergeRadarConfig());
  const tracked = new Set(["AAA"]);
  book.ingest(agg({ sym: "AAA", s: T0, v: 10_000, c: 10 }), T0, tracked);
  const first = book.ingest(
    agg({ sym: "AAA", s: T0, v: 25_000, c: 10 }),
    T0 + 100,
    tracked,
  );
  assertEquals(first.accepted, true);
  if (first.accepted) assertEquals(first.kind, "correction");
  const metrics = book.metrics("AAA", T0 + 1000, quote("AAA"))!;
  assertEquals(metrics.vol5s, 25_000);
});

Deno.test("late correction updates evidence but cannot create a live signal", () => {
  const engine = engineWith(["AAA"]);
  engine.ingest(agg({ sym: "AAA", s: T0, v: 1_000, c: 10 }), T0);
  for (let i = 1; i < 20; i++) {
    engine.ingest(
      agg({ sym: "AAA", s: T0 + i * 1000, v: 1_000, c: 10 }),
      T0 + i * 1000,
    );
  }
  const late = engine.ingest(
    agg({ sym: "AAA", s: T0, v: 200_000, c: 10.5 }),
    T0 + 20_000,
  );
  assertEquals(late.accepted, true);
  if (late.accepted) assertEquals(late.kind, "late_correction");
  const result = engine.evaluate(T0 + 20_100, GEN);
  assertEquals(result.board.rows.length, 0);
  assertEquals(engine.counters().correctionCount >= 1, true);
});

Deno.test("out-of-order event is counted and still applied", () => {
  const engine = engineWith(["AAA"]);
  engine.ingest(agg({ sym: "AAA", s: T0 + 2000, v: 5_000, c: 10 }), T0);
  const ooo = engine.ingest(
    agg({ sym: "AAA", s: T0, v: 5_000, c: 9.9 }),
    T0 + 10,
  );
  assertEquals(ooo.accepted, true);
  if (ooo.accepted) assertEquals(ooo.kind, "out_of_order");
  assertEquals(engine.counters().outOfOrderCount, 1);
});

Deno.test("100,000-share tier boundary ranks above sub-tier volume", () => {
  const config = mergeRadarConfig();
  const a: RankedCandidate = {
    symbol: "AAA",
    lifecycle: "ACTIVE",
    vol5s: 90_000,
    vol15s: 90_000,
    vol60s: 99_999,
    dollarVol60s: 9e9,
    sessionVolume: 9e9,
    acceleration5m: 10,
    freshnessAgeMs: null,
    lastPrice: 10,
    changePercent: 20,
    priorVolume: 1,
    volumeRatio: 10,
    dayHigh: 11,
    dayLow: 9,
    sessionVwap: 10,
    peakVol15: 90_000,
    companyName: "AAA",
    providerAsOfMs: T0,
  };
  const b: RankedCandidate = {
    ...a,
    symbol: "BBB",
    lifecycle: "DETECTED",
    vol5s: 1,
    vol15s: 1,
    vol60s: 100_000,
    dollarVol60s: 1,
    sessionVolume: 1,
    acceleration5m: null,
  };
  const ranked = rankBoard([a, b], config);
  assertEquals(ranked[0].symbol, "BBB");
});

Deno.test("volume-first ranking ignores lifecycle until later keys", () => {
  const config = mergeRadarConfig();
  const cooler: RankedCandidate = {
    symbol: "ZZZ",
    lifecycle: "COOLING",
    vol5s: 10,
    vol15s: 10,
    vol60s: 200_000,
    dollarVol60s: 1,
    sessionVolume: 1,
    acceleration5m: null,
    freshnessAgeMs: null,
    lastPrice: 10,
    changePercent: 20,
    priorVolume: 1,
    volumeRatio: 10,
    dayHigh: 11,
    dayLow: 9,
    sessionVwap: 10,
    peakVol15: 10,
    companyName: null,
    providerAsOfMs: T0,
  };
  const activeLow: RankedCandidate = {
    ...cooler,
    symbol: "AAA",
    lifecycle: "ACTIVE",
    vol60s: 150_000,
  };
  const ranked = rankBoard([activeLow, cooler], config);
  assertEquals(ranked[0].symbol, "ZZZ");
});

Deno.test("symbol tie-break is ascending", () => {
  const config = mergeRadarConfig();
  const base: RankedCandidate = {
    symbol: "BBB",
    lifecycle: "ACTIVE",
    vol5s: 10,
    vol15s: 10,
    vol60s: 100_000,
    dollarVol60s: 10,
    sessionVolume: 10,
    acceleration5m: null,
    freshnessAgeMs: null,
    lastPrice: 10,
    changePercent: 20,
    priorVolume: 1,
    volumeRatio: 10,
    dayHigh: 11,
    dayLow: 9,
    sessionVwap: 10,
    peakVol15: 10,
    companyName: null,
    providerAsOfMs: T0,
  };
  const ranked = rankBoard([base, { ...base, symbol: "AAA" }], config);
  assertEquals(ranked[0].symbol, "AAA");
  assertEquals(ranked[1].symbol, "BBB");
});

function primeActive(
  engine: ReturnType<typeof createRadarEngine>,
  symbol: string,
) {
  ingestSeconds(engine, symbol, T0, 20, 20_000, 10.0, T0 + 50, 10.08);
  engine.evaluate(T0 + 100, "11111111-1111-4111-8111-111111111111");
  engine.evaluate(T0 + 200, "22222222-2222-4222-8222-222222222222");
  return engine.evaluate(T0 + 300, "33333333-3333-4333-8333-333333333333");
}

Deno.test("DETECTED progression on first consecutive detect pass", () => {
  const engine = engineWith(["AAA"]);
  ingestSeconds(engine, "AAA", T0, 20, 8_000, 10.0, T0, 10.01);
  const result = engine.evaluate(T0 + 50, GEN);
  assertEquals(result.board.rows.length, 1);
  assertEquals(result.board.rows[0].lifecycle, "DETECTED");
  assertEquals(result.board.rows[0].signal_status, "BUILDING");
});

Deno.test("CONFIRMING progression on second consecutive detect pass", () => {
  const engine = engineWith(["AAA"]);
  ingestSeconds(engine, "AAA", T0, 20, 8_000, 10.0, T0, 10.01);
  engine.evaluate(T0 + 50, GEN);
  const result = engine.evaluate(T0 + 100, GEN);
  assertEquals(result.board.rows[0].lifecycle, "CONFIRMING");
  assertEquals(result.board.rows[0].signal_status, "CONFIRMING");
});

Deno.test("ACTIVE progression after three consecutive active passes", () => {
  const engine = engineWith(["AAA"]);
  const result = primeActive(engine, "AAA");
  assertEquals(result.board.rows[0].lifecycle, "ACTIVE");
  assertEquals(result.board.rows[0].signal_status, "EXPLOSIVE");
});

Deno.test("COOLING after three failed active evals with collapsed 15s volume", () => {
  const engine = engineWith(["AAA"]);
  primeActive(engine, "AAA");
  ingestSeconds(
    engine,
    "AAA",
    T0 + 20_000,
    70,
    100,
    10.08,
    T0 + 400,
    10.08,
    20 * 20_000,
  );
  engine.evaluate(T0 + 500, GEN);
  engine.evaluate(T0 + 600, GEN);
  const result = engine.evaluate(T0 + 700, GEN);
  assertEquals(result.board.rows[0]?.lifecycle, "COOLING");
  assertEquals(result.board.rows[0]?.signal_status, "COOLING");
});

Deno.test("ARCHIVED after cooling window and low 60s activity", () => {
  const config = mergeRadarConfig({
    archiveCoolingMs: 5_000,
    archiveLowActivityEvals: 2,
  });
  const engine = createRadarEngine({ config, exceptions: [] });
  engine.setUniverse(new Map([["AAA", quote("AAA")]]));
  ingestSeconds(engine, "AAA", T0, 20, 20_000, 10.0, T0, 10.08);
  engine.evaluate(T0 + 50, GEN);
  engine.evaluate(T0 + 60, GEN);
  engine.evaluate(T0 + 70, GEN);
  ingestSeconds(
    engine,
    "AAA",
    T0 + 20_000,
    70,
    50,
    10.08,
    T0 + 100,
    10.08,
    20 * 20_000,
  );
  engine.evaluate(T0 + 200, GEN);
  engine.evaluate(T0 + 300, GEN);
  engine.evaluate(T0 + 400, GEN);
  const coolingAt = T0 + 400;
  // Advance provider event time past archiveCoolingMs; wall clock must not
  // be the authority for cooling duration.
  ingestSeconds(
    engine,
    "AAA",
    T0 + 90_000,
    8,
    50,
    10.08,
    coolingAt + 6_000,
    10.08,
    20 * 20_000 + 70 * 50,
  );
  engine.evaluate(coolingAt + 6_000, GEN);
  const archived = engine.evaluate(coolingAt + 7_000, GEN);
  assertEquals(archived.board.rows.length, 0);
  assertEquals(archived.board.archives.length >= 1, true);
  assertEquals(archived.board.archives[0]?.lifecycle, "ARCHIVED");
});

Deno.test("REACTIVATED after three consecutive active passes from cooling", () => {
  const engine = engineWith(["AAA"]);
  primeActive(engine, "AAA");
  ingestSeconds(
    engine,
    "AAA",
    T0 + 20_000,
    70,
    100,
    10.08,
    T0 + 400,
    10.08,
    20 * 20_000,
  );
  engine.evaluate(T0 + 500, GEN);
  engine.evaluate(T0 + 600, GEN);
  engine.evaluate(T0 + 700, GEN);
  ingestSeconds(engine, "AAA", T0 + 90_000, 20, 20_000, 10.08, T0 + 800, 10.2);
  engine.evaluate(T0 + 850, GEN);
  engine.evaluate(T0 + 900, GEN);
  const result = engine.evaluate(T0 + 950, GEN);
  assertEquals(result.board.rows[0]?.lifecycle, "REACTIVATED");
  assertEquals(result.board.rows[0]?.signal_status, "REACTIVATED");
});

Deno.test("stale freeze keeps last verified ordering and overlays STALE", () => {
  const engine = engineWith(["AAA", "BBB"]);
  ingestSeconds(engine, "AAA", T0, 20, 25_000, 10.4, T0);
  ingestSeconds(engine, "BBB", T0, 20, 20_000, 10.3, T0);
  engine.evaluate(T0 + 50, GEN);
  engine.evaluate(T0 + 60, GEN);
  const live = engine.evaluate(T0 + 70, GEN);
  const liveSymbols = live.board.rows.map((r) => r.symbol);
  const stale = engine.evaluate(T0 + 70 + 16_000, GEN);
  assertEquals(stale.staleTransition, true);
  assertEquals(stale.board.feedStale, true);
  assertEquals(stale.board.rows.map((r) => r.symbol), liveSymbols);
  assert(stale.board.rows.every((r) => r.signal_status === "STALE"));
  const frozen = engine.evaluate(T0 + 70 + 20_000, GEN);
  assertEquals(frozen.published, false);
  assertEquals(frozen.board.rows.map((r) => r.symbol), liveSymbols);
});

Deno.test("session reset clears active lifecycle and keeps archive history in payload empty for new session", () => {
  const engine = engineWith(["AAA"]);
  primeActive(engine, "AAA");
  const nextSession = Date.parse("2026-08-11T14:00:00.000Z");
  const reset = engine.evaluate(nextSession, GEN);
  assertEquals(reset.sessionReset, true);
  assertEquals(reset.board.rows.length, 0);
  assertEquals(reset.board.sessionDate, "2026-08-11");
});

Deno.test("early close stops new signals after regular close", () => {
  const engine = createRadarEngine({
    config: mergeRadarConfig(),
    exceptions: [{
      session_date: "2026-08-10",
      market_status: "early_close",
      regular_open_et: "09:30:00",
      regular_close_et: "13:00:00",
      after_hours_end_et: "17:00:00",
      holiday_name: "Test",
    }],
  });
  engine.setUniverse(new Map([["AAA", quote("AAA")]]));
  const afterClose = Date.parse("2026-08-10T17:30:00.000Z"); // 13:30 ET
  ingestSeconds(engine, "AAA", afterClose, 20, 20_000, 10.4, afterClose);
  const result = engine.evaluate(afterClose + 50, GEN);
  assertEquals(result.published, false);
  assertEquals(result.board.rows.length, 0);
});

Deno.test("atomic publication rejects duplicate symbols and non-contiguous ranks", () => {
  const row = (rank: number, symbol: string): RadarV22BoardRow => ({
    generation_id: GEN,
    rank,
    symbol,
    company_name: symbol,
    lifecycle: "ACTIVE",
    signal_status: "EXPLOSIVE",
    price: 10,
    change_percent: 12,
    volume: 1000,
    prior_session_volume: 100,
    volume_ratio_prior_session: 10,
    day_high: 11,
    day_low: 9,
    rolling_volume_5s: 10,
    rolling_volume_15s: 20,
    rolling_volume_60s: 100_000,
    rolling_dollar_volume_60s: 1_000_000,
    acceleration_5m: null,
    session_vwap: 10,
    peak_volume_15s: 20,
    provider_as_of: "2026-08-10T14:00:01.000Z",
    updated_at: "2026-08-10T14:00:05.000Z",
  });
  assertEquals(
    validateRadarGeneration(
      [row(1, "AAA"), row(2, "AAA")],
      GEN,
      "2026-08-10",
      "2026-08-10T14:00:05.000Z",
      "available",
    ),
    false,
  );
  assertEquals(
    validateRadarGeneration(
      [row(1, "AAA"), row(3, "BBB")],
      GEN,
      "2026-08-10",
      "2026-08-10T14:00:05.000Z",
      "available",
    ),
    false,
  );
  assertEquals(
    validateRadarGeneration(
      [row(1, "AAA"), row(2, "BBB")],
      GEN,
      "2026-08-10",
      "2026-08-10T14:00:05.000Z",
      "available",
    ),
    true,
  );
});

Deno.test("wsUrlForMode selects delayed vs realtime hosts", () => {
  assertEquals(wsUrlForMode("delayed"), "wss://delayed.massive.com/stocks");
  assertEquals(wsUrlForMode("realtime"), "wss://socket.massive.com/stocks");
});

Deno.test("reconnect delay is bounded with jitter", () => {
  const config = mergeRadarConfig({
    reconnectBaseDelayMs: 500,
    reconnectMaxDelayMs: 4_000,
    reconnectJitter: 0,
  });
  assertEquals(reconnectDelayMs(1, config, () => 0.5), 500);
  assertEquals(reconnectDelayMs(5, config, () => 0.5), 4_000);
});

Deno.test("reconnect reauthenticates and resubscribes", async () => {
  const sends: string[] = [];
  let closes = 0;
  const box: { handle: RadarWsHandle | null } = { handle: null };
  const socket = createRadarSocket({
    mode: "delayed",
    apiKey: "secret-key",
    config: mergeRadarConfig({
      reconnectBaseDelayMs: 1,
      reconnectMaxDelayMs: 1,
      reconnectJitter: 0,
    }),
    sleep: () => Promise.resolve(),
    nowMs: () => T0,
    connect: (_url, handlers) => {
      const handle: RadarWsHandle = {
        send: (data) => {
          const parsed = JSON.parse(data) as { action?: string };
          sends.push(parsed.action ?? "");
          if (parsed.action === "auth") {
            handlers.onMessage(
              JSON.stringify([{ ev: "status", status: "auth_success" }]),
            );
          }
        },
        close: () => {
          closes += 1;
          handlers.onClose();
        },
      };
      box.handle = handle;
      queueMicrotask(() => handlers.onOpen());
      return handle;
    },
    onEvent: () => {},
    onState: () => {},
    onReconnect: () => {},
    shouldRun: () => sends.filter((a) => a === "auth").length < 2,
  });
  socket.start();
  await new Promise((r) => setTimeout(r, 20));
  box.handle?.close();
  await new Promise((r) => setTimeout(r, 20));
  socket.stop();
  assert(sends.filter((a) => a === "auth").length >= 1);
  assert(sends.filter((a) => a === "subscribe").length >= 1);
  assert(!sends.some((s) => s.includes("secret-key")));
  assertEquals(closes >= 1, true);
});

Deno.test("duplicate-consumer lease: second holder is rejected", async () => {
  let heldBy: string | null = "worker-a";
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      p_holder_id?: string;
    };
    if (url.includes("try_acquire_radar_v22_lease_v1")) {
      if (heldBy === null || heldBy === body.p_holder_id) {
        heldBy = body.p_holder_id ?? "x";
        return new Response("true", { status: 200 });
      }
      return new Response("false", { status: 200 });
    }
    return new Response("true", { status: 200 });
  };
  const client = createLeaseClient({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service",
    fetch: fetchImpl,
  });
  assertEquals(await client.tryAcquire("worker-a", 15_000), true);
  assertEquals(await client.tryAcquire("worker-b", 15_000), false);
});

Deno.test("lifecycle helper: first detect is DETECTED, second CONFIRMING, third active is ACTIVE", () => {
  const config = mergeRadarConfig();
  const metrics = {
    symbol: "AAA",
    vol5s: 20_000,
    vol15s: 40_000,
    vol60s: 120_000,
    dollarVol60s: 1,
    sessionVolume: 1,
    sessionHigh: 11,
    sessionLow: 9,
    sessionVwap: 10,
    lastPrice: 10,
    move15s: { movePct: 0.4, complete: true },
    move60s: { movePct: 0.8, complete: true },
    acceleration5m: null,
    providerLagMs: 0,
    lastBarEndMs: T0,
    lastBarStartMs: T0 - 1000,
    lateCorrectionInWindows: false,
    barCount: 20,
  };
  let rec = emptyLifecycle("2026-08-10");
  rec = stepLifecycle(rec, {
    sessionDate: "2026-08-10",
    eventNowMs: T0,
    wallNowMs: T0,
    detect: true,
    active: true,
    metrics,
    lateBlocksNewSignal: false,
    config,
  }).record;
  assertEquals(rec.phase, "DETECTED");
  rec = stepLifecycle(rec, {
    sessionDate: "2026-08-10",
    eventNowMs: T0 + 5000,
    wallNowMs: T0 + 5000,
    detect: true,
    active: true,
    metrics,
    lateBlocksNewSignal: false,
    config,
  }).record;
  assertEquals(rec.phase, "CONFIRMING");
  rec = stepLifecycle(rec, {
    sessionDate: "2026-08-10",
    eventNowMs: T0 + 10000,
    wallNowMs: T0 + 10000,
    detect: true,
    active: true,
    metrics,
    lateBlocksNewSignal: false,
    config,
  }).record;
  assertEquals(rec.phase, "ACTIVE");
});
