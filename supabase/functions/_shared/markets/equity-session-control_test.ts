/**
 * Batch 215 — unified equity session control (23×5-ready) schedule tests.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EQUITY_23X5_DISABLED,
  isOvernightActiveFor,
  read23x5Activation,
  resolveEquitySession,
  type Equity23x5Activation,
} from "./equity-session-control.ts";
import type { CalendarExceptionRow } from "./session-schedule.ts";
import { resolveSyncSessionKind } from "../screeners/session-sync-context.ts";

const ACTIVE: Equity23x5Activation = {
  ownerAuthorized: true,
  exchangeEffectiveDate: "2026-11-02",
  providerOvernightConfirmed: true,
};

/** UTC instant → session (no calendar rows, i.e. loaded but empty). */
function at(iso: string, activation: Equity23x5Activation = EQUITY_23X5_DISABLED, exceptions: CalendarExceptionRow[] | null = []) {
  const s = resolveEquitySession({ nowMs: Date.parse(iso), exceptions, activation });
  assert(s, `session resolved for ${iso}`);
  return s;
}

const THANKSGIVING_2026: CalendarExceptionRow[] = [
  {
    session_date: "2026-11-26",
    market_status: "closed",
    regular_open_et: "09:30:00",
    regular_close_et: "16:00:00",
    after_hours_end_et: "20:00:00",
    holiday_name: "Thanksgiving Day",
  },
  {
    session_date: "2026-11-27",
    market_status: "early_close",
    regular_open_et: "09:30:00",
    regular_close_et: "13:00:00",
    after_hours_end_et: "17:00:00",
    holiday_name: "Day after Thanksgiving",
  },
];

// ---------------------------------------------------------------------------
// Standard (pre-activation) behavior
// ---------------------------------------------------------------------------

Deno.test("Batch 215 standard: Saturday is a weekend closure all day", () => {
  for (const iso of ["2026-11-07T05:00:00Z", "2026-11-07T09:00:00Z", "2026-11-07T17:00:00Z", "2026-11-08T02:30:00Z"]) {
    const s = at(iso);
    assertEquals(s.phase, "weekend_closure", iso);
    assertEquals(s.scanEligible, false);
    assertEquals(s.skipReason, "weekend_closure");
  }
});

Deno.test("Batch 215 standard: Sunday evening stays closed before activation (21:00 is overnight_inactive, not open)", () => {
  assertEquals(at("2026-11-09T01:59:00Z").phase, "weekend_closure"); // Sun 20:59 EST
  const s = at("2026-11-09T02:00:00Z"); // Sun 21:00 EST
  assertEquals(s.phase, "overnight_inactive");
  assertEquals(s.skipReason, "overnight_not_activated");
  assertEquals(s.scanEligible, false);
  assertEquals(s.tradeDate, null);
});

Deno.test("Batch 215 standard: weekday sessions are scan-eligible with today's trade date", () => {
  // Mon 2026-11-09 (EST, UTC-5)
  const cases: Array<[string, string]> = [
    ["2026-11-09T09:00:00Z", "pre-market"], // 04:00
    ["2026-11-09T14:30:00Z", "market"], // 09:30
    ["2026-11-09T21:00:00Z", "market"], // 16:00 (inclusive)
    ["2026-11-09T21:01:00Z", "after-hours"],
    ["2026-11-10T01:00:00Z", "after-hours"], // 20:00 (inclusive)
  ];
  for (const [iso, phase] of cases) {
    const s = at(iso);
    assertEquals(s.phase, phase, iso);
    assertEquals(s.scanEligible, true, iso);
    assertEquals(s.tradeDate, "2026-11-09", iso);
    assertEquals(s.legacySessionKind, phase, iso);
  }
});

Deno.test("Batch 215 standard: weekday nights are overnight_inactive (no scans) before activation", () => {
  for (const iso of ["2026-11-10T01:30:00Z" /* Mon 20:30 */, "2026-11-10T05:00:00Z" /* Tue 00:00 */, "2026-11-10T08:59:00Z" /* Tue 03:59 */]) {
    const s = at(iso);
    assertEquals(s.phase, "overnight_inactive", iso);
    assertEquals(s.scanEligible, false, iso);
  }
});

Deno.test("Batch 215 standard: Friday 20:00+ is weekend closure", () => {
  assertEquals(at("2026-11-14T01:00:00Z").phase, "after-hours"); // Fri 20:00:00
  assertEquals(at("2026-11-14T01:00:01Z").phase, "weekend_closure"); // Fri 20:00:01
  assertEquals(at("2026-11-14T03:00:00Z").phase, "weekend_closure"); // Fri 22:00
});

