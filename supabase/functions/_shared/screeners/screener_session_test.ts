import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import {
  assessScreenerGenerationSession,
  feedSessionMatchesConsumerClock,
  surveillanceTradingDateFromMs,
} from "./screener-session.ts";

Deno.test("surveillance date rolls at 04:00 ET, not midnight", () => {
  const midnightSep24 = Date.parse("2026-09-24T04:00:00.000Z"); // 00:00 ET Sep 24
  assertEquals(surveillanceTradingDateFromMs(midnightSep24), "2026-09-23");
  const premarketSep24 = Date.parse("2026-09-24T08:10:00.000Z"); // 04:10 ET Sep 24
  assertEquals(surveillanceTradingDateFromMs(premarketSep24), "2026-09-24");
});

Deno.test("20:00 ET close → next day 04:00 pre-market rejects prior AH snapshot", () => {
  const ahCloseMs = Date.parse("2026-09-24T00:00:00.000Z"); // Sep 23 20:00 ET (EDT)
  const premarketMs = Date.parse("2026-09-24T10:10:00.000Z"); // Sep 24 06:10 ET
  assertEquals(
    assessScreenerGenerationSession({
      nowMs: premarketMs,
      referenceIso: new Date(ahCloseMs).toISOString(),
    }),
    "previous_during_live",
  );
});

Deno.test("same surveillance date pre-market reference is current", () => {
  const nowMs = Date.parse("2026-09-24T10:30:00.000Z"); // 06:30 ET Sep 24
  const ref = Date.parse("2026-09-24T09:00:00.000Z"); // 05:00 ET Sep 24
  assertEquals(
    assessScreenerGenerationSession({
      nowMs,
      referenceIso: new Date(ref).toISOString(),
    }),
    "current",
  );
});

Deno.test("feed session must match clock during live pre-market", () => {
  const premarketMs = Date.parse("2026-09-24T10:10:00.000Z");
  assertEquals(feedSessionMatchesConsumerClock("pre-market", premarketMs), true);
  assertEquals(feedSessionMatchesConsumerClock("after-hours", premarketMs), false);
});

Deno.test("surveillance date flips at 04:00:00.000 ET and not one millisecond earlier", () => {
  const before = Date.parse("2026-10-05T07:59:59.999Z"); // 03:59:59.999 ET
  const at = Date.parse("2026-10-05T08:00:00.000Z"); // 04:00:00.000 ET
  const after = Date.parse("2026-10-05T08:00:01.000Z"); // 04:00:01 ET
  assertEquals(surveillanceTradingDateFromMs(before), "2026-10-04");
  assertEquals(surveillanceTradingDateFromMs(at), "2026-10-05");
  assertEquals(surveillanceTradingDateFromMs(after), "2026-10-05");
});

Deno.test("scanner null calendar closes weekend clocks and reopens Monday across DST", () => {
  const kind = (iso: string) => resolveSyncSessionKind(Date.parse(iso));

  // Friday 2026-10-30 EDT. Inclusive regular close, then after-hours through 20:00 ET.
  assertEquals(kind("2026-10-30T20:00:00.000Z"), "market");
  assertEquals(kind("2026-10-30T20:00:00.001Z"), "after-hours");
  assertEquals(kind("2026-10-31T00:00:00.000Z"), "after-hours");
  assertEquals(kind("2026-10-31T00:00:00.001Z"), "closed");

  // Saturday production clocks: 04:00, 10:00, and 17:30 ET. Not a 23×5 open.
  assertEquals(kind("2026-10-31T08:00:00.000Z"), "closed");
  assertEquals(kind("2026-10-31T14:00:00.000Z"), "closed");
  assertEquals(kind("2026-10-31T21:30:00.000Z"), "closed");

  // Sunday 2026-11-01 fallback: both 01:30 ET occurrences, then a regular-hour clock.
  assertEquals(kind("2026-11-01T05:30:00.000Z"), "closed");
  assertEquals(kind("2026-11-01T06:30:00.000Z"), "closed");
  assertEquals(kind("2026-11-01T15:00:00.000Z"), "closed");

  // Monday reopen in EST, including the 04:00 ET premarket boundary.
  assertEquals(kind("2026-11-02T08:59:00.000Z"), "closed");
  assertEquals(kind("2026-11-02T09:00:00.000Z"), "pre-market");
  assertEquals(kind("2026-11-02T14:30:00.000Z"), "market");
  assertEquals(kind("2026-11-02T22:30:00.000Z"), "after-hours");

  // Spring-forward Sunday stays closed; the following Monday reopens in EDT.
  assertEquals(kind("2026-03-08T06:30:00.000Z"), "closed");
  assertEquals(kind("2026-03-08T07:30:00.000Z"), "closed");
  assertEquals(kind("2026-03-09T13:30:00.000Z"), "market");
});

Deno.test("Saturday premarket clock does not treat Friday's feed as a live-session miss", () => {
  const saturdayPremarketClock = Date.parse("2026-10-31T08:00:00.000Z");
  assertEquals(
    assessScreenerGenerationSession({
      nowMs: saturdayPremarketClock,
      referenceIso: "2026-10-31T03:20:02.000Z",
    }),
    "not_applicable",
  );
});

Deno.test("closed overnight session does not apply live-session rejection", () => {
  const overnightMs = Date.parse("2026-09-24T06:00:00.000Z"); // 02:00 ET Sep 24
  const ahCloseMs = Date.parse("2026-09-24T00:00:00.000Z");
  assertEquals(
    assessScreenerGenerationSession({
      nowMs: overnightMs,
      referenceIso: new Date(ahCloseMs).toISOString(),
    }),
    "not_applicable",
  );
});
