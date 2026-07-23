import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { emitMarketSignals } from "./signals.ts";

const analyzedAt = "2026-07-23T15:00:00Z";
const t0930 = Date.parse("2026-07-23T13:30:00Z");
const t0931 = Date.parse("2026-07-23T13:31:00Z");
const bars = [
  { t: t0930, o: 100, h: 100.5, l: 99.5, c: 99.8, v: 1000 },
  { t: t0931, o: 99.8, h: 102, l: 99.7, c: 101.5, v: 3000 },
];
const kl = {
  vwap: 100, hod: 102, lod: 99.5, premarket_high: 100.2, premarket_low: 99.8,
  prior_close: 100, basis: { hod_lod_scope: "rth" as const, vwap_scope: "rth" as const },
};
const tr = {
  hod_excl_current: 100.5, lod_excl_current: 99.5,
  premarket_high_excl_current: 100.2, premarket_low_excl_current: 99.8,
  previous_bar_close: 99.8,
};

Deno.test("emits vwap_cross.up and hod_break when both fire", () => {
  const sigs = emitMarketSignals({
    bars, keyLevels: kl, transitionLevels: tr, price: 101.5, rvol: 3.2, rvolClass: "unusual",
    sessionType: "rth", analyzedAt,
  });
  const ids = sigs.map((s) => s.signal_id);
  assert(ids.includes("transition.vwap_cross.up"));
  assert(ids.includes("transition.hod_break"));
  assert(ids.includes("state.price_vs_vwap.above"));
  assert(ids.includes("state.near_hod"));
});

Deno.test("emits nothing without bars", () => {
  const sigs = emitMarketSignals({
    bars: [], keyLevels: kl, transitionLevels: tr, price: null, rvol: null, rvolClass: null,
    sessionType: "rth", analyzedAt,
  });
  assertEquals(sigs.length, 0);
});

Deno.test("every signal carries a rule_version", () => {
  const sigs = emitMarketSignals({
    bars, keyLevels: kl, transitionLevels: tr, price: 101.5, rvol: null, rvolClass: null,
    sessionType: "rth", analyzedAt,
  });
  for (const s of sigs) assertEquals(s.rule_version, "w2b1c.1");
});
