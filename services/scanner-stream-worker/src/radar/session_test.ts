import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CalendarExceptionRow } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  REPLACE_RADAR_RPC,
  validateRadarGeneration,
  type ReplaceRadarArgs,
} from "./persist.ts";
import { mergeRadarConfig } from "./config.ts";
import {
  createRadarEngine,
  persistableGeneration,
} from "./engine.ts";
import {
  inclusiveSessionKindAt,
  previousIsoDate,
  radarSessionKindAt,
  shouldHardResetSurveillance,
  surveillanceDateAt,
} from "./session.ts";
import type { EligibleQuote } from "./types.ts";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** 2026-08-10 is a Monday; August is EDT (UTC-4). */
const ET = {
  mon0359: Date.parse("2026-08-10T07:59:00.000Z"),
  mon0359999: Date.parse("2026-08-10T07:59:59.999Z"),
  mon0400: Date.parse("2026-08-10T08:00:00.000Z"),
  mon092959: Date.parse("2026-08-10T13:29:59.000Z"),
  mon092959999: Date.parse("2026-08-10T13:29:59.999Z"),
  mon0930: Date.parse("2026-08-10T13:30:00.000Z"),
  mon1000: Date.parse("2026-08-10T14:00:00.000Z"),
  mon155959999: Date.parse("2026-08-10T19:59:59.999Z"),
  mon1600: Date.parse("2026-08-10T20:00:00.000Z"),
  mon1600p1: Date.parse("2026-08-10T20:00:00.001Z"),
  mon1630: Date.parse("2026-08-10T20:30:00.000Z"),
  mon1900: Date.parse("2026-08-10T23:00:00.000Z"),
  mon195959999: Date.parse("2026-08-10T23:59:59.999Z"),
  mon2000: Date.parse("2026-08-11T00:00:00.000Z"),
  mon2000p1: Date.parse("2026-08-11T00:00:00.001Z"),
  tue0030: Date.parse("2026-08-11T04:30:00.000Z"),
  tue0359: Date.parse("2026-08-11T07:59:00.000Z"),
  tue0400: Date.parse("2026-08-11T08:00:00.000Z"),
  sat1000: Date.parse("2026-08-08T14:00:00.000Z"),
  labor1000: Date.parse("2026-09-07T14:00:00.000Z"),
  early125959999: Date.parse("2026-08-10T16:59:59.999Z"),
  early1330: Date.parse("2026-08-10T17:30:00.000Z"),
  early1300: Date.parse("2026-08-10T17:00:00.000Z"),
  early1300p1: Date.parse("2026-08-10T17:00:00.001Z"),
};

const EARLY_CLOSE: CalendarExceptionRow[] = [{
  session_date: "2026-08-10",
  market_status: "early_close",
  regular_open_et: "09:30:00",
  regular_close_et: "13:00:00",
  after_hours_end_et: "20:00:00",
  holiday_name: "Test Early Close",
}];

const HOLIDAY: CalendarExceptionRow[] = [{
  session_date: "2026-09-07",
  market_status: "closed",
  regular_open_et: "09:30:00",
  regular_close_et: "16:00:00",
  after_hours_end_et: "20:00:00",
  holiday_name: "Labor Day",
}];

function agg(opts: {
  sym: string;
  s: number;
  v: number;
  c: number;
}): Record<string, unknown> {
  const close = opts.c;
  return {
    ev: "A",
    sym: opts.sym,
    v: opts.v,
    av: opts.v,
    op: close,
    vw: close,
    o: close,
    c: close,
    h: close,
    l: close,
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
): void {
  for (let i = 0; i < count; i++) {
    const s = fromMs + i * 1_000;
    engine.ingest(agg({ sym: symbol, s, v: volume, c: close }), receiveMs);
  }
}

function quote(symbol: string): EligibleQuote {
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
  };
}

function sentinelEngine(exceptions: CalendarExceptionRow[] | null = []) {
  const engine = createRadarEngine({
    config: mergeRadarConfig({ sentinelEnabled: true }),
    exceptions,
  });
  engine.setUniverse(new Map([["AAA", quote("AAA")], ["BBB", quote("BBB")]]));
  return engine;
}

