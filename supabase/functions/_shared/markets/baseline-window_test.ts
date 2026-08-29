import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BASELINE_DATES_PER_INVOCATION,
  lastCompletedRegularSessionDate,
  remainingWeekdays,
  resolveBaselineWindow,
  weekdayDatesInclusive,
} from "./baseline-window.ts";

Deno.test("current regular session is excluded from the baseline window", () => {
  const exceptions: never[] = [];
  const duringSession = Date.parse("2026-08-12T18:00:00.000Z"); // 14:00 ET
  const afterClose = Date.parse("2026-08-12T20:00:01.000Z"); // 16:00:01 ET
  assertEquals(
    lastCompletedRegularSessionDate(duringSession, exceptions),
    "2026-08-11",
  );
  assertEquals(
    lastCompletedRegularSessionDate(afterClose, exceptions),
    "2026-08-12",
  );
  const window = resolveBaselineWindow(duringSession, exceptions, 3);
  assertEquals(window?.periodEnd, "2026-08-11");
});

Deno.test("closed holiday is not used as period end", () => {
  const holidayNow = Date.parse("2026-09-07T20:00:01.000Z");
  const exceptions = [{
    session_date: "2026-09-07",
    market_status: "closed" as const,
    regular_open_et: "09:30:00",
    regular_close_et: "16:00:00",
    after_hours_end_et: "20:00:00",
    holiday_name: "Labor Day",
  }];
  assertEquals(
    lastCompletedRegularSessionDate(holidayNow, exceptions),
    "2026-09-04",
  );
});

Deno.test("remaining weekdays resume after the last applied date", () => {
  const dates = weekdayDatesInclusive("2026-08-10", "2026-08-13");
  assertEquals(dates, ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]);
  assertEquals(
    remainingWeekdays("2026-08-10", "2026-08-13", "2026-08-11"),
    ["2026-08-12", "2026-08-13"],
  );
});

Deno.test("262-date catch-up fits in one 8-hour overnight window at 4 dates / 5 min", () => {
  assertEquals(BASELINE_DATES_PER_INVOCATION, 4);
  const dates = 262;
  const invocations = Math.ceil(dates / BASELINE_DATES_PER_INVOCATION);
  const minutes = invocations * 5;
  assertEquals(invocations, 66);
  assertEquals(minutes, 330);
  assertEquals(minutes <= 8 * 60, true);
});
