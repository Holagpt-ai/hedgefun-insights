/**
 * AM Brief optional intelligence enrichment (bounded, verified-only).
 * Does not affect material-change fingerprinting for core index/headline/catalyst sets.
 */

import { etDateShift } from "../pre-market/contract.ts";

export const AM_RADAR_PRIOR_LEADER_LIMIT = 6;
export const AM_CURRENT_PM_MOVER_LIMIT = 6;
export const AM_SCREENER_PM_STALE_MS = 30 * 60 * 1000;
/** Soft cap on user-prompt characters contributed by optional enrichment blocks. */
export const AM_ENRICHMENT_PROMPT_CHAR_BUDGET = 4_500;

export const AM_AI_PAYLOAD_LIMITS = {
  radar_prior_leaders: AM_RADAR_PRIOR_LEADER_LIMIT,
  current_pm_movers: AM_CURRENT_PM_MOVER_LIMIT,
  continuation_carryovers: 8,
  direct_catalysts: 3,
  headlines: 5,
  earnings: 8,
  catalyst_scan_rows: 120,
} as const;

export type CatalystFeedStatus = "verified" | "none" | "unavailable";

export interface AmPriorSessionRadarLeader {
  symbol: string;
  trading_date: string;
  context_scope: "prior_session";
  data_source: "closed_session_snapshot";
  session_volume: number | null;
  primary_scanner_event: string | null;
  promotion_primary_event: string | null;
  radar_event_lifecycle: string | null;
  participation_state: string | null;
  time_adjusted_rvol: number | null;
  volume_velocity: number | null;
  volume_acceleration_pct: number | null;
  last_price: number | null;
  session_high: number | null;
}

export interface AmCurrentPremarketMover {
  symbol: string;
  context_scope: "current_premarket";
  price: number | null;
  gap_pct: number | null;
  volume: number | null;
  participation_rvol: number | null;
  updated_at: string | null;
}

export interface AmEnrichmentBundle {
  priorSessionRadarLeaders: AmPriorSessionRadarLeader[];
  currentPremarketMovers: AmCurrentPremarketMover[];
  catalystFeedStatus: CatalystFeedStatus;
}

export function priorCompletedTradingDate(etDate: string, weekday: string): string {
  if (weekday === "Mon") return etDateShift(etDate, -3);
  return etDateShift(etDate, -1);
}

function finiteNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function promotionPrimaryFromReason(raw: unknown): string | null {
  if (raw === null || typeof raw !== "object") return null;
  const primary = (raw as Record<string, unknown>).primaryEvent;
  if (primary === null || typeof primary !== "object") return null;
  return str((primary as Record<string, unknown>).type);
}

export function selectPriorSessionRadarLeaders(
  rows: readonly Record<string, unknown>[],
  tradingDate: string,
): AmPriorSessionRadarLeader[] {
  const sorted = [...rows].sort((a, b) => {
    const va = finiteNum(a.session_volume) ?? 0;
    const vb = finiteNum(b.session_volume) ?? 0;
    return vb - va || String(a.symbol ?? "").localeCompare(String(b.symbol ?? ""));
  });
  const out: AmPriorSessionRadarLeader[] = [];
  const seen = new Set<string>();
  for (const row of sorted) {
    const symbol = str(row.symbol)?.toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({
      symbol,
      trading_date: tradingDate,
      context_scope: "prior_session",
      data_source: "closed_session_snapshot",
      session_volume: finiteNum(row.session_volume),
      primary_scanner_event: str(row.primary_scanner_event),
      promotion_primary_event: promotionPrimaryFromReason(row.promotion_reason),
      radar_event_lifecycle: str(row.radar_event_lifecycle),
      participation_state: str(row.participation_state),
      time_adjusted_rvol: finiteNum(row.time_adjusted_rvol),
      volume_velocity: finiteNum(row.volume_velocity),
      volume_acceleration_pct: finiteNum(row.volume_acceleration_pct),
      last_price: finiteNum(row.last_price),
      session_high: finiteNum(row.session_high),
    });
    if (out.length >= AM_RADAR_PRIOR_LEADER_LIMIT) break;
  }
  return out;
}

export function selectCurrentPremarketMovers(
  rows: readonly Record<string, unknown>[],
  nowMs: number,
  staleMs: number = AM_SCREENER_PM_STALE_MS,
): AmCurrentPremarketMover[] {
  const out: AmCurrentPremarketMover[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const symbol = str(row.symbol)?.toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    const updatedAt = str(row.updated_at);
    if (!updatedAt) continue;
    const age = nowMs - Date.parse(updatedAt);
    if (!Number.isFinite(age) || age < 0 || age > staleMs) continue;
    const price = finiteNum(row.price);
    const gap = finiteNum(row.change_percent);
    const volume = finiteNum(row.volume);
    const rvol = finiteNum(row.rvol_20d);
    if (price === null && gap === null && volume === null) continue;
    seen.add(symbol);
    out.push({
      symbol,
      context_scope: "current_premarket",
      price,
      gap_pct: gap,
      volume,
      participation_rvol: rvol,
      updated_at: updatedAt,
    });
    if (out.length >= AM_CURRENT_PM_MOVER_LIMIT) break;
  }
  return out;
}

export function resolveCatalystFeedStatus(
  queryError: boolean,
  directCatalystCount: number,
  providerFailures?: readonly string[],
): CatalystFeedStatus {
  if (queryError) return "unavailable";
  if (directCatalystCount > 0) return "verified";
  if (providerFailures && providerFailures.length > 0) return "unavailable";
  return "none";
}

export function emptyEnrichment(catalystFeedStatus: CatalystFeedStatus): AmEnrichmentBundle {
  return {
    priorSessionRadarLeaders: [],
    currentPremarketMovers: [],
    catalystFeedStatus,
  };
}

export function enrichmentPromptCharEstimate(parts: string[]): number {
  return parts.join("\n").length;
}

export function isEnrichmentWithinPromptBudget(charCount: number): boolean {
  return charCount <= AM_ENRICHMENT_PROMPT_CHAR_BUDGET;
}

/** Shared brief symbols → user watchlist membership (client/inbox; not sent to Claude). */
export function watchlistMembershipForSymbols(
  symbols: readonly string[],
  userWatchlist: ReadonlySet<string>,
): Array<{ symbol: string; on_user_watchlist: boolean }> {
  const out: Array<{ symbol: string; on_user_watchlist: boolean }> = [];
  const seen = new Set<string>();
  for (const raw of symbols) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, on_user_watchlist: userWatchlist.has(symbol) });
  }
  return out;
}

export function collectHighlightedSymbols(input: {
  catalysts: readonly { symbol: string }[];
  continuation: readonly { symbol: string }[];
  radarPrior: readonly { symbol: string }[];
  currentPm: readonly { symbol: string }[];
}): string[] {
  const seen = new Set<string>();
  const symbols: string[] = [];
  const push = (s: string) => {
    const u = s.trim().toUpperCase();
    if (!u || seen.has(u)) return;
    seen.add(u);
    symbols.push(u);
  };
  for (const c of input.catalysts) push(c.symbol);
  for (const c of input.continuation) push(c.symbol);
  for (const r of input.radarPrior) push(r.symbol);
  for (const p of input.currentPm) push(p.symbol);
  return symbols;
}