function legacyEngine(exceptions: CalendarExceptionRow[] | null = []) {
  const engine = createRadarEngine({
    config: mergeRadarConfig({ sentinelEnabled: false }),
    exceptions,
  });
  engine.setUniverse(new Map([["AAA", quote("AAA")]]));
  return engine;
}

function rpcKeys(args: ReplaceRadarArgs): string[] {
  return Object.keys(args).sort();
}

Deno.test("surveillance date rolls at 04:00 ET not midnight", () => {
  assertEquals(previousIsoDate("2026-08-11"), "2026-08-10");
  assertEquals(surveillanceDateAt(ET.mon0359), "2026-08-09");
  assertEquals(surveillanceDateAt(ET.mon0400), "2026-08-10");
  assertEquals(surveillanceDateAt(ET.tue0030), "2026-08-10");
  assertEquals(surveillanceDateAt(ET.tue0359), "2026-08-10");
  assertEquals(surveillanceDateAt(ET.tue0400), "2026-08-11");
  assertEquals(
    shouldHardResetSurveillance({
      lastSurveillanceDate: "2026-08-10",
      surveillanceDate: "2026-08-10",
      kind: "closed",
    }),
    false,
  );
  assertEquals(
    shouldHardResetSurveillance({
      lastSurveillanceDate: "2026-08-10",
      surveillanceDate: "2026-08-11",
      kind: "pre-market",
    }),
    true,
  );
  assertEquals(
    shouldHardResetSurveillance({
      lastSurveillanceDate: "2026-08-10",
      surveillanceDate: "2026-08-11",
      kind: "closed",
    }),
    false,
  );
});

Deno.test("1-8. weekday half-open session boundaries", () => {
  assertEquals(radarSessionKindAt(ET.mon0359999, []), "closed");
  assertEquals(radarSessionKindAt(ET.mon0400, []), "pre-market");
  assertEquals(radarSessionKindAt(ET.mon092959999, []), "pre-market");
  assertEquals(radarSessionKindAt(ET.mon0930, []), "market");
  assertEquals(radarSessionKindAt(ET.mon155959999, []), "market");
  assertEquals(radarSessionKindAt(ET.mon1600, []), "after-hours");
  assertEquals(radarSessionKindAt(ET.mon195959999, []), "after-hours");
  assertEquals(radarSessionKindAt(ET.mon2000, []), "closed");
});

Deno.test("8. weekend remains CLOSED", () => {
  assertEquals(radarSessionKindAt(ET.sat1000, []), "closed");
  const engine = sentinelEngine();
  ingestSeconds(engine, "AAA", ET.sat1000, 5, 20_000, 5, ET.sat1000);
  const result = engine.evaluate(ET.sat1000 + 50, GEN);
  assertEquals(result.sessionKind, "closed");
  assertEquals(result.liveSurveillance, false);
  assertEquals(result.published, false);
});

Deno.test("9. market holiday remains CLOSED", () => {
  assertEquals(radarSessionKindAt(ET.labor1000, HOLIDAY), "closed");
  const engine = sentinelEngine(HOLIDAY);
  ingestSeconds(engine, "AAA", ET.labor1000, 5, 20_000, 5, ET.labor1000);
  const result = engine.evaluate(ET.labor1000 + 50, GEN);
  assertEquals(result.sessionKind, "closed");
  assertEquals(result.liveSurveillance, false);
  assertEquals(result.published, false);
});

Deno.test("9-10. early-close RTH ends at exception close; AH starts at that instant", () => {
  assertEquals(radarSessionKindAt(ET.early125959999, EARLY_CLOSE), "market");
  assertEquals(radarSessionKindAt(ET.early1300, EARLY_CLOSE), "after-hours");
  assertEquals(radarSessionKindAt(ET.early1330, EARLY_CLOSE), "after-hours");
  const engine = sentinelEngine(EARLY_CLOSE);
  ingestSeconds(engine, "AAA", ET.early1330, 5, 20_000, 5, ET.early1330);
  const ah = engine.evaluate(ET.early1330 + 50, GEN);
  assertEquals(ah.sessionKind, "after-hours");
  assertEquals(ah.liveSurveillance, true);
  assertEquals(engine.isPromoted("AAA"), true);
});