Deno.test("Batch 215 parity: before activation, scan eligibility equals the existing scanner session classification", () => {
  // Two weeks in 15-minute steps, null calendar (the scanner's current input).
  const start = Date.parse("2026-11-01T00:00:00Z");
  for (let ms = start; ms < start + 14 * 86_400_000; ms += 15 * 60_000) {
    const legacy = resolveSyncSessionKind(ms);
    const s = resolveEquitySession({ nowMs: ms, exceptions: null });
    assert(s);
    assertEquals(s.scanEligible, legacy !== "closed", new Date(ms).toISOString());
    assertEquals(s.legacySessionKind, legacy, new Date(ms).toISOString());
  }
});

// ---------------------------------------------------------------------------
// Activated 23×5 schedule
// ---------------------------------------------------------------------------

Deno.test("Batch 215 23x5: Sunday 20:59 closed, Sunday 21:00 overnight for Monday's cycle", () => {
  const before = at("2026-11-09T01:59:00Z", ACTIVE);
  assertEquals(before.phase, "weekend_closure");
  const open = at("2026-11-09T02:00:00Z", ACTIVE);
  assertEquals(open.phase, "overnight");
  assertEquals(open.etDate, "2026-11-08");
  assertEquals(open.tradeDate, "2026-11-09");
  assertEquals(open.legacySessionKind, "closed");
});

Deno.test("Batch 215 23x5: Monday–Thursday 20:00–21:00 is a maintenance pause", () => {
  // Mon 11-09 .. Thu 11-12, 20:30 EST = 01:30Z next day
  for (const iso of ["2026-11-10T01:30:00Z", "2026-11-11T01:30:00Z", "2026-11-12T01:30:00Z", "2026-11-13T01:30:00Z"]) {
    const s = at(iso, ACTIVE);
    assertEquals(s.phase, "maintenance_pause", iso);
    assertEquals(s.skipReason, "maintenance_pause");
    assertEquals(s.scanEligible, false);
  }
});

Deno.test("Batch 215 23x5: Friday 20:00 opens the weekend closure (no Friday overnight)", () => {
  assertEquals(at("2026-11-14T01:30:00Z", ACTIVE).phase, "weekend_closure"); // Fri 20:30
  assertEquals(at("2026-11-14T02:30:00Z", ACTIVE).phase, "weekend_closure"); // Fri 21:30
  assertEquals(at("2026-11-14T06:00:00Z", ACTIVE).phase, "weekend_closure"); // Sat 01:00
});

Deno.test("Batch 215 23x5: midnight trade-date rollover keeps the overnight cycle on the next trading day", () => {
  const mon2359 = at("2026-11-10T04:59:00Z", ACTIVE); // Mon 23:59
  assertEquals(mon2359.phase, "overnight");
  assertEquals(mon2359.etDate, "2026-11-09");
  assertEquals(mon2359.tradeDate, "2026-11-10");
  const tue0001 = at("2026-11-10T05:01:00Z", ACTIVE); // Tue 00:01
  assertEquals(tue0001.phase, "overnight");
  assertEquals(tue0001.etDate, "2026-11-10");
  assertEquals(tue0001.tradeDate, "2026-11-10");
  const tue0359 = at("2026-11-10T08:59:00Z", ACTIVE);
  assertEquals(tue0359.tradeDate, "2026-11-10");
  const tue0400 = at("2026-11-10T09:00:00Z", ACTIVE);
  assertEquals(tue0400.phase, "pre-market");
  assertEquals(tue0400.tradeDate, "2026-11-10");
});

Deno.test("Batch 215 23x5: daylight-saving transitions use local ET wall time", () => {
  // Fall back: Sun 2026-11-01. 21:00 EST = 02:00Z Nov 2.
  const fall = at("2026-11-02T02:00:00Z", ACTIVE);
  assertEquals(fall.phase, "overnight");
  assertEquals(fall.tradeDate, "2026-11-02");
  assertEquals(at("2026-11-02T01:59:00Z", ACTIVE).phase, "weekend_closure");
  // The repeated 01:30 hour on the fall-back Sunday is still the weekend.
  assertEquals(at("2026-11-01T05:30:00Z", ACTIVE).phase, "weekend_closure");
  assertEquals(at("2026-11-01T06:30:00Z", ACTIVE).phase, "weekend_closure");
  // Spring forward: Sun 2027-03-14. 21:00 EDT = 01:00Z Mar 15.
  const spring = at("2027-03-15T01:00:00Z", ACTIVE);
  assertEquals(spring.phase, "overnight");
  assertEquals(spring.tradeDate, "2027-03-15");
  assertEquals(at("2027-03-15T00:59:00Z", ACTIVE).phase, "weekend_closure");
  assertEquals(at("2027-03-15T08:00:00Z", ACTIVE).phase, "pre-market"); // Mon 04:00 EDT
});

