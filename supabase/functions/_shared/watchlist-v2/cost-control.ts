// Watchlist V2 Anthropic cost-control gates. Pure/deterministic.
// Thresholds live here so they can be tuned without rewriting the analyzer.

import type { Direction, SessionType } from "./contract.ts";

export const TTL_MIN_RTH = 10;
export const TTL_MIN_OFFHOURS = 30;

export const MATERIAL_CHANGE_THRESHOLDS = {
  /** Absolute change in change_pct, in percentage points. */
  changePctAbs: 1.0,
  /** Relative stored-volume change. 0.25 = 25%. */
  volumeRelative: 0.25,
} as const;

export type MaterialChangeThresholds = typeof MATERIAL_CHANGE_THRESHOLDS;

export type ClaudeDecision =
  | "claude_called_new"
  | "claude_called_expired_changed"
  | "claude_called_manual"
  | "skipped_still_valid"
  | "skipped_unchanged"
  | "skipped_insufficient_data"
  | "skipped_in_flight"
  | "error";

export const CLAUDE_DECISIONS: ReadonlySet<ClaudeDecision> = new Set([
  "claude_called_new",
  "claude_called_expired_changed",
  "claude_called_manual",
  "skipped_still_valid",
  "skipped_unchanged",
  "skipped_insufficient_data",
  "skipped_in_flight",
  "error",
]);

export const CLAUDE_CALLED_DECISIONS: ReadonlySet<ClaudeDecision> = new Set([
  "claude_called_new",
  "claude_called_expired_changed",
  "claude_called_manual",
]);

export const CLAUDE_SKIPPED_DECISIONS: ReadonlySet<ClaudeDecision> = new Set([
  "skipped_still_valid",
  "skipped_unchanged",
  "skipped_insufficient_data",
  "skipped_in_flight",
]);

export interface MaterialFacts {
  change_pct: number | null;
  volume: number | null;
  rvol_class: string | null;
  signal_ids: string[];
  event_ids: string[];
  earnings_date: string | null;
  session_date: string;
  session_type: SessionType;
  sufficient: boolean;
}

export interface PriorAnalysis {
  ticker: string;
  session_date: string;
  session_type: SessionType;
  valid_through: string;
  direction: Direction;
  explanation: string;
  failure_reason: string | null;
  change_pct: number | null;
  volume: number | null;
  rvol_class: string | null;
  market_signals: unknown;
  recent_events: unknown;
  inputs_quality: unknown;
}

export interface MaterialChangeResult {
  changed: boolean;
  reasons: string[];
}

export function ttlMinutesForSession(sessionType: SessionType): number {
  return sessionType === "rth" ? TTL_MIN_RTH : TTL_MIN_OFFHOURS;
}

export function computeValidThrough(analyzedAtMs: number, sessionType: SessionType): string {
  return new Date(analyzedAtMs + ttlMinutesForSession(sessionType) * 60 * 1000).toISOString();
}

export function isUsablePrior(prior: PriorAnalysis | null): prior is PriorAnalysis {
  if (!prior) return false;
  return prior.direction === "bullish"
    || prior.direction === "bearish"
    || prior.direction === "neutral";
}

export function isStillValid(
  prior: PriorAnalysis,
  now: Date,
  sessionDate: string,
  sessionType: SessionType,
): boolean {
  if (!isUsablePrior(prior)) return false;
  if (prior.session_date !== sessionDate) return false;
  if (prior.session_type !== sessionType) return false;
  const until = Date.parse(prior.valid_through);
  if (!Number.isFinite(until)) return false;
  return now.getTime() < until;
}

export function decideBeforeFetch(input: {
  forceRefresh: boolean;
  prior: PriorAnalysis | null;
  now: Date;
  sessionDate: string;
  sessionType: SessionType;
}): "skipped_still_valid" | "fetch" {
  if (input.forceRefresh) return "fetch";
  if (input.prior && isStillValid(input.prior, input.now, input.sessionDate, input.sessionType)) {
    return "skipped_still_valid";
  }
  return "fetch";
}

function sortedUniqueIds(raw: unknown, idKey: "signal_id" | "event_id"): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = (item as Record<string, unknown>)[idKey];
    if (typeof v === "string" && v.length > 0) ids.add(v);
  }
  return [...ids].sort();
}

