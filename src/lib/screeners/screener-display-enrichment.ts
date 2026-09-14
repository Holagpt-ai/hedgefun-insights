/**
 * Screener display-field enrichment for Radar V2 Sentinel rows.
 *
 * Sentinel ranking stays volume-first and authoritative. When verified
 * screener_results or radar_v22_board rows carry honest day/session metrics
 * that Sentinel does not persist, copy them onto matching Sentinel symbols
 * for display only. Never fabricate values or reorder rows.
 */

import {
  expectedVolumeRatio,
  isFiniteNumber,
  isPositiveFinite,
  type ScreenerResultRow,
} from "@/lib/screeners/contract";

export interface DisplayFieldDonor {
  symbol: string;
  tab_id?: string | null;
  change_percent?: number | null;
  prior_session_volume?: number | null;
  volume_ratio_prior_session?: number | null;
  gap_percent?: number | null;
  company_name?: string | null;
}

const TAB_PRIORITY: Record<string, number> = {
  day_trade_radar: 5,
  volume_spikes: 4,
  unusual_volume: 3,
  gainers_losers: 2,
  gappers: 1,
  new_highs_lows: 0,
};

function normalizeSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const trimmed = symbol.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function priorRatioPairValid(
  prior: number | null | undefined,
  ratio: number | null | undefined,
  volume?: number | null,
): boolean {
  if (!isPositiveFinite(prior) || !isPositiveFinite(ratio)) return false;
  if (volume !== undefined && volume !== null) {
    if (!isPositiveFinite(volume)) return false;
    if (expectedVolumeRatio(volume, prior) !== ratio) return false;
  }
  return true;
}

function donorScore(donor: DisplayFieldDonor): number {
  let score = 0;
  if (isFiniteNumber(donor.change_percent)) score += 1;
  if (priorRatioPairValid(donor.prior_session_volume, donor.volume_ratio_prior_session)) {
    score += 2;
  }
  if (isFiniteNumber(donor.gap_percent)) score += 1;
  if (typeof donor.company_name === "string" && donor.company_name.trim()) score += 1;
  return score;
}

function tabPriority(tabId: string | null | undefined): number {
  if (!tabId) return -1;
  return TAB_PRIORITY[tabId] ?? 0;
}

function isBetterDonor(
  candidate: DisplayFieldDonor,
  incumbent: DisplayFieldDonor | undefined,
  preferredTabId: string | null,
): boolean {
  if (!incumbent) return true;
  const candidatePreferred =
    preferredTabId && candidate.tab_id === preferredTabId ? 1 : 0;
  const incumbentPreferred =
    preferredTabId && incumbent.tab_id === preferredTabId ? 1 : 0;
  if (candidatePreferred !== incumbentPreferred) {
    return candidatePreferred > incumbentPreferred;
  }
  const scoreDelta = donorScore(candidate) - donorScore(incumbent);
  if (scoreDelta !== 0) return scoreDelta > 0;
  const tabDelta = tabPriority(candidate.tab_id) - tabPriority(incumbent.tab_id);
  if (tabDelta !== 0) return tabDelta > 0;
  return false;
}

/**
 * Build a per-symbol lookup of the best verified display-field donor.
 * Searches all screener_results tabs plus optional radar_v22_board rows.
 */
export function buildDisplayFieldLookup(
  screenerRows: readonly ScreenerResultRow[] | null | undefined,
  boardRows: readonly DisplayFieldDonor[] | null | undefined,
  preferredTabId: string | null = null,
): Map<string, DisplayFieldDonor> {
  const lookup = new Map<string, DisplayFieldDonor>();

  const consider = (donor: DisplayFieldDonor) => {
    const key = normalizeSymbol(donor.symbol);
    if (!key) return;
    const incumbent = lookup.get(key);
    if (isBetterDonor(donor, incumbent, preferredTabId)) {
      lookup.set(key, donor);
    }
  };

  for (const row of screenerRows ?? []) {
    consider(row);
  }
  for (const row of boardRows ?? []) {
    consider({ ...row, tab_id: "radar_v22_board" });
  }

  return lookup;
}

export interface EnrichDisplayFieldsOptions {
  preferredTabId?: string | null;
  allowGap?: boolean;
}

/**
 * Fill null Sentinel display fields from a verified donor. Sentinel price,
 * volume, ranking metadata, and sync identity are never overwritten.
 */
export function enrichDisplayFields<T extends ScreenerResultRow>(
  row: T,
  lookup: Map<string, DisplayFieldDonor>,
  options: EnrichDisplayFieldsOptions = {},
): T {
  const key = normalizeSymbol(row.symbol);
  if (!key) return row;
  const donor = lookup.get(key);
  if (!donor) return row;

  const next: T = { ...row };

  if (next.change_percent === null && isFiniteNumber(donor.change_percent)) {
    next.change_percent = donor.change_percent;
  }

  const canCopyPrior =
    next.prior_session_volume === null &&
    next.volume_ratio_prior_session === null &&
    priorRatioPairValid(
      donor.prior_session_volume,
      donor.volume_ratio_prior_session,
      next.volume,
    );
  if (canCopyPrior) {
    next.prior_session_volume = donor.prior_session_volume as number;
    next.volume_ratio_prior_session = donor.volume_ratio_prior_session as number;
  }

  if (
    options.allowGap &&
    next.gap_percent === null &&
    isFiniteNumber(donor.gap_percent)
  ) {
    next.gap_percent = donor.gap_percent;
  }

  if (
    (next.company_name === null || next.company_name === undefined || next.company_name === "") &&
    typeof donor.company_name === "string" &&
    donor.company_name.trim()
  ) {
    next.company_name = donor.company_name;
  }

  return next;
}

export function enrichDisplayFieldsForRows<T extends ScreenerResultRow>(
  rows: readonly T[],
  screenerRows: readonly ScreenerResultRow[] | null | undefined,
  boardRows: readonly DisplayFieldDonor[] | null | undefined,
  options: EnrichDisplayFieldsOptions = {},
): T[] {
  const lookup = buildDisplayFieldLookup(
    screenerRows,
    boardRows,
    options.preferredTabId ?? null,
  );
  return rows.map((row) => enrichDisplayFields(row, lookup, options));
}
