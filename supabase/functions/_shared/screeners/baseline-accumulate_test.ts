import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyBaselineDay,
  publishableBaselineRows,
  type StagingRow,
} from "./baseline-accumulate.ts";

function empty(): {
  staging: Map<string, StagingRow>;
  processed: Set<string>;
} {
  return { staging: new Map(), processed: new Set() };
}

Deno.test("repeated date processing is idempotent", () => {
  const { staging, processed } = empty();
  const first = applyBaselineDay(staging, processed, "2026-08-10", [
    { symbol: "AAA", h: 10, l: 5 },
  ]);
  const second = applyBaselineDay(staging, processed, "2026-08-10", [
    { symbol: "AAA", h: 99, l: 1 },
  ]);
  assertEquals(first, { applied: true, skipped: false });
  assertEquals(second, { applied: false, skipped: true });
  assertEquals(staging.get("AAA")?.high_52w, 10);
  assertEquals(staging.get("AAA")?.sessions_observed, 1);
});

Deno.test("invalid bars are rejected without fabricating symbols", () => {
  const { staging, processed } = empty();
  applyBaselineDay(staging, processed, "2026-08-10", [
    { symbol: "AAA", h: 10, l: 5 },
    { symbol: "BAD", h: 0, l: 1 },
    { symbol: "FLIP", h: 2, l: 9 },
    { symbol: "1BAD", h: 8, l: 2 },
  ]);
  assertEquals([...staging.keys()], ["AAA"]);
});

Deno.test("incomplete history is omitted from publishable rows", () => {
  const { staging, processed } = empty();
  applyBaselineDay(staging, processed, "2026-08-10", [
    { symbol: "SHORT", h: 10, l: 5 },
    { symbol: "FULL", h: 10, l: 5 },
  ]);
  applyBaselineDay(staging, processed, "2026-08-11", [
    { symbol: "FULL", h: 12, l: 4 },
  ]);
  applyBaselineDay(staging, processed, "2026-08-12", [
    { symbol: "FULL", h: 11, l: 6 },
  ]);
  const rows = publishableBaselineRows(
    staging,
    3,
    "2026-08-10",
    "2026-08-12",
    "2026-08-12T20:00:00.000Z",
  );
  assertEquals(rows.map((r) => r.symbol), ["FULL"]);
  assertEquals(rows[0].high_52w, 12);
  assertEquals(rows[0].low_52w, 4);
  assertEquals(rows[0].sessions_observed, 3);
});

Deno.test("batches resume by applying only unprocessed dates", () => {
  const { staging, processed } = empty();
  applyBaselineDay(staging, processed, "2026-08-10", [
    { symbol: "AAA", h: 10, l: 8 },
  ]);
  applyBaselineDay(staging, processed, "2026-08-11", [
    { symbol: "AAA", h: 11, l: 7 },
  ]);
  assertEquals(processed.has("2026-08-10"), true);
  assertEquals(staging.get("AAA")?.sessions_observed, 2);
  applyBaselineDay(staging, processed, "2026-08-12", [
    { symbol: "AAA", h: 9, l: 6 },
  ]);
  assertEquals(staging.get("AAA")?.low_52w, 6);
  assertEquals(staging.get("AAA")?.sessions_observed, 3);
});

Deno.test("valid daily payload accumulates high up and low down", () => {
  const { staging, processed } = empty();
  applyBaselineDay(staging, processed, "2026-08-10", [
    { symbol: "AAA", h: 10, l: 5 },
  ]);
  applyBaselineDay(staging, processed, "2026-08-11", [
    { symbol: "AAA", h: 12, l: 6 },
  ]);
  applyBaselineDay(staging, processed, "2026-08-12", [
    { symbol: "AAA", h: 11, l: 4 },
  ]);
  assertEquals(staging.get("AAA")?.high_52w, 12);
  assertEquals(staging.get("AAA")?.high_date, "2026-08-11");
  assertEquals(staging.get("AAA")?.low_52w, 4);
  assertEquals(staging.get("AAA")?.low_date, "2026-08-12");
  assertEquals(staging.get("AAA")?.sessions_observed, 3);
});

Deno.test("invalid symbol, high/low, and malformed numeric rows are skipped", () => {
  const { staging, processed } = empty();
  applyBaselineDay(staging, processed, "2026-08-10", [
    { symbol: "AAA", h: 10, l: 5 },
    { symbol: "1BAD", h: 8, l: 2 },
    { symbol: "FLIP", h: 2, l: 9 },
    { symbol: "ZERO", h: 0, l: 1 },
    { symbol: "NAN", h: "nope", l: 3 },
    null,
    12,
  ]);
  assertEquals([...staging.keys()], ["AAA"]);
  assertEquals(processed.has("2026-08-10"), true);
});

Deno.test("empty and zero-valid-row days still record the session date", () => {
  const { staging, processed } = empty();
  const emptyDay = applyBaselineDay(staging, processed, "2026-08-10", []);
  const skippedAll = applyBaselineDay(staging, processed, "2026-08-11", [
    { symbol: "BAD", h: 0, l: 1 },
  ]);
  assertEquals(emptyDay, { applied: true, skipped: false });
  assertEquals(skippedAll, { applied: true, skipped: false });
  assertEquals(staging.size, 0);
  assertEquals([...processed].sort(), ["2026-08-10", "2026-08-11"]);
});
