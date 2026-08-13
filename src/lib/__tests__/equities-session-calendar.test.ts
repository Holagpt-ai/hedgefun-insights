import { describe, expect, it } from "vitest";
import {
  fallbackOpenSchedule,
  isWithinAfterHoursWindow,
  NORMAL_AFTER_HOURS_END_MS,
  NORMAL_REGULAR_CLOSE_MS,
  parseEtTimeToMsOfDay,
  resolveSessionSchedule,
  sessionKindAtMsOfDay,
  type CalendarExceptionRow,
} from "@/lib/equities-session-calendar";
import {
  easternParts,
  isAfterHoursTimestamp,
  resolveMarketSessionAt,
} from "@/lib/market-session";

const EARLY_CLOSE_13_MS = 13 * 60 * 60 * 1000;

function earlyClose(date: string): CalendarExceptionRow {
  return {
    session_date: date,
    market_status: "early_close",
    regular_open_et: "09:30:00",
    regular_close_et: "13:00:00",
    after_hours_end_et: "20:00:00",
    holiday_name: "Early Close",
  };
}

function holiday(date: string, name = "Holiday"): CalendarExceptionRow {
  return {
    session_date: date,
    market_status: "closed",
    regular_open_et: "09:30:00",
    regular_close_et: "16:00:00",
    after_hours_end_et: "20:00:00",
    holiday_name: name,
  };
}

describe("equities session calendar", () => {
  it("normal session uses 09:30 / 16:00 / 20:00 ET", () => {
    const schedule = resolveSessionSchedule("2026-08-13", []);
    expect(schedule.marketStatus).toBe("open");
    expect(schedule.regularOpenMsOfDay).toBe(parseEtTimeToMsOfDay("09:30:00"));
    expect(schedule.regularCloseMsOfDay).toBe(NORMAL_REGULAR_CLOSE_MS);
    expect(schedule.afterHoursEndMsOfDay).toBe(NORMAL_AFTER_HOURS_END_MS);
    expect(sessionKindAtMsOfDay(NORMAL_REGULAR_CLOSE_MS, schedule)).toBe("market");
    expect(isWithinAfterHoursWindow(NORMAL_REGULAR_CLOSE_MS, schedule)).toBe(false);
    expect(isWithinAfterHoursWindow(NORMAL_REGULAR_CLOSE_MS + 1, schedule)).toBe(true);
  });

  it("13:00 early close starts after-hours strictly after that close", () => {
    const schedule = resolveSessionSchedule("2026-11-27", [earlyClose("2026-11-27")]);
    expect(schedule.marketStatus).toBe("early_close");
    expect(schedule.regularCloseMsOfDay).toBe(EARLY_CLOSE_13_MS);
    expect(isWithinAfterHoursWindow(EARLY_CLOSE_13_MS, schedule)).toBe(false);
    expect(isWithinAfterHoursWindow(EARLY_CLOSE_13_MS + 1, schedule)).toBe(true);
    expect(sessionKindAtMsOfDay(16 * 3600_000, schedule)).toBe("after-hours");
  });

  it("closed holiday has no regular-session or after-hours generation", () => {
    const schedule = resolveSessionSchedule("2026-09-07", [holiday("2026-09-07", "Labor Day")]);
    expect(schedule.marketStatus).toBe("closed");
    expect(schedule.holidayName).toBe("Labor Day");
    expect(sessionKindAtMsOfDay(10 * 3600_000, schedule)).toBe("closed");
    expect(sessionKindAtMsOfDay(17 * 3600_000, schedule)).toBe("closed");
    expect(isWithinAfterHoursWindow(17 * 3600_000, schedule)).toBe(false);
  });

  it("unavailable calendar falls back to a normal open session", () => {
    const schedule = resolveSessionSchedule("2026-12-25", null);
    expect(schedule).toEqual(fallbackOpenSchedule("2026-12-25"));
    expect(schedule.source).toBe("fallback");
    expect(schedule.marketStatus).toBe("open");
    expect(isWithinAfterHoursWindow(NORMAL_REGULAR_CLOSE_MS + 1, schedule)).toBe(true);
  });

  it("loaded calendar treats weekends as closed", () => {
    const schedule = resolveSessionSchedule("2026-08-15", []);
    expect(schedule.marketStatus).toBe("closed");
    expect(schedule.source).toBe("calendar");
  });
});

