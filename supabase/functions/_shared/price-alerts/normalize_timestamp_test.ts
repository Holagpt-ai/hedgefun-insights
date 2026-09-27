import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizePolygonTimestampToMs,
  observedAtMsToIso,
} from "./normalize-timestamp.ts";

Deno.test("Polygon nanosecond timestamp converts to valid milliseconds", () => {
  const ns = 1_726_000_000_000_000_000;
  const ms = normalizePolygonTimestampToMs(ns, 0);
  assertEquals(ms, 1_726_000_000_000);
  assertEquals(observedAtMsToIso(ms)?.startsWith("2024-"), true);
});

Deno.test("millisecond timestamp is not double-converted", () => {
  const ms = 1_726_000_000_000;
  assertEquals(normalizePolygonTimestampToMs(ms, 0), ms);
});

Deno.test("missing or invalid timestamp uses fallback safely", () => {
  const fallback = 1_700_000_000_000;
  assertEquals(normalizePolygonTimestampToMs(null, fallback), fallback);
  assertEquals(normalizePolygonTimestampToMs(undefined, fallback), fallback);
  assertEquals(normalizePolygonTimestampToMs(NaN, fallback), fallback);
  assertEquals(observedAtMsToIso(Number.NaN), null);
  assertEquals(observedAtMsToIso(1_726_000_000_000_000_000), null);
});