Deno.test("1-4. engine sessionKind at 03:59:59.999 / 04:00 / 09:29:59.999 / 09:30", () => {
  const engine = sentinelEngine();
  assertEquals(engine.evaluate(ET.mon0359999, GEN).sessionKind, "closed");
  assertEquals(engine.evaluate(ET.mon0400, GEN).sessionKind, "pre-market");
  assertEquals(engine.evaluate(ET.mon092959999, GEN).sessionKind, "pre-market");
  assertEquals(engine.evaluate(ET.mon0930, GEN).sessionKind, "market");
});

Deno.test("5-8. regularClose and afterHoursEnd engine transitions are half-open", () => {
  const engine = sentinelEngine();
  ingestSeconds(
    engine,
    "AAA",
    ET.mon155959999 - 4_000,
    5,
    20_000,
    5,
    ET.mon155959999,
  );
  const rth = engine.evaluate(ET.mon155959999, GEN);
  assertEquals(rth.sessionKind, "market");
  assertEquals(rth.liveSurveillance, true);
  engine.ingest(
    agg({ sym: "AAA", s: ET.mon1600, v: 1_000, c: 5 }),
    ET.mon1600,
  );
  const ah = engine.evaluate(ET.mon1600, GEN);
  assertEquals(ah.sessionKind, "after-hours");
  assertEquals(ah.liveSurveillance, true);
  assertEquals(ah.sessionTransition, "soft_rth_ah");
  engine.ingest(
    agg({ sym: "AAA", s: ET.mon195959999, v: 1_000, c: 5 }),
    ET.mon195959999,
  );
  const stillAh = engine.evaluate(ET.mon195959999, GEN);
  assertEquals(stillAh.sessionKind, "after-hours");
  const closed = engine.evaluate(ET.mon2000, GEN);
  assertEquals(closed.sessionKind, "closed");
  assertEquals(closed.liveSurveillance, false);
  assertEquals(closed.sessionTransition, "park_closed");
});

Deno.test("12. 04:00 new surveillance day hard-resets Sentinel and Stage-2", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "AAA", ET.mon1900, 5, 20_000, 5, ET.mon1900);
  const ah = engine.evaluate(ET.mon1900 + 50, GEN);
  assertEquals(ah.sessionKind, "after-hours");
  assertEquals(engine.isPromoted("AAA"), true);
  assertEquals(engine.hasSentinel("AAA"), true);
  const reset = engine.evaluate(ET.tue0400, GEN);
  assertEquals(reset.sessionKind, "pre-market");
  assertEquals(reset.sessionReset, true);
  assertEquals(reset.sessionTransition, "hard_reset");
  assertEquals(reset.surveillanceDate, "2026-08-11");
  assertEquals(engine.isPromoted("AAA"), false);
  assertEquals(engine.hasSentinel("AAA"), false);
  assertEquals(engine.hasRadarBook("AAA"), false);
  assertEquals(reset.board.rows.length, 0);
  const persist = persistableGeneration(reset);
  assertEquals(persist.status, "empty");
  assertEquals(persist.rows.length, 0);
});

Deno.test("13. ET midnight does not hard-reset the trading day", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "AAA", ET.mon1900, 5, 20_000, 5, ET.mon1900);
  engine.evaluate(ET.mon1900 + 50, GEN);
  assertEquals(engine.isPromoted("AAA"), true);
  const midnight = engine.evaluate(ET.tue0030, GEN);
  assertEquals(midnight.sessionKind, "closed");
  assertEquals(midnight.sessionReset, false);
  assertEquals(midnight.sessionTransition, "park_closed");
  assertEquals(midnight.surveillanceDate, "2026-08-10");
  assertEquals(engine.isPromoted("AAA"), true);
  assertEquals(engine.hasSentinel("AAA"), true);
  const stillClosed = engine.evaluate(ET.tue0359, GEN);
  assertEquals(stillClosed.sessionReset, false);
  assertEquals(engine.isPromoted("AAA"), true);
});

