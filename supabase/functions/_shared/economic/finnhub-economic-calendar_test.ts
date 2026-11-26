import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
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

Deno.test("builds deduped economic rows without fabricating consensus", () => {
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
  assertEquals(built.rows[0].importance, "high");
});

Deno.test("finnhub economic time maps to ET date", () => {
  const parts = finnhubEconomicTimeParts("2026-11-26T13:30:00");
  assertEquals(parts?.event_date, "2026-11-26");
});