import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AH_EMPTY_GRACE_MS,
  type AhTicker,
  classifyFullMarketAfterHours,
  classifyTicker,
  decideAfterHoursPublish,
  isAfterHoursObservation,
  selectNewestAfterHoursObservation,
} from "./after-hours-movers.ts";
import {
  fallbackOpenSchedule,
  NORMAL_AFTER_HOURS_END_MS,
  NORMAL_REGULAR_CLOSE_MS,
  type ResolvedSessionSchedule,
} from "./session-schedule.ts";

const SUMMER_REF_MS = Date.parse("2026-08-12T22:45:00.000Z");
const SUMMER_EXACT_CLOSE_MS = Date.parse("2026-08-12T20:00:00.000Z");
const SUMMER_JUST_AFTER_CLOSE_MS = Date.parse("2026-08-12T20:00:00.001Z");
const SUMMER_EXACT_AH_END_MS = Date.parse("2026-08-13T00:00:00.000Z");
const SUMMER_AFTER_AH_END_MS = Date.parse("2026-08-13T00:00:00.001Z");
const EARLY_CLOSE_MS = Date.parse("2026-11-27T18:00:00.000Z");
const EARLY_EXACT_CLOSE_MS = Date.parse("2026-11-27T18:00:00.000Z");
const EARLY_JUST_AFTER_MS = Date.parse("2026-11-27T18:00:00.001Z");

const NORMAL = fallbackOpenSchedule("2026-08-12");
const EARLY: ResolvedSessionSchedule = {
  sessionDate: "2026-11-27",
  marketStatus: "early_close",
  regularOpenMsOfDay: (9 * 60 + 30) * 60_000,
  regularCloseMsOfDay: 13 * 3_600_000,
  afterHoursEndMsOfDay: NORMAL_AFTER_HOURS_END_MS,
  holidayName: "Thanksgiving Friday",
  source: "calendar",
};
const HOLIDAY: ResolvedSessionSchedule = {
  sessionDate: "2026-12-25",
  marketStatus: "closed",
  regularOpenMsOfDay: (9 * 60 + 30) * 60_000,
  regularCloseMsOfDay: NORMAL_REGULAR_CLOSE_MS,
  afterHoursEndMsOfDay: NORMAL_AFTER_HOURS_END_MS,
  holidayName: "Christmas",
  source: "calendar",
};

function mk(
  symbol: string,
  opts: {
    close?: number;
    lastP?: number;
    lastT?: number;
    minC?: number;
    minT?: number;
    vol?: number;
    todaysChangePerc?: number;
  } = {},
): AhTicker {
  return {
    ticker: symbol,
    todaysChangePerc: opts.todaysChangePerc ?? 99,
    day: { c: opts.close ?? 10, v: opts.vol ?? 1_000_000 },
    lastTrade: opts.lastP !== undefined
      ? { p: opts.lastP, t: opts.lastT ?? SUMMER_JUST_AFTER_CLOSE_MS }
      : undefined,
    min: opts.minC !== undefined
      ? { c: opts.minC, t: opts.minT ?? SUMMER_JUST_AFTER_CLOSE_MS }
      : undefined,
  };
}

Deno.test("normal close: exact close excluded, 1ms after included", () => {
  assertEquals(isAfterHoursObservation(SUMMER_EXACT_CLOSE_MS, NORMAL), false);
  assertEquals(
    isAfterHoursObservation(SUMMER_JUST_AFTER_CLOSE_MS, NORMAL),
    true,
  );
});

Deno.test("exact 20:00 ET included; 20:00:00.001 excluded", () => {
  assertEquals(isAfterHoursObservation(SUMMER_EXACT_AH_END_MS, NORMAL), true);
  assertEquals(isAfterHoursObservation(SUMMER_AFTER_AH_END_MS, NORMAL), false);
});

Deno.test("early close: AH begins strictly after 13:00 ET", () => {
  assertEquals(isAfterHoursObservation(EARLY_EXACT_CLOSE_MS, EARLY), false);
  assertEquals(isAfterHoursObservation(EARLY_JUST_AFTER_MS, EARLY), true);
  assertEquals(EARLY_CLOSE_MS, EARLY_EXACT_CLOSE_MS);
});

Deno.test("lastTrade vs min: newer wins; equal timestamps prefer lastTrade", () => {
  const older = Date.parse("2026-08-12T20:05:00.000Z");
  const newer = Date.parse("2026-08-12T22:00:00.000Z");
  const newerMin = selectNewestAfterHoursObservation(
    mk("AAA", { lastP: 11, lastT: older, minC: 10.5, minT: newer }),
    NORMAL,
  );
  assertEquals(newerMin?.source, "min");
  assertEquals(newerMin?.price, 10.5);

  const newerTrade = selectNewestAfterHoursObservation(
    mk("AAA", { lastP: 11.1, lastT: newer, minC: 10.5, minT: older }),
    NORMAL,
  );
  assertEquals(newerTrade?.source, "lastTrade");
  assertEquals(newerTrade?.price, 11.1);

  const tied = selectNewestAfterHoursObservation(
    mk("AAA", { lastP: 11.1, lastT: newer, minC: 10.5, minT: newer }),
    NORMAL,
  );
  assertEquals(tied?.source, "lastTrade");
  assertEquals(tied?.price, 11.1);
});

Deno.test("never mixes one candidate price with another timestamp", () => {
  const older = Date.parse("2026-08-12T20:05:00.000Z");
  const newer = Date.parse("2026-08-12T22:00:00.000Z");
  const won = selectNewestAfterHoursObservation(
    mk("AAA", { lastP: 99.99, lastT: older, minC: 10.5, minT: newer }),
    NORMAL,
  )!;
  assertEquals(won.price, 10.5);
  assertEquals(won.ms, newer);
});

