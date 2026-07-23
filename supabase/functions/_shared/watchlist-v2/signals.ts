// Watchlist V2 — closed-set deterministic market signals.
// Every signal_id is a literal string from the authorized closed set.
// No composites, tallies, weights, or scores.
//
// State signals use published key_levels (hod/lod/vwap).
// Transition signals use excluded-current levels + previous_bar_close.

import type {
  IntradayBar, KeyLevels, MarketSignal, RvolClass, SessionType,
} from "./contract.ts";
import type { TransitionLevels } from "./levels.ts";

const RULE_VERSION = "w2b1c.1" as const;

export interface EmitInput {
  bars: IntradayBar[];
  keyLevels: KeyLevels;
  transitionLevels: TransitionLevels;
  price: number | null;
  rvol: number | null;
  rvolClass: RvolClass | null;
  sessionType: SessionType;
  analyzedAt: string;
}

function round(n: number, dp = 4): number {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

export function emitMarketSignals(input: EmitInput): MarketSignal[] {
  const out: MarketSignal[] = [];
  const { keyLevels: kl, transitionLevels: tr, price, rvol, rvolClass, analyzedAt } = input;
  if (input.bars.length === 0 || price === null) return out;

  // ── State signals ───────────────────────────────────────────────────────

  // price_above_vwap / price_below_vwap
  if (kl.vwap !== null) {
    if (price > kl.vwap) {
      out.push({
        signal_id: "price_above_vwap",
        label: "Price above VWAP",
        category: "trend", kind: "state", direction: "bullish",
        facts: { price: round(price), vwap: round(kl.vwap) },
        inputs: ["price", "vwap"],
        observed_at: analyzedAt, rule_version: RULE_VERSION,
      });
    } else if (price < kl.vwap) {
      out.push({
        signal_id: "price_below_vwap",
        label: "Price below VWAP",
        category: "trend", kind: "state", direction: "bearish",
        facts: { price: round(price), vwap: round(kl.vwap) },
        inputs: ["price", "vwap"],
        observed_at: analyzedAt, rule_version: RULE_VERSION,
      });
    }
  }

  // range_position_high / range_position_low (published hod/lod)
  if (kl.hod !== null && kl.lod !== null && kl.hod > kl.lod) {
    const pos = (price - kl.lod) / (kl.hod - kl.lod);
    if (pos >= 0.8) {
      out.push({
        signal_id: "range_position_high",
        label: "Price in upper 20% of intraday range",
        category: "range", kind: "state", direction: "bullish",
        facts: { price: round(price), hod: round(kl.hod), lod: round(kl.lod), position: round(pos) },
        inputs: ["price", "hod", "lod"],
        observed_at: analyzedAt, rule_version: RULE_VERSION,
      });
    } else if (pos <= 0.2) {
      out.push({
        signal_id: "range_position_low",
        label: "Price in lower 20% of intraday range",
        category: "range", kind: "state", direction: "bearish",
        facts: { price: round(price), hod: round(kl.hod), lod: round(kl.lod), position: round(pos) },
        inputs: ["price", "hod", "lod"],
        observed_at: analyzedAt, rule_version: RULE_VERSION,
      });
    }
  }

  // unusual_time_adjusted_volume
  if (rvol !== null && rvolClass === "unusual") {
    out.push({
      signal_id: "unusual_time_adjusted_volume",
      label: "Unusual time-adjusted volume",
      category: "volume", kind: "state", direction: "neutral",
      facts: { rvol, rvol_class: rvolClass },
      inputs: ["rvol", "rvol_class"],
      observed_at: analyzedAt, rule_version: RULE_VERSION,
    });
  }

  // ── Transition signals ─ require previous_bar_close ─────────────────────
  const pbc = tr.previous_bar_close;
  if (pbc === null) return out;

  // hod_break
  if (tr.hod_excl_current !== null && pbc < tr.hod_excl_current && price >= tr.hod_excl_current) {
    out.push({
      signal_id: "hod_break",
      label: "Broke prior intraday high",
      category: "level", kind: "transition", direction: "bullish",
      facts: { previous_bar_close: round(pbc), hod_excl_current: round(tr.hod_excl_current), price: round(price) },
      inputs: ["previous_bar_close", "hod_excl_current"],
      observed_at: analyzedAt, rule_version: RULE_VERSION,
    });
  }
  // lod_break
  if (tr.lod_excl_current !== null && pbc > tr.lod_excl_current && price <= tr.lod_excl_current) {
    out.push({
      signal_id: "lod_break",
      label: "Broke prior intraday low",
      category: "level", kind: "transition", direction: "bearish",
      facts: { previous_bar_close: round(pbc), lod_excl_current: round(tr.lod_excl_current), price: round(price) },
      inputs: ["previous_bar_close", "lod_excl_current"],
      observed_at: analyzedAt, rule_version: RULE_VERSION,
    });
  }
  // premarket_high_break
  if (
    tr.premarket_high_excl_current !== null &&
    pbc <= tr.premarket_high_excl_current &&
    price > tr.premarket_high_excl_current
  ) {
    out.push({
      signal_id: "premarket_high_break",
      label: "Broke premarket high",
      category: "level", kind: "transition", direction: "bullish",
      facts: {
        previous_bar_close: round(pbc),
        premarket_high_excl_current: round(tr.premarket_high_excl_current),
        price: round(price),
      },
      inputs: ["previous_bar_close", "premarket_high_excl_current"],
      observed_at: analyzedAt, rule_version: RULE_VERSION,
    });
  }
  // premarket_low_break
  if (
    tr.premarket_low_excl_current !== null &&
    pbc >= tr.premarket_low_excl_current &&
    price < tr.premarket_low_excl_current
  ) {
    out.push({
      signal_id: "premarket_low_break",
      label: "Broke premarket low",
      category: "level", kind: "transition", direction: "bearish",
      facts: {
        previous_bar_close: round(pbc),
        premarket_low_excl_current: round(tr.premarket_low_excl_current),
        price: round(price),
      },
      inputs: ["previous_bar_close", "premarket_low_excl_current"],
      observed_at: analyzedAt, rule_version: RULE_VERSION,
    });
  }
  // prior_close_reclaim
  if (kl.prior_close !== null && pbc <= kl.prior_close && price > kl.prior_close) {
    out.push({
      signal_id: "prior_close_reclaim",
      label: "Reclaimed prior close",
      category: "level", kind: "transition", direction: "bullish",
      facts: { previous_bar_close: round(pbc), prior_close: round(kl.prior_close), price: round(price) },
      inputs: ["previous_bar_close", "prior_close"],
      observed_at: analyzedAt, rule_version: RULE_VERSION,
    });
  }
  // prior_close_loss
  if (kl.prior_close !== null && pbc >= kl.prior_close && price < kl.prior_close) {
    out.push({
      signal_id: "prior_close_loss",
      label: "Lost prior close",
      category: "level", kind: "transition", direction: "bearish",
      facts: { previous_bar_close: round(pbc), prior_close: round(kl.prior_close), price: round(price) },
      inputs: ["previous_bar_close", "prior_close"],
      observed_at: analyzedAt, rule_version: RULE_VERSION,
    });
  }

  return out;
}

export const TRANSITION_ALERT_SIGNAL_IDS = new Set([
  "hod_break", "lod_break",
  "premarket_high_break", "premarket_low_break",
  "prior_close_loss", "prior_close_reclaim",
]);