describe("DST, midnight, and exact boundaries", () => {
  it("preserves Eastern millisecond precision across DST", () => {
    const summerClose = Date.parse("2026-08-12T20:00:00.000Z"); // 16:00 EDT
    const winterClose = Date.parse("2026-01-15T21:00:00.000Z"); // 16:00 EST
    const summer = easternParts(summerClose);
    const winter = easternParts(winterClose);
    expect(summer?.hour).toBe(16);
    expect(summer?.millisecond).toBe(0);
    expect(summer?.msOfDay).toBe(NORMAL_REGULAR_CLOSE_MS);
    expect(winter?.hour).toBe(16);
    expect(winter?.msOfDay).toBe(NORMAL_REGULAR_CLOSE_MS);

    const summerJustAfter = Date.parse("2026-08-12T20:00:00.001Z");
    expect(easternParts(summerJustAfter)?.millisecond).toBe(1);
    expect(easternParts(summerJustAfter)?.msOfDay).toBe(NORMAL_REGULAR_CLOSE_MS + 1);
  });

  it("maps midnight ET to hour 0 rather than 24", () => {
    const summerMidnight = Date.parse("2026-08-13T04:00:00.000Z"); // 00:00 EDT Aug 13
    const winterMidnight = Date.parse("2026-01-16T05:00:00.000Z"); // 00:00 EST Jan 16
    const summer = easternParts(summerMidnight);
    const winter = easternParts(winterMidnight);
    expect(summer?.hour).toBe(0);
    expect(summer?.msOfDay).toBe(0);
    expect(summer?.day).toBe(13);
    expect(winter?.hour).toBe(0);
    expect(winter?.msOfDay).toBe(0);
    expect(isAfterHoursTimestamp(summerMidnight, summerMidnight)).toBe(false);
    expect(resolveMarketSessionAt(summerMidnight)).toBe("closed");
  });

  it("excludes the exact regular close and includes exact 20:00 ET", () => {
    const close = Date.parse("2026-08-12T20:00:00.000Z");
    const justAfterClose = Date.parse("2026-08-12T20:00:00.001Z");
    const ahEnd = Date.parse("2026-08-13T00:00:00.000Z");
    const afterAhEnd = Date.parse("2026-08-13T00:00:00.001Z");
    const ref = Date.parse("2026-08-12T22:45:00.000Z");
    expect(isAfterHoursTimestamp(close, ref)).toBe(false);
    expect(isAfterHoursTimestamp(justAfterClose, ref)).toBe(true);
    expect(isAfterHoursTimestamp(ahEnd, ref)).toBe(true);
    expect(isAfterHoursTimestamp(afterAhEnd, ref)).toBe(false);
    expect(easternParts(ahEnd)?.msOfDay).toBe(NORMAL_AFTER_HOURS_END_MS);
  });

  it("applies early-close 13:00 ET in both DST offsets", () => {
    const summer13 = Date.parse("2026-07-03T17:00:00.000Z"); // 13:00 EDT
    const winter13 = Date.parse("2026-11-27T18:00:00.000Z"); // 13:00 EST
    const summerRef = Date.parse("2026-07-03T18:00:00.000Z");
    const winterRef = Date.parse("2026-11-27T19:00:00.000Z");
    const summerSchedule = resolveSessionSchedule("2026-07-03", [earlyClose("2026-07-03")]);
    const winterSchedule = resolveSessionSchedule("2026-11-27", [earlyClose("2026-11-27")]);
    expect(isAfterHoursTimestamp(summer13, summerRef, summerSchedule)).toBe(false);
    expect(
      isAfterHoursTimestamp(summer13 + 1, summerRef, summerSchedule),
    ).toBe(true);
    expect(isAfterHoursTimestamp(winter13, winterRef, winterSchedule)).toBe(false);
    expect(
      isAfterHoursTimestamp(winter13 + 1, winterRef, winterSchedule),
    ).toBe(true);
    expect(resolveMarketSessionAt(summer13 + 1, summerSchedule)).toBe("after-hours");
  });

  it("does not generate after-hours on a closed holiday even at 5pm ET", () => {
    const laborDayAfternoon = Date.parse("2026-09-07T21:00:00.000Z"); // 17:00 EDT
    const schedule = resolveSessionSchedule("2026-09-07", [holiday("2026-09-07", "Labor Day")]);
    expect(isAfterHoursTimestamp(laborDayAfternoon, laborDayAfternoon, schedule)).toBe(false);
    expect(resolveMarketSessionAt(laborDayAfternoon, schedule)).toBe("closed");
  });
});
