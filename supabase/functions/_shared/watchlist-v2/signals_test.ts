import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { emitMarketSignals } from "./signals.ts";
import type { IntradayBar, KeyLevels } from "./contract.ts";
import type { TransitionLevels } from "./levels.ts";

const analyzedAt = "2026-07-23T15:00:00Z";
const t0 = Date.parse("2026-07-23T13:30:00Z");
const t1 = Date.parse("2026-07-23T13:31:00Z");

function bars2(): IntradayBar[] {
  return [
    { t: t0, o: 100, h: 100.5, l: 99.5, c: 99.8, v: 1000 },
    { t: t1, o: 99.8, h: 102, l: 99.7, c: 101.5, v: 3000 },
  ];
}
function kl(overrides: Partial<KeyLevels> = {}): KeyLevels {
  return {
    vwap: 100, hod: 102, lod: 99.5,
    premarket_high: 100.2, premarket_low: 99.8,
    prior_close: 100,
    basis: { hod_lod_scope: "rth", vwap_scope: "rth" },
    ...overrides,
  };
}
function tr(overrides: Partial<TransitionLevels> = {}): TransitionLevels {
  return {
    hod_excl_current: 100.5, lod_excl_current: 99.5,
    premarket_high_excl_current: 100.2, premarket_low_excl_current: 99.8,
    previous_bar_close: 99.8,
    ...overrides,
  };
}

const FORBIDDEN_IDS = [
  "state.price_vs_vwap.near", "state.price_vs_vwap.above", "state.price_vs_vwap.below",
  "state.near_hod", "state.near_lod",
  "state.rvol.normal", "state.rvol.elevated", "state.rvol.unusual",
  "transition.vwap_cross.up", "transition.vwap_cross.down",
  "transition.hod_break", "transition.lod_break",
  "transition.pmh_break", "transition.pml_break",
];

// ── State signals ──────────────────────────────────────────────────────────

Deno.test("price_above_vwap emits when price > vwap", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ vwap: 100 }), transitionLevels: tr(),
    price: 101, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(s.some((x) => x.signal_id === "price_above_vwap"));
});

Deno.test("price_below_vwap emits when price < vwap", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ vwap: 100 }), transitionLevels: tr(),
    price: 99, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(s.some((x) => x.signal_id === "price_below_vwap"));
});

Deno.test("price_above_vwap NOT emitted when vwap is null", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ vwap: null }), transitionLevels: tr(),
    price: 101, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(!s.some((x) => x.signal_id === "price_above_vwap"));
  assert(!s.some((x) => x.signal_id === "price_below_vwap"));
});

Deno.test("range_position_high emits at boundary 0.8", () => {
  // price=101.5, lod=99.5, hod=100 → (101.5-99.5)/(100-99.5)=4 clamp above; use tighter
  // Use: lod=100, hod=110, price=108 → (108-100)/10=0.8
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ lod: 100, hod: 110 }), transitionLevels: tr(),
    price: 108, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(s.some((x) => x.signal_id === "range_position_high"));
});

Deno.test("range_position_low emits at boundary 0.2", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ lod: 100, hod: 110 }), transitionLevels: tr(),
    price: 102, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(s.some((x) => x.signal_id === "range_position_low"));
});

Deno.test("range_position_* NOT emitted when hod<=lod", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ lod: 100, hod: 100 }), transitionLevels: tr(),
    price: 100, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(!s.some((x) => x.signal_id === "range_position_high"));
  assert(!s.some((x) => x.signal_id === "range_position_low"));
});

Deno.test("unusual_time_adjusted_volume emits only for 'unusual' class", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr(),
    price: 101, rvol: 3, rvolClass: "unusual", sessionType: "rth", analyzedAt,
  });
  assert(s.some((x) => x.signal_id === "unusual_time_adjusted_volume"));
});

Deno.test("unusual_time_adjusted_volume NOT emitted for elevated/normal", () => {
  for (const c of ["elevated", "normal"] as const) {
    const s = emitMarketSignals({
      bars: bars2(), keyLevels: kl(), transitionLevels: tr(),
      price: 101, rvol: 1.5, rvolClass: c, sessionType: "rth", analyzedAt,
    });
    assert(!s.some((x) => x.signal_id === "unusual_time_adjusted_volume"));
  }
});

Deno.test("unusual_time_adjusted_volume NOT emitted when rvol null", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr(),
    price: 101, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(!s.some((x) => x.signal_id === "unusual_time_adjusted_volume"));
});

// ── Transition signals ────────────────────────────────────────────────────

Deno.test("hod_break emits on true crossing and carries pbc+level", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ hod_excl_current: 100.5, previous_bar_close: 100 }),
    price: 101, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  const hit = s.find((x) => x.signal_id === "hod_break");
  assert(hit);
  assertEquals(hit!.facts.previous_bar_close, 100);
  assertEquals(hit!.facts.hod_excl_current, 100.5);
});

Deno.test("hod_break NOT emitted when previous_bar_close already above level", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ hod_excl_current: 100, previous_bar_close: 101 }),
    price: 102, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(!s.some((x) => x.signal_id === "hod_break"));
});

Deno.test("lod_break emits on downside crossing", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ lod_excl_current: 99.5, previous_bar_close: 100 }),
    price: 99, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(s.some((x) => x.signal_id === "lod_break"));
});

Deno.test("lod_break NOT emitted when previous_bar_close already below", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ lod_excl_current: 100, previous_bar_close: 99 }),
    price: 98, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(!s.some((x) => x.signal_id === "lod_break"));
});

