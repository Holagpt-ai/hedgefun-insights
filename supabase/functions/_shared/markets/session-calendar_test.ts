import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseUpcomingMarketStatus,
  providerClockToEtTime,
} from "./session-calendar.ts";
import {
  isWithinAfterHoursWindow,
  NORMAL_AFTER_HOURS_END_MS,
  NORMAL_REGULAR_CLOSE_MS,
  resolveSessionSchedule,
  sessionKindAtMsOfDay,
} from "./session-schedule.ts";

const EARLY_CLOSE_13_MS = 13 * 60 * 60 * 1000;

Deno.test("provider clock accepts HH:MM and ISO close timestamps", () => {
  assertEquals(providerClockToEtTime("13:00"), "13:00:00");
  // 13:00 EDT = 17:00 UTC on 2026-07-03
  assertEquals(providerClockToEtTime("2026-07-03T17:00:00.000Z"), "13:00:00");
  // 13:00 EST = 18:00 UTC on 2026-11-27
  assertEquals(providerClockToEtTime("2026-11-27T18:00:00.000Z"), "13:00:00");
});

Deno.test("upcoming closed holiday requires NYSE+NASDAQ agreement", () => {
  const parsed = parseUpcomingMarketStatus(
    [
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
    ],
    "2026-08-13",
  );
  assertEquals(parsed.ok, true);
  if (!parsed.ok) return;
  assertEquals(parsed.rows.length, 1);
  assertEquals(parsed.rows[0].market_status, "closed");
  assertEquals(parsed.rows[0].holiday_name, "Labor Day");
});

Deno.test("upcoming early close uses provider close and 20:00 AH end", () => {
  const parsed = parseUpcomingMarketStatus(
    [
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
    ],
    "2026-08-13",
  );
  assertEquals(parsed.ok, true);
  if (!parsed.ok) return;
  assertEquals(parsed.rows[0].regular_close_et, "13:00:00");
  assertEquals(parsed.rows[0].after_hours_end_et, "20:00:00");
});

Deno.test("conflicting NYSE/NASDAQ close times fail closed", () => {
  const parsed = parseUpcomingMarketStatus(
    [
      {
        exchange: "NYSE",
        date: "2026-11-27",
        status: "early-close",
        close: "13:00",
      },
      {
        exchange: "NASDAQ",
        date: "2026-11-27",
        status: "early-close",
        close: "14:00",
      },
    ],
    "2026-08-13",
  );
  assertEquals(parsed.ok, false);
});

Deno.test("malformed upcoming payload fails closed", () => {
  assertEquals(
    parseUpcomingMarketStatus({ status: "closed" }, "2026-08-13").ok,
    false,
  );
  assertEquals(
    parseUpcomingMarketStatus(
      [{ exchange: "NYSE", date: "not-a-date", status: "closed" }],
      "2026-08-13",
    ).ok,
    false,
  );
});

Deno.test("past exception dates are ignored relative to as-of date", () => {
  const parsed = parseUpcomingMarketStatus(
    [
      { exchange: "NYSE", name: "Past", date: "2026-01-01", status: "closed" },
      {
        exchange: "NASDAQ",
        name: "Past",
        date: "2026-01-01",
        status: "closed",
      },
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
    ],
    "2026-08-13",
  );
  assertEquals(parsed.ok, true);
  if (!parsed.ok) return;
  assertEquals(parsed.rows.length, 1);
  assertEquals(parsed.rows[0].session_date, "2026-09-07");
});

Deno.test("empty upcoming array is a valid empty exception calendar", () => {
  const parsed = parseUpcomingMarketStatus([], "2026-08-13");
  assertEquals(parsed.ok, true);
  if (!parsed.ok) return;
  assertEquals(parsed.rows.length, 0);
});

Deno.test("unavailable calendar falls back to normal 16:00 close", () => {
  const schedule = resolveSessionSchedule("2026-08-13", null);
  assertEquals(schedule.source, "fallback");
  assertEquals(schedule.marketStatus, "open");
  assertEquals(schedule.regularCloseMsOfDay, NORMAL_REGULAR_CLOSE_MS);
  assertEquals(schedule.afterHoursEndMsOfDay, NORMAL_AFTER_HOURS_END_MS);
  assertEquals(
    sessionKindAtMsOfDay(NORMAL_REGULAR_CLOSE_MS, schedule),
    "market",
  );
  assertEquals(
    isWithinAfterHoursWindow(NORMAL_REGULAR_CLOSE_MS + 1, schedule),
    true,
  );
});

Deno.test("13:00 early close opens after-hours strictly after that close", () => {
  const schedule = resolveSessionSchedule("2026-11-27", [
    {
      session_date: "2026-11-27",
      market_status: "early_close",
      regular_open_et: "09:30:00",
      regular_close_et: "13:00:00",
      after_hours_end_et: "20:00:00",
      holiday_name: "Day After Thanksgiving",
    },
  ]);
  assertEquals(schedule.marketStatus, "early_close");
  assertEquals(schedule.regularCloseMsOfDay, EARLY_CLOSE_13_MS);
  assertEquals(isWithinAfterHoursWindow(EARLY_CLOSE_13_MS, schedule), false);
  assertEquals(isWithinAfterHoursWindow(EARLY_CLOSE_13_MS + 1, schedule), true);
  assertEquals(sessionKindAtMsOfDay(EARLY_CLOSE_13_MS, schedule), "market");
  assertEquals(
    sessionKindAtMsOfDay(EARLY_CLOSE_13_MS + 1, schedule),
    "after-hours",
  );
});

Deno.test("closed holiday has no regular or after-hours window", () => {
  const schedule = resolveSessionSchedule("2026-09-07", [
    {
      session_date: "2026-09-07",
      market_status: "closed",
      regular_open_et: "09:30:00",
      regular_close_et: "16:00:00",
      after_hours_end_et: "20:00:00",
      holiday_name: "Labor Day",
    },
  ]);
  assertEquals(schedule.marketStatus, "closed");
  assertEquals(sessionKindAtMsOfDay(10 * 3600_000, schedule), "closed");
  assertEquals(isWithinAfterHoursWindow(17 * 3600_000, schedule), false);
});