Deno.test("14-16. PM→RTH is a soft transition that carries promoted identity", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "AAA", ET.mon092959 - 4_000, 5, 20_000, 5, ET.mon092959);
  const pm = engine.evaluate(ET.mon092959, GEN);
  assertEquals(pm.sessionKind, "pre-market");
  assertEquals(pm.liveSurveillance, true);
  assertEquals(engine.isPromoted("AAA"), true);
  const books = engine.bookBarCount("AAA");
  const rth = engine.evaluate(ET.mon0930, GEN);
  assertEquals(rth.sessionKind, "market");
  assertEquals(rth.sessionTransition, "soft_pm_rth");
  assertEquals(rth.sessionReset, false);
  assert(rth.subsessionEpoch >= 1);
  assertEquals(engine.isPromoted("AAA"), true);
  assertEquals(engine.hasRadarBook("AAA"), true);
  assertEquals(engine.bookBarCount("AAA"), books);
});

Deno.test("15-16. RTH→AH is a soft transition that carries promoted identity", () => {
  const engine = sentinelEngine();
  ingestSeconds(
    engine,
    "AAA",
    ET.mon155959999 - 4_000,
    5,
    20_000,
    5,
    ET.mon155959999,
  );
  const rth = engine.evaluate(ET.mon155959999, GEN);
  assertEquals(rth.sessionKind, "market");
  assertEquals(engine.isPromoted("AAA"), true);
  engine.ingest(
    agg({ sym: "AAA", s: ET.mon1600, v: 1_000, c: 5 }),
    ET.mon1600,
  );
  const ah = engine.evaluate(ET.mon1600, GEN);
  assertEquals(ah.sessionKind, "after-hours");
  assertEquals(ah.sessionTransition, "soft_rth_ah");
  assertEquals(ah.sessionReset, false);
  assertEquals(engine.isPromoted("AAA"), true);
  assertEquals(engine.hasRadarBook("AAA"), true);
});

Deno.test("17. new AH tape activity can promote a candidate", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "AAA", ET.mon1000, 5, 20_000, 5, ET.mon1000);
  engine.evaluate(ET.mon1000 + 50, GEN);
  engine.ingest(
    agg({ sym: "AAA", s: ET.mon1600p1, v: 1_000, c: 5 }),
    ET.mon1600p1,
  );
  engine.evaluate(ET.mon1600p1, GEN);
  assertEquals(engine.isPromoted("BBB"), false);
  ingestSeconds(engine, "BBB", ET.mon1630, 5, 20_000, 5, ET.mon1630);
  const ah = engine.evaluate(ET.mon1630 + 50, GEN);
  assertEquals(ah.sessionKind, "after-hours");
  assertEquals(ah.liveSurveillance, true);
  assertEquals(engine.isPromoted("BBB"), true);
  assertEquals(engine.hasRadarBook("BBB"), true);
});

Deno.test("18-19. delayed provider events do not false-expire across session operation", () => {
  const engine = createRadarEngine({
    config: mergeRadarConfig({ sentinelEnabled: true, sentinelTtlMs: 2_000 }),
    exceptions: [],
  });
  const delay = 15 * 60 * 1000;
  const eventBase = ET.mon0930 - delay;
  const wall = ET.mon0930;
  for (let i = 0; i < 8; i++) {
    engine.ingest(
      agg({ sym: "DLY", s: eventBase + i * 1_000, v: 20_000, c: 5 }),
      wall + i * 1_000,
    );
  }
  const result = engine.evaluate(wall + 8_000, GEN);
  assertEquals(result.sessionKind, "market");
  assertEquals(result.staleTransition, false);
  assertEquals(engine.isPromoted("DLY"), true);
  assertEquals(engine.hasRadarBook("DLY"), true);
});

