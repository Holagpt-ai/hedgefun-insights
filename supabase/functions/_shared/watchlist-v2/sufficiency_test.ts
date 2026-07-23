import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateSufficiency, explain, MIN_BARS_FOR_AI } from "./sufficiency.ts";
import type { InputsQuality } from "./contract.ts";

const baseQuality: InputsQuality = {
  snapshot: "ok", bars: "ok", prior_close: "ok",
  volume: "ok", rvol: "ok", events: "ok",
  bar_count: MIN_BARS_FOR_AI, feed_delay_note: "provider feed is 15-minute delayed",
  reason_codes: [],
};

const okInput = {
  quality: baseQuality,
  price: 100, priorClose: 99, volume: 1000,
};

Deno.test("passes when all inputs ok and >= 10 bars", () => {
  const r = evaluateSufficiency(okInput);
  assert(r.ok);
  assertEquals(r.failure_code, null);
});

Deno.test("snapshot malformed wins first", () => {
  const r = evaluateSufficiency({
    ...okInput,
    quality: { ...baseQuality, snapshot: "malformed", bars: "missing" },
    priorClose: null, price: null, volume: null,
  });
  assertEquals(r.failure_code, "SNAPSHOT_MALFORMED");
  assertEquals(r.explanation, explain("SNAPSHOT_MALFORMED"));
});

Deno.test("snapshot stale is a hard failure", () => {
  const r = evaluateSufficiency({ ...okInput, quality: { ...baseQuality, snapshot: "stale" } });
  assertEquals(r.failure_code, "SNAPSHOT_STALE");
});

Deno.test("prior close missing fails before bars", () => {
  const r = evaluateSufficiency({
    ...okInput,
    priorClose: null,
    quality: { ...baseQuality, prior_close: "missing", bars: "insufficient" },
  });
  assertEquals(r.failure_code, "PRIOR_CLOSE_UNAVAILABLE");
});

Deno.test("bars malformed distinct from missing", () => {
  const r = evaluateSufficiency({
    ...okInput,
    quality: { ...baseQuality, bars: "malformed", bar_count: 0 },
  });
  assertEquals(r.failure_code, "BARS_MALFORMED");
});

Deno.test("9 bars is insufficient", () => {
  const r = evaluateSufficiency({
    ...okInput,
    quality: { ...baseQuality, bar_count: 9 },
  });
  assertEquals(r.failure_code, "BARS_INSUFFICIENT");
});

Deno.test("10 bars is sufficient", () => {
  const r = evaluateSufficiency({
    ...okInput,
    quality: { ...baseQuality, bar_count: 10 },
  });
  assert(r.ok);
});

Deno.test("missing price is a controlled failure", () => {
  const r = evaluateSufficiency({ ...okInput, price: null });
  assertEquals(r.failure_code, "PRICE_UNAVAILABLE");
});

Deno.test("missing volume is a controlled failure", () => {
  const r = evaluateSufficiency({ ...okInput, volume: null });
  assertEquals(r.failure_code, "VOLUME_UNAVAILABLE");
});

Deno.test("failure_code and human explanation are separate", () => {
  const r = evaluateSufficiency({
    ...okInput,
    quality: { ...baseQuality, snapshot: "missing" },
  });
  assertEquals(r.failure_code, "SNAPSHOT_MISSING");
  assert(r.explanation && r.explanation.length > 0);
  assert(r.explanation !== r.failure_code);
});