Deno.test("zero change is excluded; todaysChangePerc is ignored", () => {
  const zero = classifyTicker(
    mk("FLAT", { close: 10, lastP: 10, todaysChangePerc: 50 }),
    NORMAL,
  );
  assertEquals(zero, null);
  const up = classifyTicker(
    mk("UP", { close: 10, lastP: 11, todaysChangePerc: -80 }),
    NORMAL,
  );
  assertEquals(up?.change_percent, 10);
});

Deno.test("full-market input dedupes symbols and caps each side at 20", () => {
  const universe: AhTicker[] = [];
  for (let i = 0; i < 30; i++) {
    universe.push(mk(`G${String(i).padStart(2, "0")}`, {
      close: 10,
      lastP: 10 + (30 - i) / 10,
      vol: 1000 + i,
    }));
    universe.push(mk(`L${String(i).padStart(2, "0")}`, {
      close: 10,
      lastP: 10 - (30 - i) / 10,
      vol: 1000 + i,
    }));
  }
  universe.push(
    mk("G00", { close: 10, lastP: 10.1, lastT: SUMMER_JUST_AFTER_CLOSE_MS }),
  );
  const rows = classifyFullMarketAfterHours(universe, NORMAL);
  const gainers = rows.filter((r) => r.side === "gainer");
  const losers = rows.filter((r) => r.side === "loser");
  assertEquals(gainers.length, 20);
  assertEquals(losers.length, 20);
  assertEquals(gainers[0].symbol, "G00");
  assertEquals(gainers[0].rank, 1);
  assertEquals(losers[0].symbol, "L00");
  assertEquals(new Set(gainers.map((r) => r.symbol)).size, 20);
});

Deno.test("gainers sort highest percent first; losers most negative first", () => {
  const rows = classifyFullMarketAfterHours([
    mk("MID", { close: 10, lastP: 11 }),
    mk("TOP", { close: 10, lastP: 12 }),
    mk("BOT", { close: 10, lastP: 8 }),
    mk("LOW", { close: 10, lastP: 9 }),
  ], NORMAL);
  assertEquals(rows.filter((r) => r.side === "gainer").map((r) => r.symbol), [
    "TOP",
    "MID",
  ]);
  assertEquals(rows.filter((r) => r.side === "loser").map((r) => r.symbol), [
    "BOT",
    "LOW",
  ]);
});

Deno.test("overnight, weekend, holiday, and provider reset retain the prior generation", () => {
  const classified = classifyFullMarketAfterHours([
    mk("UP", { close: 10, lastP: 11 }),
  ], NORMAL);

  const afterWindow = decideAfterHoursPublish({
    nowMs: SUMMER_AFTER_AH_END_MS,
    exceptions: [],
    classified,
    providerFailed: false,
  });
  assertEquals(afterWindow.action, "retain");

  const midnight = decideAfterHoursPublish({
    nowMs: Date.parse("2026-08-13T04:00:00.000Z"),
    exceptions: [],
    classified,
    providerFailed: false,
  });
  assertEquals(midnight.action, "retain");

  const weekend = decideAfterHoursPublish({
    nowMs: Date.parse("2026-08-15T22:00:00.000Z"),
    exceptions: [],
    classified,
    providerFailed: false,
  });
  assertEquals(weekend.action, "retain");

  const holidayNow = Date.parse("2026-12-25T21:00:00.000Z");
  const holiday = decideAfterHoursPublish({
    nowMs: holidayNow,
    exceptions: [{
      session_date: "2026-12-25",
      market_status: "closed",
      regular_open_et: "09:30:00",
      regular_close_et: "16:00:00",
      after_hours_end_et: "20:00:00",
      holiday_name: "Christmas",
    }],
    classified,
    providerFailed: false,
  });
  assertEquals(holiday.action, "retain");
  void HOLIDAY;

  const providerReset = decideAfterHoursPublish({
    nowMs: Date.parse("2026-08-13T07:30:00.000Z"),
    exceptions: [],
    classified: [],
    providerFailed: false,
  });
  assertEquals(providerReset.action, "retain");

  const providerError = decideAfterHoursPublish({
    nowMs: SUMMER_REF_MS,
    exceptions: [],
    classified: [],
    providerFailed: true,
  });
  assertEquals(providerError.action, "retain");
});

Deno.test("empty generation replaces only after the post-close grace period", () => {
  const justAfter = decideAfterHoursPublish({
    nowMs: SUMMER_JUST_AFTER_CLOSE_MS,
    exceptions: [],
    classified: [],
    providerFailed: false,
  });
  assertEquals(justAfter.action, "retain");
  if (justAfter.action === "retain") {
    assertEquals(justAfter.reason, "empty_grace");
  }

  const afterGrace = decideAfterHoursPublish({
    nowMs: SUMMER_EXACT_CLOSE_MS + AH_EMPTY_GRACE_MS + 1,
    exceptions: [],
    classified: [],
    providerFailed: false,
  });
  assertEquals(afterGrace.action, "replace");
  if (afterGrace.action === "replace") assertEquals(afterGrace.status, "empty");
});

Deno.test("validated observations during the AH window replace the prior generation", () => {
  const classified = classifyFullMarketAfterHours([
    mk("UP", { close: 10, lastP: 11 }),
  ], NORMAL);
  const decision = decideAfterHoursPublish({
    nowMs: SUMMER_REF_MS,
    exceptions: [],
    classified,
    providerFailed: false,
  });
  assertEquals(decision.action, "replace");
  if (decision.action === "replace") {
    assertEquals(decision.status, "available");
    assertEquals(decision.sessionDate, "2026-08-12");
    assertEquals(decision.rows.length, 1);
  }
});