Deno.test("20. legacy Sentinel-disabled mode stays RTH-only", () => {
  const engine = legacyEngine();
  ingestSeconds(engine, "AAA", ET.mon0400, 20, 20_000, 10.4, ET.mon0400);
  const pm = engine.evaluate(ET.mon0400 + 50, GEN);
  assertEquals(pm.published, false);
  assertEquals(pm.liveSurveillance, false);
  assertEquals(pm.sessionKind, "pre-market");

  ingestSeconds(engine, "AAA", ET.mon1000, 20, 20_000, 10.4, ET.mon1000);
  const rth = engine.evaluate(ET.mon1000 + 50, GEN);
  assertEquals(rth.liveSurveillance, true);
  assertEquals(rth.sessionKind, "market");

  ingestSeconds(engine, "AAA", ET.mon1600 - 1_000, 1, 20_000, 10.4, ET.mon1600);
  const atClose = engine.evaluate(ET.mon1600, GEN);
  assertEquals(atClose.sessionKind, "market");
  assertEquals(atClose.liveSurveillance, true);
  assertEquals(inclusiveSessionKindAt(ET.mon1600, []), "market");
  assertEquals(radarSessionKindAt(ET.mon1600, []), "after-hours");

  const ah = engine.evaluate(ET.mon1630, GEN);
  assertEquals(ah.published, false);
  assertEquals(ah.liveSurveillance, false);
  assertEquals(ah.sessionKind, "after-hours");

  const early = legacyEngine(EARLY_CLOSE);
  ingestSeconds(early, "AAA", ET.early1330, 20, 20_000, 10.4, ET.early1330);
  const afterEarly = early.evaluate(ET.early1330 + 50, GEN);
  assertEquals(afterEarly.published, false);
  assertEquals(afterEarly.board.rows.length, 0);
});

Deno.test("21. persistence RPC contract keys and name are unchanged", () => {
  assertEquals(REPLACE_RADAR_RPC, "replace_radar_v22_generation_v1");
  const engine = sentinelEngine();
  ingestSeconds(engine, "AAA", ET.mon1000, 20, 20_000, 10.4, ET.mon1000);
  engine.evaluate(ET.mon1000 + 50, GEN);
  engine.evaluate(ET.mon1000 + 60, GEN);
  const result = engine.evaluate(ET.mon1000 + 70, GEN);
  const persist = persistableGeneration(result);
  const args: ReplaceRadarArgs = {
    p_generation_id: GEN,
    p_rows: persist.rows,
    p_archive: persist.archives,
    p_session_date: persist.sessionDate,
    p_synced_at: "2026-08-10T14:00:05.000Z",
    p_status: persist.status === "stale" ? "available" : persist.status,
    p_last_provider_event_at: result.board.lastProviderEventAt,
  };
  assertEquals(rpcKeys(args), [
    "p_archive",
    "p_generation_id",
    "p_last_provider_event_at",
    "p_rows",
    "p_session_date",
    "p_status",
    "p_synced_at",
  ]);
  if (persist.rows.length > 0) {
    assertEquals(
      validateRadarGeneration(
        persist.rows,
        GEN,
        persist.sessionDate,
        args.p_synced_at,
        persist.status === "stale" ? "available" : persist.status,
      ) || persist.status === "empty",
      true,
    );
  }
});

Deno.test("22. PM/AH in-memory boards are not persisted as live Top-20 rows", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "AAA", ET.mon0400, 20, 20_000, 10.4, ET.mon0400);
  const pm = engine.evaluate(ET.mon0400 + 50, GEN);
  assertEquals(pm.sessionKind, "pre-market");
  assertEquals(pm.published, false);
  assertEquals(persistableGeneration(pm).rows.length, 0);

  ingestSeconds(engine, "AAA", ET.mon1000, 20, 20_000, 10.4, ET.mon1000);
  engine.evaluate(ET.mon1000 + 50, GEN);
  engine.evaluate(ET.mon1000 + 60, GEN);
  const rth = engine.evaluate(ET.mon1000 + 70, GEN);
  assertEquals(rth.sessionKind, "market");
  assertEquals(rth.published, true);
  assertEquals(rth.persistEmpty, false);

  engine.ingest(
    agg({ sym: "AAA", s: ET.mon1600, v: 1_000, c: 10.4 }),
    ET.mon1600,
  );
  const ah = engine.evaluate(ET.mon1600, GEN);
  assertEquals(ah.sessionKind, "after-hours");
  assertEquals(ah.persistEmpty, true);
  const parked = persistableGeneration(ah);
  assertEquals(parked.status, "empty");
  assertEquals(parked.rows.length, 0);

  const closed = engine.evaluate(ET.mon2000, GEN);
  assertEquals(closed.sessionKind, "closed");
  assertEquals(closed.liveSurveillance, false);
  assertEquals(closed.board.rows.length, 0);
  assertEquals(closed.board.status, "empty");
});

