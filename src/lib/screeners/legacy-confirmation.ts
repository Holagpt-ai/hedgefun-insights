/**
 * Legacy V2.1 Day Trade Radar confirmation overlay (D13).
 *
 * Sentinel ranking is authoritative. Validated screener_results may attach
 * confirmation metadata onto already-ranked Sentinel symbols. Overlay never
 * reorders rows, never fabricates missing fields, and never injects names
 * that Sentinel did not already rank.
 *
 * Gates (only when the underlying legacy field is a finite number):
 *  - price $2–$20
 *  - change_percent ≥ +10
 *  - volume_ratio_prior_session ≥ 5
 */

import { isFiniteNumber, type ScreenerResultRow } from "@/lib/screeners/contract";

export const LEGACY_PRICE_MIN = 2;
export const LEGACY_PRICE_MAX = 20;
export const LEGACY_MOVE_MIN_PCT = 10;
export const LEGACY_VOLUME_RATIO_MIN = 5;

export const LEGACY_CONFIRMED_BADGE = "LEGACY CONFIRMED";
export const LEGACY_CONFIRMED_DETAIL = "$2–$20 · +10% · ≥5× PRIOR";

export interface LegacyConfirmationOverlay {
  legacy_confirmed: boolean;
  legacy_price_gate: boolean | null;
  legacy_move_gate: boolean | null;
  legacy_volume_gate: boolean | null;
}

const UNAVAILABLE: LegacyConfirmationOverlay = {
  legacy_confirmed: false,
  legacy_price_gate: null,
  legacy_move_gate: null,
  legacy_volume_gate: null,
};

function gate(value: number | null | undefined, predicate: (n: number) => boolean): boolean | null {
  if (!isFiniteNumber(value)) return null;
  return predicate(value);
}

export function evaluateLegacyConfirmation(
  legacy: ScreenerResultRow | null | undefined,
): LegacyConfirmationOverlay {
  if (!legacy) return { ...UNAVAILABLE };

  const legacy_price_gate = gate(
    legacy.price,
    (n) => n >= LEGACY_PRICE_MIN && n <= LEGACY_PRICE_MAX,
  );
  const legacy_move_gate = gate(legacy.change_percent, (n) => n >= LEGACY_MOVE_MIN_PCT);
  const legacy_volume_gate = gate(
    legacy.volume_ratio_prior_session,
    (n) => n >= LEGACY_VOLUME_RATIO_MIN,
  );

  return {
    legacy_confirmed:
      legacy_price_gate === true &&
      legacy_move_gate === true &&
      legacy_volume_gate === true,
    legacy_price_gate,
    legacy_move_gate,
    legacy_volume_gate,
  };
}

function normalizeSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const trimmed = symbol.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildLegacyConfirmationLookup(
  legacyRows: readonly ScreenerResultRow[] | null | undefined,
): Map<string, ScreenerResultRow> {
  const lookup = new Map<string, ScreenerResultRow>();
  for (const row of legacyRows ?? []) {
    const key = normalizeSymbol(row.symbol);
    if (!key) continue;
    if (row.tab_id && row.tab_id !== "day_trade_radar") continue;
    if (!lookup.has(key)) lookup.set(key, row);
  }
  return lookup;
}

/**
 * Attach confirmation metadata onto Sentinel rows in the given order.
 * Does not sort, filter, or insert extra symbols.
 */
export function overlayLegacyConfirmation<T extends { symbol: string }>(
  sentinelRows: readonly T[],
  legacyRows: readonly ScreenerResultRow[] | null | undefined,
): Array<T & LegacyConfirmationOverlay> {
  const lookup = buildLegacyConfirmationLookup(legacyRows);
  return sentinelRows.map((row) => {
    const key = normalizeSymbol(row.symbol);
    const match = key ? lookup.get(key) : undefined;
    return { ...row, ...evaluateLegacyConfirmation(match) };
  });
}