Deno.test("premarket_high_break emits on true crossing", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ premarket_high_excl_current: 100.2, previous_bar_close: 100 }),
    price: 100.5, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(s.some((x) => x.signal_id === "premarket_high_break"));
});

Deno.test("premarket_high_break NOT emitted when pbc already above", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ premarket_high_excl_current: 100, previous_bar_close: 101 }),
    price: 102, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(!s.some((x) => x.signal_id === "premarket_high_break"));
});

Deno.test("premarket_low_break emits on true crossing", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ premarket_low_excl_current: 99.8, previous_bar_close: 100 }),
    price: 99.5, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(s.some((x) => x.signal_id === "premarket_low_break"));
});

Deno.test("prior_close_reclaim emits on upside crossing", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ prior_close: 100 }), transitionLevels: tr({ previous_bar_close: 99.9 }),
    price: 100.5, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(s.some((x) => x.signal_id === "prior_close_reclaim"));
});

Deno.test("prior_close_reclaim NOT emitted when pbc already above prior_close", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ prior_close: 100 }), transitionLevels: tr({ previous_bar_close: 100.5 }),
    price: 101, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(!s.some((x) => x.signal_id === "prior_close_reclaim"));
});

Deno.test("prior_close_loss emits on downside crossing", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ prior_close: 100 }), transitionLevels: tr({ previous_bar_close: 100.1 }),
    price: 99.5, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(s.some((x) => x.signal_id === "prior_close_loss"));
});

Deno.test("prior_close_loss NOT emitted when pbc already below", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ prior_close: 100 }), transitionLevels: tr({ previous_bar_close: 99 }),
    price: 98, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assert(!s.some((x) => x.signal_id === "prior_close_loss"));
});

Deno.test("transition signals NOT emitted when previous_bar_close is null", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ previous_bar_close: null }),
    price: 101, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  const transitionIds = ["hod_break","lod_break","premarket_high_break","premarket_low_break","prior_close_reclaim","prior_close_loss"];
  for (const id of transitionIds) assert(!s.some((x) => x.signal_id === id));
});

Deno.test("transition signals NOT emitted when required excluded level is null", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ prior_close: null }),
    transitionLevels: tr({ hod_excl_current: null, lod_excl_current: null, premarket_high_excl_current: null, premarket_low_excl_current: null }),
    price: 102, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  const transitionIds = ["hod_break","lod_break","premarket_high_break","premarket_low_break","prior_close_reclaim","prior_close_loss"];
  for (const id of transitionIds) assert(!s.some((x) => x.signal_id === id));
});

// ── Non-circularity ─ decided against excluded levels, not published ─────
Deno.test("hod_break uses hod_excl_current, not published hod", () => {
  // Final bar prints session high 105; but transition tests against hod_excl_current=100.
  const bars: IntradayBar[] = [
    { t: t0, o: 100, h: 100, l: 99, c: 99.5, v: 1000 },
    { t: t1, o: 99.5, h: 105, l: 99.5, c: 105, v: 1000 },
  ];
  const s = emitMarketSignals({
    bars,
    keyLevels: kl({ hod: 105 }),
    transitionLevels: tr({ hod_excl_current: 100, previous_bar_close: 99.5 }),
    price: 105, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  const hit = s.find((x) => x.signal_id === "hod_break");
  assert(hit);
  assertEquals(hit!.facts.hod_excl_current, 100);
});

// ── Meta ──────────────────────────────────────────────────────────────────

Deno.test("emits nothing without bars", () => {
  const s = emitMarketSignals({
    bars: [], keyLevels: kl(), transitionLevels: tr(),
    price: null, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  assertEquals(s.length, 0);
});

Deno.test("no forbidden legacy signal_id appears in output", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ previous_bar_close: 100 }),
    price: 101.5, rvol: 3.2, rvolClass: "unusual", sessionType: "rth", analyzedAt,
  });
  const ids = s.map((x) => x.signal_id);
  for (const bad of FORBIDDEN_IDS) assert(!ids.includes(bad), `forbidden id ${bad} appeared`);
});

Deno.test("output has no aggregate/total/count/composite field", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ previous_bar_close: 100 }),
    price: 101.5, rvol: 3.2, rvolClass: "unusual", sessionType: "rth", analyzedAt,
  });
  const serialized = JSON.stringify(s).toLowerCase();
  for (const bad of ["score","confidence","weight","tally","composite","aggregate","tier","band"]) {
    assert(!serialized.includes(bad), `forbidden token '${bad}' in output`);
  }
});

Deno.test("state signals emit before transition signals", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl({ prior_close: 100 }),
    transitionLevels: tr({ hod_excl_current: 100.5, previous_bar_close: 100 }),
    price: 101, rvol: 3, rvolClass: "unusual", sessionType: "rth", analyzedAt,
  });
  let sawTransition = false;
  for (const sig of s) {
    if (sig.kind === "transition") sawTransition = true;
    else if (sawTransition) assert(false, "state signal after transition signal");
  }
});

Deno.test("every signal carries rule_version w2b1c.1", () => {
  const s = emitMarketSignals({
    bars: bars2(), keyLevels: kl(), transitionLevels: tr({ previous_bar_close: 100 }),
    price: 101.5, rvol: null, rvolClass: null, sessionType: "rth", analyzedAt,
  });
  for (const sig of s) assertEquals(sig.rule_version, "w2b1c.1");
});