Deno.test("20:00 close parks the live board without wiping Sentinel until 04:00", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "AAA", ET.mon1900, 5, 20_000, 5, ET.mon1900);
  engine.evaluate(ET.mon1900 + 50, GEN);
  const closed = engine.evaluate(ET.mon2000, GEN);
  assertEquals(closed.sessionTransition, "park_closed");
  assertEquals(closed.board.rows.length, 0);
  assertEquals(engine.isPromoted("AAA"), true);
  assertEquals(engine.hasSentinel("AAA"), true);
});

Deno.test("11-14. session transitions fire once", () => {
  const engine = sentinelEngine();
  ingestSeconds(engine, "AAA", ET.mon092959999 - 4_000, 5, 20_000, 5, ET.mon092959999);
  engine.evaluate(ET.mon092959999, GEN);
  const pmRth = engine.evaluate(ET.mon0930, GEN);
  assertEquals(pmRth.sessionTransition, "soft_pm_rth");
  engine.ingest(agg({ sym: "AAA", s: ET.mon0930 + 50, v: 1_000, c: 5 }), ET.mon0930 + 50);
  const pmRthAgain = engine.evaluate(ET.mon0930 + 50, GEN);
  assertEquals(pmRthAgain.sessionTransition, null);

  ingestSeconds(
    engine,
    "AAA",
    ET.mon155959999 - 4_000,
    5,
    20_000,
    5,
    ET.mon155959999,
  );
  engine.evaluate(ET.mon155959999, GEN);
  engine.ingest(agg({ sym: "AAA", s: ET.mon1600, v: 1_000, c: 5 }), ET.mon1600);
  const rthAh = engine.evaluate(ET.mon1600, GEN);
  assertEquals(rthAh.sessionTransition, "soft_rth_ah");
  engine.ingest(agg({ sym: "AAA", s: ET.mon1600 + 50, v: 1_000, c: 5 }), ET.mon1600 + 50);
  const rthAhAgain = engine.evaluate(ET.mon1600 + 50, GEN);
  assertEquals(rthAhAgain.sessionTransition, null);

  engine.ingest(agg({ sym: "AAA", s: ET.mon195959999, v: 1_000, c: 5 }), ET.mon195959999);
  engine.evaluate(ET.mon195959999, GEN);
  const park = engine.evaluate(ET.mon2000, GEN);
  assertEquals(park.sessionTransition, "park_closed");
  const parkAgain = engine.evaluate(ET.mon2000 + 50, GEN);
  assertEquals(parkAgain.sessionTransition, null);

  const reset = engine.evaluate(ET.tue0400, GEN);
  assertEquals(reset.sessionTransition, "hard_reset");
  engine.ingest(agg({ sym: "AAA", s: ET.tue0400 + 50, v: 1_000, c: 5 }), ET.tue0400 + 50);
  const resetAgain = engine.evaluate(ET.tue0400 + 50, GEN);
  assertEquals(resetAgain.sessionTransition, null);
  assertEquals(resetAgain.sessionReset, false);
});

Deno.test("second-bar start belongs to the new session; end must not classify the prior second", () => {
  const lastRthStart = Date.parse("2026-08-10T19:59:59.000Z");
  const lastRthEnd = Date.parse("2026-08-10T20:00:00.000Z");
  assertEquals(lastRthEnd - lastRthStart, 1_000);
  assertEquals(radarSessionKindAt(lastRthStart, []), "market");
  assertEquals(radarSessionKindAt(lastRthEnd, []), "after-hours");
  const firstAhStart = lastRthEnd;
  const firstAhEnd = firstAhStart + 1_000;
  assertEquals(radarSessionKindAt(firstAhStart, []), "after-hours");
  assertEquals(radarSessionKindAt(firstAhEnd, []), "after-hours");
});

