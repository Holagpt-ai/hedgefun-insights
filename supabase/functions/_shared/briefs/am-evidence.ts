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
  EARNINGS_CALENDAR_PROVIDER,
  isConfirmedBeforeOpenEarnings,
} from "../pre-market/contract.ts";

export const AM_INDEX_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM"] as const;
export type AmIndexSymbol = (typeof AM_INDEX_SYMBOLS)[number];

export const AM_INDEX_FRESHNESS_MS = 10 * 60 * 1000;
export const AM_HEADLINE_LIMIT = 5;
export const AM_HEADLINE_RANK_POOL = 12;
export const AM_HEADLINE_MIN_MATERIALITY = 30;
export const AM_DIRECT_CATALYST_LIMIT = 3;
export const AM_EARNINGS_LIMIT = 8;
/** Percentage-point delta that counts as a meaningful index move. */
export const AM_INDEX_PCT_MATERIAL = 0.25;

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

export interface AmEvidenceBundle {
  checkedAt: string;
  indexes: Record<AmIndexSymbol, IndexSnapshot>;
  headlines: AmHeadlineEvidence[];
  catalysts: AmCatalystEvidence[];
  earnings: AmEarningsEvidence[];
}

export interface AmMaterialState {
  index_signs: Record<AmIndexSymbol, number>;
  index_pcts: Record<AmIndexSymbol, number>;
  leadership: AmIndexSymbol[];
  headline_ids: string[];
  catalyst_ids: string[];
  earnings_ids: string[];
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
export function selectDirectCatalysts(rows: AttributedCatalystRow[]): AmCatalystEvidence[] {
  const qualifying: AmCatalystEvidence[] = [];
  for (const row of rows) {
    if (row.provider === EARNINGS_CALENDAR_PROVIDER && row.event_type === "earnings") {
      continue;
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
    qualifying.push({
      id: row.id,
      symbol: row.symbol,
      title: row.title,
      event_date: row.event_date,
      event_type: row.event_type,
      source_name: row.source_name ?? null,
    });
  }
  qualifying.sort((a, b) => {
    const ad = a.event_date;
    const bd = b.event_date;
    if (ad !== bd) return bd.localeCompare(ad);
    return a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id);
  });
  const seen = new Set<string>();
  const out: AmCatalystEvidence[] = [];
  for (const row of qualifying) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
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
  };
}

function idsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
  if (!idsEqual(prev.leadership, next.leadership)) {
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
  ].join("|");
}

export function buildAmV2Snapshot(
  bundle: AmEvidenceBundle,
  state: AmMaterialState,
): Record<string, unknown> {
  const fingerprint = fingerprintMaterialState(state);
  return {
    version: AM_V2_VERSION,
    source: AM_V2_SOURCE,
    source_checked_at: bundle.checkedAt,
    evidence_checked_at: bundle.checkedAt,
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
  };
}

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
  return {
    index_signs,
    index_pcts,
    leadership: leadership as AmIndexSymbol[],
    headline_ids: headlines as string[],
    catalyst_ids: catalysts as string[],
    earnings_ids: earnings as string[],
  };
}
