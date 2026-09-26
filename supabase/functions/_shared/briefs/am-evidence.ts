/**
 * Deterministic AM Intelligence Brief V2 evidence selection, fingerprinting,
 * and material-change comparison. Claude never chooses which facts qualify.
 *
 * Allowed sources: market_indexes, market_news (ranked), catalyst_events
 * (provider_reported, presentation-class direct only), before-open earnings.
 * Day-Trade Radar / screener_results are intentionally absent.
 */

import type { RankedHeadline } from "../pre-market/headlines.ts";
import {
  classifyCatalystPresentation,
  type CatalystPresentationInput,
} from "../pre-market/catalyst-presentation.ts";
import {
  classifyCatalystPrecedence,
  compareCatalystPrecedence,
} from "../catalyst/precedence.ts";
import {
  EARNINGS_CALENDAR_PROVIDER,
  isConfirmedBeforeOpenEarnings,
} from "../pre-market/contract.ts";
import type {
  AmCurrentPremarketMover,
  AmEnrichmentBundle,
  AmPriorSessionRadarLeader,
  CatalystFeedStatus,
} from "./am-enrichment.ts";

export const AM_INDEX_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM"] as const;
export type AmIndexSymbol = (typeof AM_INDEX_SYMBOLS)[number];

export const AM_INDEX_FRESHNESS_MS = 10 * 60 * 1000;
export const AM_HEADLINE_LIMIT = 5;
export const AM_HEADLINE_RANK_POOL = 12;
export const AM_HEADLINE_MIN_MATERIALITY = 30;
export const AM_DIRECT_CATALYST_LIMIT = 3;
export const AM_EARNINGS_LIMIT = 8;
/** Upper bound on catalyst rows scanned per AM run (selection stays bounded). */
export const AM_CATALYST_SCAN_LIMIT = 120;
/** Percentage-point delta that counts as a meaningful index move. */
export const AM_INDEX_PCT_MATERIAL = 0.25;
/**
 * A leadership-order change is material only when at least one displaced
 * pair in the NEW evidence is separated by this many percentage points.
 * Tiny crossings of nearly-equal indexes do not regenerate.
 */
export const AM_LEADERSHIP_SPREAD_MATERIAL = 0.15;

export const AM_V2_VERSION = "am_v2";
export const AM_V2_SOURCE = "am_intelligence_v2";

export interface IndexSnapshot {
  current_value: number;
  change_percent: number;
  updated_at: string;
}

export interface AmHeadlineEvidence {
  id: string;
  headline: string;
  source: string | null;
  published_at: string;
  materiality: number;
}

export interface AmCatalystEvidence {
  id: string;
  symbol: string;
  title: string;
  event_date: string;
  event_type: string;
  source_name: string | null;
}

export interface AmEarningsEvidence {
  id: string;
  symbol: string;
  title: string;
  event_date: string;
  time_of_day: string;
}

/** Next-session continuation handoff from late-session capture (not predictive). */
export interface AmContinuationCarryoverEvidence {
  key: string;
  symbol: string;
  source_session_date: string;
  source_category: string;
  evidence_labels: string[];
  rvol: number | null;
  session_move_pct: number | null;
  /** Prior-session qualification — not a live scanner detection. */
  context_scope: "prior_session_qualification";
  primary_reason: string | null;
  last_price: number | null;
  close_distance_from_hod_pct: number | null;
  after_hours_extends: boolean | null;
}

export const AM_CONTINUATION_CARRYOVER_LIMIT = 8;

export interface AmEvidenceBundle {
  checkedAt: string;
  indexes: Record<AmIndexSymbol, IndexSnapshot>;
  headlines: AmHeadlineEvidence[];
  catalysts: AmCatalystEvidence[];
  earnings: AmEarningsEvidence[];
  continuationCarryovers: AmContinuationCarryoverEvidence[];
  enrichment: AmEnrichmentBundle;
}

