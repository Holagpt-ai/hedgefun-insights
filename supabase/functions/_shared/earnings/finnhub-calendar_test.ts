import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildEarningsRowsFromFinnhubItems,
  computeSurprisePercent,
  finiteDecimalField,
  parseFinnhubEarningsCalendarPayload,
} from "./finnhub-calendar.ts";
import { upsertEarningsCalendarBatches } from "./persist-earnings-calendar.ts";

Deno.test("parses successful Finnhub earnings payload", () => {
  const parsed = parseFinnhubEarningsCalendarPayload({
    earningsCalendar: [{
      symbol: "AAPL",
      date: "2026-10-30",
      epsEstimate: 1.42,
      epsActual: 1.5,
      hour: "amc",
    }],
  });
  assertEquals(parsed.providerError, null);
  const built = buildEarningsRowsFromFinnhubItems(parsed.items);
  assertEquals(built.rows.length, 1);
  assertEquals(built.rows[0]?.time_of_day, "after_close");
});

Deno.test("empty valid response yields zero rows", () => {
  const parsed = parseFinnhubEarningsCalendarPayload({ earningsCalendar: [] });
  const built = buildEarningsRowsFromFinnhubItems(parsed.items);
  assertEquals(built.rows.length, 0);
});

Deno.test("provider error payload is detected", () => {
  const parsed = parseFinnhubEarningsCalendarPayload({ error: "Invalid API key" });
  assertEquals(parsed.providerError, "Invalid API key");
});

Deno.test("malformed payload is rejected safely", () => {
  const parsed = parseFinnhubEarningsCalendarPayload("not-json");
  assertEquals(parsed.providerError, "malformed_payload");
});

Deno.test("overflowing EPS values are nulled instead of failing upsert", () => {
  const built = buildEarningsRowsFromFinnhubItems([{
    symbol: "HUGE",
    date: "2026-10-01",
    epsEstimate: 999999,
    epsActual: 1,
    hour: "bmo",
  }]);
  assertEquals(built.rows[0]?.estimate_eps, null);
  assertEquals(built.rows[0]?.actual_eps, 1);
  assertEquals(built.sanitizedFields >= 1, true);
});

Deno.test("zero estimate does not produce invalid surprise percent", () => {
  assertEquals(computeSurprisePercent(0, 1), null);
  assertEquals(finiteDecimalField(Number.POSITIVE_INFINITY), null);
});

Deno.test("missing EPS fields remain null", () => {
  const built = buildEarningsRowsFromFinnhubItems([{
    symbol: "XYZ",
    date: "2026-10-01",
    hour: "dmh",
  }]);
  assertEquals(built.rows[0]?.estimate_eps, null);
  assertEquals(built.rows[0]?.actual_eps, null);
  assertEquals(built.rows[0]?.surprise_percent, null);
});

Deno.test("duplicate symbol/date keeps row with actual EPS", () => {
  const built = buildEarningsRowsFromFinnhubItems([
    { symbol: "AAA", date: "2026-10-01", epsEstimate: 1 },
    { symbol: "AAA", date: "2026-10-01", epsActual: 1.2 },
  ]);
  assertEquals(built.rows.length, 1);
  assertEquals(built.rows[0]?.actual_eps, 1.2);
});

Deno.test("database upsert failure surfaces as error", async () => {
  await Promise.resolve().then(async () => {
    let threw = false;
    try {
      await upsertEarningsCalendarBatches({
        rows: [{
          symbol: "AAA",
          company_name: "AAA",
          report_date: "2026-10-01",
          estimate_eps: 1,
          actual_eps: null,
          surprise_percent: null,
          time_of_day: "during",
        }],
        supabase: {
          from: () => ({
            upsert: async () => ({ error: { message: "upsert_failed" } }),
          }),
        },
      });
    } catch (error) {
      threw = true;
      assertEquals((error as Error).message, "upsert_failed");
    }
    assertEquals(threw, true);
  });
});

Deno.test("failed sync with zero rows does not call upsert batches", async () => {
  let calls = 0;
  const result = await upsertEarningsCalendarBatches({
    rows: [],
    supabase: {
      from: () => ({
        upsert: async () => {
          calls += 1;
          return { error: null };
        },
      }),
    },
  });
  assertEquals(result.upserted, 0);
  assertEquals(calls, 0);
});
