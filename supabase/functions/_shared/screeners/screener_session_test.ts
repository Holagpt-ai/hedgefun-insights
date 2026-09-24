import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assessScreenerGenerationSession,
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
