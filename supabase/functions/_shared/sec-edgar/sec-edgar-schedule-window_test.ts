import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSecEdgarScheduledIngestionWindow } from "./sec-edgar-schedule-window.ts";

Deno.test("weekend ET is excluded", () => {
  const sat = new Date("2026-10-24T15:00:00.000Z");
  assertEquals(isSecEdgarScheduledIngestionWindow(sat), false);
});

Deno.test("weekday before 4 AM ET is excluded", () => {
  const early = new Date("2026-10-23T07:59:00.000Z");
  assertEquals(isSecEdgarScheduledIngestionWindow(early), false);
});

Deno.test("weekday at 10 PM ET and later is excluded", () => {
  const late = new Date("2026-10-23T02:30:00.000Z");
  assertEquals(isSecEdgarScheduledIngestionWindow(late), false);
});

Deno.test("weekday midday ET is included (EDT sample)", () => {
  const mid = new Date("2026-10-23T16:00:00.000Z");
  assertEquals(isSecEdgarScheduledIngestionWindow(mid), true);
});

Deno.test("weekday midday ET is included (EST sample)", () => {
  const mid = new Date("2026-01-23T17:00:00.000Z");
  assertEquals(isSecEdgarScheduledIngestionWindow(mid), true);
});