export interface AmMaterialState {
  index_signs: Record<AmIndexSymbol, number>;
  index_pcts: Record<AmIndexSymbol, number>;
  leadership: AmIndexSymbol[];
  headline_ids: string[];
  catalyst_ids: string[];
  earnings_ids: string[];
  continuation_keys: string[];
}

export interface MaterialChangeResult {
  material: boolean;
  reasons: string[];
}

export interface AttributedCatalystRow {
  id: string;
  symbol: string;
  title: string;
  provider: string;
  event_type: string;
  event_date: string;
  verification_state: string;
  event_time?: string | null;
  published_at?: string | null;
  source_name?: string | null;
  attribution_class: CatalystPresentationInput["attribution_class"];
  ticker_specific: boolean;
  time_of_day?: string | null;
  updated_at?: string | null;
}

export type IndexValidation =
  | { ok: true; indexes: Record<AmIndexSymbol, IndexSnapshot> }
  | { ok: false; reason: string };

export function validateIndexRows(
  rows: Array<{
    symbol?: unknown;
    current_value?: unknown;
    change_percent?: unknown;
    updated_at?: unknown;
  }>,
  nowMs: number,
  freshnessMs: number = AM_INDEX_FRESHNESS_MS,
): IndexValidation {
  const bySymbol = new Map<string, { raw: (typeof rows)[number] }>();
  for (const r of rows) {
    if (typeof r.symbol !== "string") continue;
    bySymbol.set(r.symbol, { raw: r });
  }
  const indexes = {} as Record<AmIndexSymbol, IndexSnapshot>;
  for (const sym of AM_INDEX_SYMBOLS) {
    const hit = bySymbol.get(sym);
    if (!hit) return { ok: false, reason: "source_missing_symbol" };
    const cv = Number(hit.raw.current_value);
    const cp = Number(hit.raw.change_percent);
    const ts = typeof hit.raw.updated_at === "string" ? hit.raw.updated_at : "";
    if (!Number.isFinite(cv) || cv <= 0) return { ok: false, reason: "source_invalid_price" };
    if (!Number.isFinite(cp)) return { ok: false, reason: "source_invalid_change" };
    if (!ts) return { ok: false, reason: "source_missing_updated_at" };
    const ageMs = nowMs - Date.parse(ts);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > freshnessMs) {
      return { ok: false, reason: "source_stale" };
    }
    indexes[sym] = { current_value: cv, change_percent: cp, updated_at: ts };
  }
  return { ok: true, indexes };
}

export function indexSign(changePercent: number): number {
  if (!Number.isFinite(changePercent) || changePercent === 0) return 0;
  return changePercent > 0 ? 1 : -1;
}

export function leadershipOrder(
  indexes: Record<AmIndexSymbol, IndexSnapshot>,
): AmIndexSymbol[] {
  return [...AM_INDEX_SYMBOLS].sort((a, b) => {
    const d = indexes[b].change_percent - indexes[a].change_percent;
    if (d !== 0) return d;
    return a.localeCompare(b);
  });
}

export function selectRankedHeadlines(ranked: RankedHeadline[]): AmHeadlineEvidence[] {
  return ranked
    .filter((h) => h.materiality >= AM_HEADLINE_MIN_MATERIALITY)
    .slice(0, AM_HEADLINE_LIMIT)
    .map((h) => ({
      id: h.id,
      headline: h.headline,
      source: h.source,
      published_at: h.published_at,
      materiality: h.materiality,
    }));
}

/**
 * Bounded genuine ticker-specific catalysts. Earnings-calendar rows are
 * excluded here (they belong in the before-open earnings section).
 * Legal / commentary / provider-associated / sector-related do not enter.
 */
