// Deterministic state + transition signal emission.
// Signals never invent numbers; every fact is derived from validated inputs.

import type {
  IntradayBar, KeyLevels, MarketSignal, RvolClass, SessionType, SignalCategory,
  SignalDirection, SignalKind,
} from "./contract.ts";
import type { TransitionLevels } from "./levels.ts";

const RULE_VERSION = "w2b1c.1" as const;

interface EmitInput {
  bars: IntradayBar[];
  keyLevels: KeyLevels;
  transitionLevels: TransitionLevels;
  price: number | null;
  rvol: number | null;
  rvolClass: RvolClass | null;
  sessionType: SessionType;
  analyzedAt: string;
}

function mkSignal(
  signal_id: string,
  label: string,
  category: SignalCategory,
  kind: SignalKind,
  direction: SignalDirection,
  facts: Record<string, number | string | boolean>,
  inputs: string[],
  observed_at: string,
): MarketSignal {
  return { signal_id, label, category, kind, direction, facts, inputs, observed_at, rule_version: RULE_VERSION };
}

function round(n: number, dp = 4): number {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

export function emitMarketSignals(input: EmitInput): MarketSignal[] {
  const out: MarketSignal[] = [];
  const { bars, keyLevels, transitionLevels: tr, price, rvol, rvolClass, sessionType, analyzedAt } = input;
  if (bars.length === 0 || price === null) return out;
  const lastBar = bars[bars.length - 1];

  // ── State: above/below/near VWAP ──
  if (keyLevels.vwap !== null) {
    const vwap = keyLevels.vwap;
    const dist = (price - vwap) / vwap;
    const absDist = Math.abs(dist);
    if (absDist <= 0.001) {
      out.push(mkSignal(
        "state.price_vs_vwap.near", "Price near VWAP", "level", "state", "neutral",
        { price, vwap: round(vwap), distance_pct: round(dist * 100) },
        ["bars", "vwap"], analyzedAt,
      ));
    } else if (dist > 0) {
      out.push(mkSignal(
        "state.price_vs_vwap.above", "Price above VWAP", "level", "state", "bullish",
        { price, vwap: round(vwap), distance_pct: round(dist * 100) },
        ["bars", "vwap"], analyzedAt,
      ));
    } else {
      out.push(mkSignal(
        "state.price_vs_vwap.below", "Price below VWAP", "level", "state", "bearish",
        { price, vwap: round(vwap), distance_pct: round(dist * 100) },
        ["bars", "vwap"], analyzedAt,
      ));
    }
  }

  // ── State: near HOD / LOD (within 0.25%) ──
  if (keyLevels.hod !== null) {
    const d = (keyLevels.hod - price) / keyLevels.hod;
    if (d >= 0 && d <= 0.0025) {
      out.push(mkSignal(
        "state.near_hod", "Price at intraday high", "level", "state", "bullish",
        { price, hod: round(keyLevels.hod), distance_pct: round(d * 100) },
        ["bars", "hod"], analyzedAt,
      ));
    }
  }
  if (keyLevels.lod !== null) {
    const d = (price - keyLevels.lod) / keyLevels.lod;
    if (d >= 0 && d <= 0.0025) {
      out.push(mkSignal(
        "state.near_lod", "Price at intraday low", "level", "state", "bearish",
        { price, lod: round(keyLevels.lod), distance_pct: round(d * 100) },
        ["bars", "lod"], analyzedAt,
      ));
    }
  }

  // ── State: RVOL class ──
  if (rvol !== null && rvolClass !== null) {
    const dir: SignalDirection = rvolClass === "normal" ? "neutral" : rvolClass === "elevated" ? "neutral" : "bullish";
    out.push(mkSignal(
      `state.rvol.${rvolClass}`, `Relative volume ${rvolClass}`, "volume", "state", dir,
      { rvol, rvol_class: rvolClass },
      ["cum_volume", "baseline_curve"], analyzedAt,
    ));
  }

  // ── Transition: VWAP cross ──
  if (
    keyLevels.vwap !== null && tr.previous_bar_close !== null && bars.length >= 2
  ) {
    const prev = tr.previous_bar_close;
    const vwap = keyLevels.vwap;
    if (prev <= vwap && price > vwap) {
      out.push(mkSignal(
        "transition.vwap_cross.up", "Crossed above VWAP", "level", "transition", "bullish",
        { previous_close: prev, price, vwap: round(vwap) },
        ["bars", "vwap"], analyzedAt,
      ));
    } else if (prev >= vwap && price < vwap) {
      out.push(mkSignal(
        "transition.vwap_cross.down", "Crossed below VWAP", "level", "transition", "bearish",
        { previous_close: prev, price, vwap: round(vwap) },
        ["bars", "vwap"], analyzedAt,
      ));
    }
  }

  // ── Transition: HOD break ──
  if (tr.hod_excl_current !== null && lastBar.h > tr.hod_excl_current) {
    out.push(mkSignal(
      "transition.hod_break", "Broke prior intraday high", "level", "transition", "bullish",
      { prior_hod: round(tr.hod_excl_current), new_high: round(lastBar.h) },
      ["bars"], analyzedAt,
    ));
  }
  // ── Transition: LOD break ──
  if (tr.lod_excl_current !== null && lastBar.l < tr.lod_excl_current) {
    out.push(mkSignal(
      "transition.lod_break", "Broke prior intraday low", "level", "transition", "bearish",
      { prior_lod: round(tr.lod_excl_current), new_low: round(lastBar.l) },
      ["bars"], analyzedAt,
    ));
  }

  // ── Transition: premarket-high break during RTH ──
  if (
    sessionType === "rth" && keyLevels.premarket_high !== null &&
    lastBar.h > keyLevels.premarket_high
  ) {
    out.push(mkSignal(
      "transition.pmh_break", "Broke premarket high", "level", "transition", "bullish",
      { premarket_high: round(keyLevels.premarket_high), new_high: round(lastBar.h) },
      ["bars", "premarket_high"], analyzedAt,
    ));
  }
  if (
    sessionType === "rth" && keyLevels.premarket_low !== null &&
    lastBar.l < keyLevels.premarket_low
  ) {
    out.push(mkSignal(
      "transition.pml_break", "Broke premarket low", "level", "transition", "bearish",
      { premarket_low: round(keyLevels.premarket_low), new_low: round(lastBar.l) },
      ["bars", "premarket_low"], analyzedAt,
    ));
  }

  return out;
}