function optionalEarningsDate(quality: unknown): string | null {
  if (!quality || typeof quality !== "object") return null;
  const v = (quality as Record<string, unknown>).earnings_date;
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function extractPriorFacts(prior: PriorAnalysis): MaterialFacts {
  return {
    change_pct: typeof prior.change_pct === "number" && Number.isFinite(prior.change_pct)
      ? prior.change_pct
      : null,
    volume: typeof prior.volume === "number" && Number.isFinite(prior.volume)
      ? prior.volume
      : null,
    rvol_class: typeof prior.rvol_class === "string" && prior.rvol_class
      ? prior.rvol_class
      : null,
    signal_ids: sortedUniqueIds(prior.market_signals, "signal_id"),
    event_ids: sortedUniqueIds(prior.recent_events, "event_id"),
    earnings_date: optionalEarningsDate(prior.inputs_quality),
    session_date: prior.session_date,
    session_type: prior.session_type,
    sufficient: isUsablePrior(prior),
  };
}

export function idsChanged(prev: string[], next: string[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return true;
  }
  return false;
}

export function compareMaterialChange(
  prior: MaterialFacts,
  current: MaterialFacts,
  thresholds: MaterialChangeThresholds = MATERIAL_CHANGE_THRESHOLDS,
): MaterialChangeResult {
  const reasons: string[] = [];

  if (prior.session_date !== current.session_date) reasons.push("session_date");
  if (prior.session_type !== current.session_type) reasons.push("session_type");
  if (prior.sufficient !== current.sufficient) reasons.push("sufficiency");

  const prevPct = prior.change_pct;
  const currPct = current.change_pct;
  if (prevPct === null && currPct !== null) reasons.push("change_pct");
  else if (prevPct !== null && currPct === null) reasons.push("change_pct");
  else if (prevPct !== null && currPct !== null
    && Math.abs(currPct - prevPct) >= thresholds.changePctAbs) {
    reasons.push("change_pct");
  }

  const prevVol = prior.volume;
  const currVol = current.volume;
  if (prevVol === null && currVol !== null) reasons.push("volume");
  else if (prevVol !== null && currVol === null) reasons.push("volume");
  else if (prevVol !== null && currVol !== null) {
    const denom = Math.max(Math.abs(prevVol), 1);
    if (Math.abs(currVol - prevVol) / denom >= thresholds.volumeRelative) {
      reasons.push("volume");
    }
  }

  if (prior.rvol_class !== current.rvol_class) reasons.push("rvol_class");
  if (idsChanged(prior.signal_ids, current.signal_ids)) reasons.push("signal_ids");
  if (idsChanged(prior.event_ids, current.event_ids)) reasons.push("event_ids");
  if (prior.earnings_date !== current.earnings_date) reasons.push("earnings");

  return { changed: reasons.length > 0, reasons };
}

export type AfterFactsDecision =
  | { kind: "skip"; decision: "skipped_insufficient_data" | "skipped_unchanged" }
  | { kind: "call"; decision: "claude_called_new" | "claude_called_expired_changed" | "claude_called_manual" };

export function decideAfterFacts(input: {
  forceRefresh: boolean;
  sufficient: boolean;
  prior: PriorAnalysis | null;
  currentFacts: MaterialFacts;
  thresholds?: MaterialChangeThresholds;
}): AfterFactsDecision {
  if (!input.sufficient) {
    return { kind: "skip", decision: "skipped_insufficient_data" };
  }
  if (input.forceRefresh) {
    return { kind: "call", decision: "claude_called_manual" };
  }
  if (!isUsablePrior(input.prior)) {
    return { kind: "call", decision: "claude_called_new" };
  }
  const cmp = compareMaterialChange(
    extractPriorFacts(input.prior),
    input.currentFacts,
    input.thresholds ?? MATERIAL_CHANGE_THRESHOLDS,
  );
  if (!cmp.changed) {
    return { kind: "skip", decision: "skipped_unchanged" };
  }
  return { kind: "call", decision: "claude_called_expired_changed" };
}

export function shouldInsertHistory(decision: ClaudeDecision): boolean {
  if (decision === "skipped_still_valid") return false;
  if (decision === "skipped_unchanged") return false;
  if (decision === "skipped_in_flight") return false;
  return CLAUDE_CALLED_DECISIONS.has(decision) || decision === "skipped_insufficient_data";
}

export function parsePriorAnalysis(row: unknown): PriorAnalysis | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const ticker = typeof r.ticker === "string" ? r.ticker : "";
  const session_date = typeof r.session_date === "string" ? r.session_date.slice(0, 10) : "";
  const session_type = r.session_type;
  const direction = r.direction;
  const valid_through = typeof r.valid_through === "string" ? r.valid_through : "";
  const explanation = typeof r.explanation === "string" ? r.explanation : "";
  if (!ticker || !session_date || !valid_through) return null;
  if (session_type !== "premarket" && session_type !== "rth" && session_type !== "postclose") {
    return null;
  }
  if (
    direction !== "bullish" && direction !== "bearish"
    && direction !== "neutral" && direction !== "data_unavailable"
  ) {
    return null;
  }
  return {
    ticker,
    session_date,
    session_type,
    valid_through,
    direction,
    explanation,
    failure_reason: typeof r.failure_reason === "string" ? r.failure_reason : null,
    change_pct: typeof r.change_pct === "number" && Number.isFinite(r.change_pct) ? r.change_pct : null,
    volume: typeof r.volume === "number" && Number.isFinite(r.volume) ? r.volume : null,
    rvol_class: typeof r.rvol_class === "string" && r.rvol_class ? r.rvol_class : null,
    market_signals: r.market_signals,
    recent_events: r.recent_events,
    inputs_quality: r.inputs_quality,
  };
}

export function parseManualForceRefresh(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  return (body as Record<string, unknown>).force_refresh === true;
}

/** force_refresh is honored only for authenticated manual mode. */
export function resolveForceRefresh(
  source: "trigger" | "manual",
  body: unknown,
): boolean {
  if (source !== "manual") return false;
  return parseManualForceRefresh(body);
}
