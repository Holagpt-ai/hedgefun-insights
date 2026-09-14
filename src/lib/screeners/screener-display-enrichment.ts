/**
 * Screener display-field enrichment for Radar V2 Sentinel rows.
 *
 * Sentinel ranking stays volume-first and authoritative. When verified
 * screener_results or radar_v22_board rows carry honest day/session metrics
 * that Sentinel does not persist, copy them onto matching Sentinel symbols
 * for display only. Never fabricate values or reorder rows.
 */

import { easternDate } from "@/lib/radar-v22";
import {
  expectedVolumeRatio,
  isFiniteNumber,
  isPositiveFinite,
  parseTimestampMs,
  SCREENER_STALE_AFTER_MS,
  type ScreenerResultRow,
} from "@/lib/screeners/contract";

export interface DisplayFieldDonor {
  symbol: string;
  tab_id?: string | null;
  price?: number | null;
  volume?: number | null;
  change_percent?: number | null;
  prior_session_volume?: number | null;
  volume_ratio_prior_session?: number | null;
  gap_percent?: number | null;
  company_name?: string | null;
  provider_as_of?: string | null;
  sync_run_id?: string | null;
  updated_at?: string | null;
}

export const DONOR_MAX_PROVIDER_SKEW_MS = SCREENER_STALE_AFTER_MS;
const MAX_PRICE_DIVERGENCE_RATIO = 0.01;

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

function easternTradingDate(iso: string | null | undefined): string | null {
  const ms = parseTimestampMs(iso);
  if (ms === null) return null;
  return easternDate(ms);
}

function providerSkewMs(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const am = parseTimestampMs(a);
  const bm = parseTimestampMs(b);
  if (am === null || bm === null) return null;
  return Math.abs(am - bm);
}

function pricesWithinTolerance(donorPrice: number, sentinelPrice: number): boolean {
  return Math.abs(donorPrice - sentinelPrice) / sentinelPrice <= MAX_PRICE_DIVERGENCE_RATIO;
}

function sessionVolumesMatch(
  donorVolume: number | null | undefined,
  sentinelVolume: number | null | undefined,
): boolean {
  if (!isPositiveFinite(donorVolume) || !isPositiveFinite(sentinelVolume)) return false;
  return donorVolume === sentinelVolume;
}

export function isBaseDonorCoherent(
  sentinel: Pick<ScreenerResultRow, "symbol" | "provider_as_of">,
  donor: DisplayFieldDonor,
): boolean {
  const sentinelKey = normalizeSymbol(sentinel.symbol);
  const donorKey = normalizeSymbol(donor.symbol);
  if (!sentinelKey || !donorKey || sentinelKey !== donorKey) return false;

  const sentinelProvider = sentinel.provider_as_of;
  const donorProvider = donor.provider_as_of;
  if (!sentinelProvider || !donorProvider) return false;

  const sentinelDate = easternTradingDate(sentinelProvider);
  const donorDate = easternTradingDate(donorProvider);
  if (!sentinelDate || !donorDate || sentinelDate !== donorDate) return false;

  const skew = providerSkewMs(sentinelProvider, donorProvider);
  if (skew === null || skew > DONOR_MAX_PROVIDER_SKEW_MS) return false;

  return true;
}

function canEnrichMove(sentinel: ScreenerResultRow, donor: DisplayFieldDonor): boolean {
  if (!isBaseDonorCoherent(sentinel, donor)) return false;
  if (!isPositiveFinite(sentinel.price) || !isPositiveFinite(donor.price)) return false;
  if (!sessionVolumesMatch(donor.volume, sentinel.volume)) return false;
  return pricesWithinTolerance(donor.price as number, sentinel.price as number);
}

function canEnrichVolPrior(sentinel: ScreenerResultRow, donor: DisplayFieldDonor): boolean {
  if (!isBaseDonorCoherent(sentinel, donor)) return false;
  if (!sessionVolumesMatch(donor.volume, sentinel.volume)) return false;
  return priorRatioPairValid(
    donor.prior_session_volume,
    donor.volume_ratio_prior_session,
    sentinel.volume,
  );
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

  if (
    next.change_percent === null &&
    isFiniteNumber(donor.change_percent) &&
    canEnrichMove(row, donor)
  ) {
    next.change_percent = donor.change_percent;
  }

  const canCopyPrior =
    next.prior_session_volume === null &&
    next.volume_ratio_prior_session === null &&
    canEnrichVolPrior(row, donor);
  if (canCopyPrior) {
    next.prior_session_volume = donor.prior_session_volume as number;
    next.volume_ratio_prior_session = donor.volume_ratio_prior_session as number;
  }

  if (
    options.allowGap &&
    next.gap_percent === null &&
    isFiniteNumber(donor.gap_percent) &&
    isBaseDonorCoherent(row, donor)
  ) {
    next.gap_percent = donor.gap_percent;
  }

  if (
    (next.company_name === null || next.company_name === undefined || next.company_name === "") &&
    typeof donor.company_name === "string" &&
    donor.company_name.trim() &&
    isBaseDonorCoherent(row, donor)
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