const AM_CATALYST_MAX_PUBLISHED_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function selectDirectCatalysts(
  rows: AttributedCatalystRow[],
  asOfMs: number = Date.now(),
): AmCatalystEvidence[] {
  const qualifying: AttributedCatalystRow[] = [];
  for (const row of rows) {
    if (row.provider === EARNINGS_CALENDAR_PROVIDER && row.event_type === "earnings") {
      continue;
    }
    if (row.published_at) {
      const publishedMs = Date.parse(row.published_at);
      if (
        Number.isFinite(publishedMs) &&
        asOfMs - publishedMs > AM_CATALYST_MAX_PUBLISHED_AGE_MS
      ) {
        continue;
      }
    }
    const cls = classifyCatalystPresentation({
      title: row.title,
      provider: row.provider,
      event_type: row.event_type,
      event_date: row.event_date,
      event_time: row.event_time,
      published_at: row.published_at,
      source_name: row.source_name,
      attribution_class: row.attribution_class,
      ticker_specific: row.ticker_specific,
    });
    if (cls !== "direct_catalyst") continue;
    if (row.ticker_specific !== true || row.attribution_class !== "direct") continue;
    if (classifyCatalystPrecedence(row).tier !== "primary") continue;
    qualifying.push(row);
  }
  const etDate = qualifying.reduce(
    (max, r) => (r.event_date > max ? r.event_date : max),
    qualifying[0]?.event_date ?? "",
  );
  qualifying.sort((a, b) =>
    compareCatalystPrecedence(a, b, { owned: new Set(), etDate })
  );
  const seen = new Set<string>();
  const out: AmCatalystEvidence[] = [];
  for (const row of qualifying) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      id: row.id,
      symbol: row.symbol,
      title: row.title,
      event_date: row.event_date,
      event_type: row.event_type,
      source_name: row.source_name ?? null,
    });
    if (out.length >= AM_DIRECT_CATALYST_LIMIT) break;
  }
  return out;
}

