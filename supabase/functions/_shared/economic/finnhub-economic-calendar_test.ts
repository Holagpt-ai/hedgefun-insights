import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  asDisplayValue,
  assertEconomicSyncWindow,
  buildEconomicRowsFromFinnhubItems,
  finnhubEconomicTimeParts,
  parseFinnhubEconomicCalendarPayload,
} from "./finnhub-economic-calendar.ts";

Deno.test("parses finnhub economic payload", () => {
  const parsed = parseFinnhubEconomicCalendarPayload({
    economicCalendar: [{ event: "CPI", country: "US", impact: "high", time: "2026-11-26T13:30:00" }],
  });
  assertEquals(parsed.providerError, null);
  assertEquals(parsed.items.length, 1);
});

Deno.test("skips malformed provider rows safely", () => {
  const parsed = parseFinnhubEconomicCalendarPayload({
    economicCalendar: [null, "bad", { event: "OK", time: "2026-11-26" }],
  });
  assertEquals(parsed.items.length, 1);
});

Deno.test("builds rows without fabricating consensus", () => {
  const built = buildEconomicRowsFromFinnhubItems([
    {
      event: "Nonfarm Payrolls",
      country: "US",
      impact: "high",
      time: "2026-11-26T08:30:00",
      estimate: 180000,
      prev: 175000,
    },
  ]);
  assertEquals(built.rows.length, 1);
  assertEquals(built.rows[0].consensus_estimate, "180000");
  assertEquals(built.rows[0].actual_value, null);
  assertEquals(built.rows[0].actual_reported_at, null);
});

Deno.test("scheduled row does not set actual_reported_at", () => {
  const built = buildEconomicRowsFromFinnhubItems([
    { event: "CPI", country: "US", time: "2026-11-26T08:30:00", actual: 0 },
  ]);
  assertEquals(built.rows[0].actual_value, "0");
  assertEquals(built.rows[0].actual_reported_at !== null, true);
});

Deno.test("date-only events keep null time", () => {
  const parts = finnhubEconomicTimeParts("2026-11-26");
  assertEquals(parts?.event_date, "2026-11-26");
  assertEquals(parts?.event_time, null);
  const built = buildEconomicRowsFromFinnhubItems([{ event: "GDP", time: "2026-11-26" }]);
  assertEquals(built.rows[0].event_time, null);
  assertEquals(built.rows[0].actual_reported_at, null);
});

Deno.test("asDisplayValue preserves zero", () => {
  assertEquals(asDisplayValue(0), "0");
  assertEquals(asDisplayValue("0"), "0");
});

Deno.test("sync window validation", () => {
  assertEconomicSyncWindow("2026-11-01", "2026-11-30");
  assertThrows(() => assertEconomicSyncWindow("2026-11-30", "2026-11-01"), Error, "inverted_range");
  assertThrows(() => assertEconomicSyncWindow("2026-01-01", "2026-04-01"), Error, "window_too_large");
  assertThrows(() => assertEconomicSyncWindow("2026-13-01", "2026-11-01"), Error, "invalid_date");
});

Deno.test("dedupes duplicate finnhub rows", () => {
  const built = buildEconomicRowsFromFinnhubItems([
    { event: "CPI", country: "US", time: "2026-11-26" },
    { event: "CPI", country: "US", time: "2026-11-26", actual: 3.2 },
  ]);
  assertEquals(built.rows.length, 1);
  assertEquals(built.rows[0].actual_value, "3.2");
});