Deno.test("Batch 215: holidays and early closes from the exception calendar", () => {
  // Thanksgiving Thu 2026-11-26 10:00 EST.
  const holiday = at("2026-11-26T15:00:00Z", ACTIVE, THANKSGIVING_2026);
  assertEquals(holiday.phase, "holiday_closure");
  assertEquals(holiday.holidayName, "Thanksgiving Day");
  assertEquals(holiday.scanEligible, false);
  // Without the calendar the same instant cannot be confirmed as a holiday: fail open (scan).
  assertEquals(at("2026-11-26T15:00:00Z", EQUITY_23X5_DISABLED, null).phase, "market");
  // No overnight into the holiday: Wed 11-25 20:30 and 21:30.
  assertEquals(at("2026-11-26T01:30:00Z", ACTIVE, THANKSGIVING_2026).phase, "holiday_closure");
  assertEquals(at("2026-11-26T02:30:00Z", ACTIVE, THANKSGIVING_2026).phase, "holiday_closure");
  // Thanksgiving evening 21:00 opens overnight for the early-close Friday.
  const thuNight = at("2026-11-27T02:00:00Z", ACTIVE, THANKSGIVING_2026);
  assertEquals(thuNight.phase, "overnight");
  assertEquals(thuNight.tradeDate, "2026-11-27");
  // Early close Friday: 13:00 close, after-hours to 17:00, then weekend.
  assertEquals(at("2026-11-27T18:30:00Z", ACTIVE, THANKSGIVING_2026).phase, "after-hours"); // 13:30
  assertEquals(at("2026-11-27T22:30:00Z", ACTIVE, THANKSGIVING_2026).phase, "weekend_closure"); // 17:30
  // Standard mode, holiday: still a holiday closure (not overnight_inactive).
  assertEquals(at("2026-11-26T15:00:00Z", EQUITY_23X5_DISABLED, THANKSGIVING_2026).skipReason, "holiday_closure");
});

Deno.test("Batch 215 23x5: overnight is classified but not scan-eligible until the pipeline supports it", () => {
  const s = at("2026-11-10T05:00:00Z", ACTIVE);
  assertEquals(s.phase, "overnight");
  assertEquals(s.scanEligible, false);
  assertEquals(s.skipReason, "overnight_pipeline_not_ready");
  const ready = resolveEquitySession({
    nowMs: Date.parse("2026-11-10T05:00:00Z"),
    exceptions: [],
    activation: ACTIVE,
    overnightPipelineReady: true,
  });
  assertEquals(ready?.scanEligible, true);
  assertEquals(ready?.skipReason, null);
});

// ---------------------------------------------------------------------------
// Activation gating (never by calendar date alone)
// ---------------------------------------------------------------------------

Deno.test("Batch 215 activation: every prerequisite is required; the date alone never activates", () => {
  const dec6Sunday2100 = "2026-12-07T02:00:00Z"; // Sun 2026-12-06 21:00 EST → Mon 12-07 cycle
  const partials: Equity23x5Activation[] = [
    EQUITY_23X5_DISABLED,
    { ownerAuthorized: false, exchangeEffectiveDate: "2026-12-07", providerOvernightConfirmed: true },
    { ownerAuthorized: true, exchangeEffectiveDate: null, providerOvernightConfirmed: true },
    { ownerAuthorized: true, exchangeEffectiveDate: "2026-12-07", providerOvernightConfirmed: false },
  ];
  for (const a of partials) {
    assertEquals(at(dec6Sunday2100, a).phase, "overnight_inactive", JSON.stringify(a));
  }
  const full: Equity23x5Activation = { ownerAuthorized: true, exchangeEffectiveDate: "2026-12-07", providerOvernightConfirmed: true };
  assertEquals(at(dec6Sunday2100, full).phase, "overnight");
  assertEquals(at(dec6Sunday2100, full).tradeDate, "2026-12-07");
  // A week earlier the effective date has not arrived.
  assertEquals(at("2026-11-30T02:00:00Z", full).phase, "overnight_inactive");
  assertEquals(isOvernightActiveFor(full, "2026-12-04"), false);
});

Deno.test("Batch 215 activation: env parsing is strict", () => {
  const env = (m: Record<string, string>) => (k: string) => m[k];
  assertEquals(read23x5Activation(env({})), EQUITY_23X5_DISABLED);
  const loose = read23x5Activation(env({
    STOCKSIST_EQUITY_23X5_OWNER_AUTHORIZED: "TRUE",
    STOCKSIST_EQUITY_23X5_EXCHANGE_EFFECTIVE_DATE: "Dec 7",
    STOCKSIST_EQUITY_23X5_PROVIDER_OVERNIGHT_CONFIRMED: "1",
  }));
  assertEquals(loose, EQUITY_23X5_DISABLED);
  assertEquals(read23x5Activation(env({
    STOCKSIST_EQUITY_23X5_OWNER_AUTHORIZED: "true",
    STOCKSIST_EQUITY_23X5_EXCHANGE_EFFECTIVE_DATE: "2026-12-07",
    STOCKSIST_EQUITY_23X5_PROVIDER_OVERNIGHT_CONFIRMED: "true",
  })), { ownerAuthorized: true, exchangeEffectiveDate: "2026-12-07", providerOvernightConfirmed: true });
});
