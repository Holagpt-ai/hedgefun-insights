import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { assessEarningsCalendarSource } from "./earnings-calendar-source.ts";
import { EARNINGS_CALENDAR_FETCH_LIMIT } from "./earnings-market-impact.ts";

Deno.test("earnings calendar source — dedupes duplicate keys", () => {
  const raw = [
    { id: "1", dedupe_key: "AAPL-2026-10-27" },
    { id: "2", dedupe_key: "AAPL-2026-10-27" },
    { id: "3", dedupe_key: "MSFT-2026-10-27" },
  ];
  const stats = assessEarningsCalendarSource(raw);
  assertEquals(stats.dedupedRowCount, 2);
  assertEquals(stats.sourceTruncated, false);
});

Deno.test("earnings calendar source — marks truncation at fetch limit", () => {
  const raw = Array.from({ length: EARNINGS_CALENDAR_FETCH_LIMIT }, (_, i) => ({
    id: String(i),
    dedupe_key: `SYM${i}-2026-10-27`,
  }));
  const stats = assessEarningsCalendarSource(raw);
  assertEquals(stats.rawRowCount, EARNINGS_CALENDAR_FETCH_LIMIT);
  assertEquals(stats.sourceTruncated, true);
});