export function selectBeforeOpenEarningsEvidence(
  rows: AttributedCatalystRow[],
  etDate: string,
): AmEarningsEvidence[] {
  const qualifying = rows
    .filter((r) => isConfirmedBeforeOpenEarnings(r, etDate))
    .map((r) => ({
      id: r.id,
      symbol: r.symbol,
      title: r.title,
      event_date: r.event_date,
      time_of_day: "before_open" as const,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const out: AmEarningsEvidence[] = [];
  for (const row of qualifying) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= AM_EARNINGS_LIMIT) break;
  }
  return out;
}

function finiteMetricOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function selectContinuationCarryovers(
  rows: readonly {
    symbol: string;
    source_session_date: string;
    source_category: string;
    evidence_labels?: unknown;
    rvol?: number | null;
    session_move_pct?: number | null;
    last_price?: unknown;
    close_distance_from_hod_pct?: unknown;
    after_hours_extends?: unknown;
  }[],
): AmContinuationCarryoverEvidence[] {
  const seen = new Set<string>();
  const out: AmContinuationCarryoverEvidence[] = [];
  for (const row of rows) {
    const symbol = row.symbol?.trim().toUpperCase();
    if (!symbol) continue;
    const key = `${symbol}:${row.source_session_date}:${row.source_category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const labels = Array.isArray(row.evidence_labels)
      ? row.evidence_labels.filter((x): x is string => typeof x === "string")
      : [];
    out.push({
      key,
      symbol,
      source_session_date: row.source_session_date,
      source_category: row.source_category,
      evidence_labels: labels,
      rvol: finiteMetricOrNull(row.rvol),
      session_move_pct: finiteMetricOrNull(row.session_move_pct),
      context_scope: "prior_session_qualification",
      primary_reason: labels.length > 0 ? labels[0] : null,
      last_price: finiteMetricOrNull(row.last_price),
      close_distance_from_hod_pct: finiteMetricOrNull(row.close_distance_from_hod_pct),
      after_hours_extends: typeof row.after_hours_extends === "boolean"
        ? row.after_hours_extends
        : null,
    });
    if (out.length >= AM_CONTINUATION_CARRYOVER_LIMIT) break;
  }
  return out;
}

export function buildMaterialState(bundle: AmEvidenceBundle): AmMaterialState {
  const index_signs = {} as Record<AmIndexSymbol, number>;
  const index_pcts = {} as Record<AmIndexSymbol, number>;
  for (const sym of AM_INDEX_SYMBOLS) {
    index_signs[sym] = indexSign(bundle.indexes[sym].change_percent);
    index_pcts[sym] = bundle.indexes[sym].change_percent;
  }
  return {
    index_signs,
    index_pcts,
    leadership: leadershipOrder(bundle.indexes),
    headline_ids: bundle.headlines.map((h) => h.id),
    catalyst_ids: [...bundle.catalysts.map((c) => c.id)].sort(),
    earnings_ids: [...bundle.earnings.map((e) => e.id)].sort(),
    continuation_keys: [...bundle.continuationCarryovers.map((c) => c.key)].sort(),
  };
}

function idsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Leadership hysteresis: order changes only count when a displaced pair
 * is separated by >= AM_LEADERSHIP_SPREAD_MATERIAL in the NEW snapshot.
 */
export function isMaterialLeadershipChange(
  prev: AmMaterialState,
  next: AmMaterialState,
): boolean {
  if (idsEqual(prev.leadership, next.leadership)) return false;
  const prevRank = new Map(prev.leadership.map((s, i) => [s, i]));
  const nextRank = new Map(next.leadership.map((s, i) => [s, i]));
  for (let i = 0; i < AM_INDEX_SYMBOLS.length; i++) {
    for (let j = i + 1; j < AM_INDEX_SYMBOLS.length; j++) {
      const a = AM_INDEX_SYMBOLS[i];
      const b = AM_INDEX_SYMBOLS[j];
      const prevA = prevRank.get(a);
      const prevB = prevRank.get(b);
      const nextA = nextRank.get(a);
      const nextB = nextRank.get(b);
      if (prevA === undefined || prevB === undefined || nextA === undefined || nextB === undefined) {
        continue;
      }
      const prevAhead = prevA < prevB;
      const nextAhead = nextA < nextB;
      if (prevAhead === nextAhead) continue;
      const spread = Math.abs(next.index_pcts[a] - next.index_pcts[b]);
      if (spread >= AM_LEADERSHIP_SPREAD_MATERIAL) return true;
    }
  }
  return false;
}

export function isMaterialChange(
  prev: AmMaterialState,
  next: AmMaterialState,
): MaterialChangeResult {
  const reasons: string[] = [];
  for (const sym of AM_INDEX_SYMBOLS) {
    if (prev.index_signs[sym] !== next.index_signs[sym]) {
      reasons.push(`index_sign_flip:${sym}`);
    }
    const delta = Math.abs(next.index_pcts[sym] - prev.index_pcts[sym]);
    if (delta >= AM_INDEX_PCT_MATERIAL) {
      reasons.push(`index_pct_move:${sym}`);
    }
  }
  if (isMaterialLeadershipChange(prev, next)) {
    reasons.push("leadership_change");
  }
  if (!idsEqual(prev.headline_ids, next.headline_ids)) {
    reasons.push("headline_set_change");
  }
  if (!idsEqual(prev.catalyst_ids, next.catalyst_ids)) {
    reasons.push("catalyst_set_change");
  }
  if (!idsEqual(prev.earnings_ids, next.earnings_ids)) {
    reasons.push("earnings_set_change");
  }
  if (!idsEqual(prev.continuation_keys, next.continuation_keys)) {
    reasons.push("continuation_set_change");
  }
  return { material: reasons.length > 0, reasons };
}

/** Stable, timestamp-free fingerprint of the material evidence set. */
export function fingerprintMaterialState(state: AmMaterialState): string {
  return [
    "v2",
    AM_INDEX_SYMBOLS.map((s) => `${s}:${state.index_signs[s]}`).join(","),
    state.leadership.join(">"),
    `h:${state.headline_ids.join(",")}`,
    `c:${state.catalyst_ids.join(",")}`,
    `e:${state.earnings_ids.join(",")}`,
    `x:${state.continuation_keys.join(",")}`,
  ].join("|");
}

export function buildAmV2Snapshot(
  bundle: AmEvidenceBundle,
  state: AmMaterialState,
  generationWindow?: string | null,
  generationReason?: string | null,
): Record<string, unknown> {
  const fingerprint = fingerprintMaterialState(state);
  return {
    version: AM_V2_VERSION,
    source: AM_V2_SOURCE,
    source_checked_at: bundle.checkedAt,
    evidence_checked_at: bundle.checkedAt,
    ...(generationWindow ? { generation_window: generationWindow } : {}),
    ...(generationReason ? { generation_reason: generationReason } : {}),
    fingerprint,
    material_state: state,
    indexes: bundle.indexes,
    headlines: bundle.headlines.map((h) => ({
      id: h.id,
      headline: h.headline,
      source: h.source,
      published_at: h.published_at,
    })),
    catalysts: bundle.catalysts.map((c) => ({
      id: c.id,
      symbol: c.symbol,
      title: c.title,
      event_date: c.event_date,
      event_type: c.event_type,
    })),
    earnings: bundle.earnings.map((e) => ({
      id: e.id,
      symbol: e.symbol,
      title: e.title,
      event_date: e.event_date,
      time_of_day: e.time_of_day,
    })),
    continuation_carryovers: bundle.continuationCarryovers.map((c) => ({
      key: c.key,
      symbol: c.symbol,
      source_session_date: c.source_session_date,
      source_category: c.source_category,
      evidence_labels: c.evidence_labels,
      rvol: c.rvol,
      session_move_pct: c.session_move_pct,
      context_scope: c.context_scope,
      primary_reason: c.primary_reason,
      last_price: c.last_price,
      close_distance_from_hod_pct: c.close_distance_from_hod_pct,
      after_hours_extends: c.after_hours_extends,
    })),
    intelligence_enrichment: {
      prior_session_radar_leaders: bundle.enrichment.priorSessionRadarLeaders,
      current_premarket_movers: bundle.enrichment.currentPremarketMovers,
      catalyst_feed_status: bundle.enrichment.catalystFeedStatus,
    },
  };
}

export type { AmPriorSessionRadarLeader, AmCurrentPremarketMover, CatalystFeedStatus };

export function readMaterialState(snapshot: unknown): AmMaterialState | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const s = snapshot as Record<string, unknown>;
  const ms = s.material_state;
  if (!ms || typeof ms !== "object" || Array.isArray(ms)) return null;
  const m = ms as Record<string, unknown>;
  const signs = m.index_signs;
  const pcts = m.index_pcts;
  const leadership = m.leadership;
  const headlines = m.headline_ids;
  const catalysts = m.catalyst_ids;
  const earnings = m.earnings_ids;
  const continuation = m.continuation_keys;
  if (!signs || typeof signs !== "object" || Array.isArray(signs)) return null;
  if (!pcts || typeof pcts !== "object" || Array.isArray(pcts)) return null;
  if (!Array.isArray(leadership) || !Array.isArray(headlines) || !Array.isArray(catalysts) || !Array.isArray(earnings)) {
    return null;
  }
  const index_signs = {} as Record<AmIndexSymbol, number>;
  const index_pcts = {} as Record<AmIndexSymbol, number>;
  for (const sym of AM_INDEX_SYMBOLS) {
    const sign = (signs as Record<string, unknown>)[sym];
    const pct = (pcts as Record<string, unknown>)[sym];
    if (typeof sign !== "number" || typeof pct !== "number" || !Number.isFinite(pct)) return null;
    index_signs[sym] = sign;
    index_pcts[sym] = pct;
  }
  if (leadership.length !== 4 || leadership.some((x) => typeof x !== "string")) return null;
  if (headlines.some((x) => typeof x !== "string")) return null;
  if (catalysts.some((x) => typeof x !== "string")) return null;
  if (earnings.some((x) => typeof x !== "string")) return null;
  const continuation_keys = Array.isArray(continuation)
    ? continuation.filter((x): x is string => typeof x === "string")
    : [];
  return {
    index_signs,
    index_pcts,
    leadership: leadership as AmIndexSymbol[],
    headline_ids: headlines as string[],
    catalyst_ids: catalysts as string[],
    earnings_ids: earnings as string[],
    continuation_keys,
  };
}
