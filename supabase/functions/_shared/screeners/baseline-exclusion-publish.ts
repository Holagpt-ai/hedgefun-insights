/**
 * Validated insufficient-session exclusion payloads for atomic 52-week
 * baseline publication. Callers (worker/bridge) must not trust malformed
 * evidence; the database RPC remains the source of truth.
 */

import { normalizeSymbol } from "./selection.ts";

export const INSUFFICIENT_SESSIONS_REASON = "insufficient_sessions" as const;
export const MAX_BASELINE_EXCLUSIONS = 20_000;

export type BaselineExclusionPayload = {
  symbol: string;
  reason: typeof INSUFFICIENT_SESSIONS_REASON;
  sessions_observed: number;
  min_sessions: number;
};

export function isValidMinSessions(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isIntegerSessionCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * True when every baseline row is an object with a unique normalized symbol
 * and integer sessions_observed >= minSessions.
 */
export function baselineRowsMeetMinSessions(
  rows: unknown,
  minSessions: unknown,
): boolean {
  if (!isValidMinSessions(minSessions) || !Array.isArray(rows)) return false;
  const seen = new Set<string>();
  for (const item of rows) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }
    const row = item as Record<string, unknown>;
    const symbol = normalizeSymbol(row.symbol);
    if (!symbol || symbol !== row.symbol) return false;
    if (seen.has(symbol)) return false;
    seen.add(symbol);
    if (
      !isIntegerSessionCount(row.sessions_observed) ||
      row.sessions_observed < minSessions
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Returns a sanitized exclusion list, or null when any field is malformed.
 * Also requires baseline rows to meet the min-session floor, unique symbols,
 * no overlap, recognized reasons, and exclusion session counts below min.
 */
export function parseValidatedBaselineExclusions(
  raw: unknown,
  minSessions: unknown,
  baselineRows: unknown,
): BaselineExclusionPayload[] | null {
  if (!isValidMinSessions(minSessions)) return null;
  if (!Array.isArray(raw) || !Array.isArray(baselineRows)) return null;
  if (raw.length > MAX_BASELINE_EXCLUSIONS) return null;
  if (!baselineRowsMeetMinSessions(baselineRows, minSessions)) return null;

  const reserved = new Set<string>();
  for (const item of baselineRows) {
    const symbol = normalizeSymbol(
      (item as { symbol?: unknown }).symbol,
    );
    if (!symbol) return null;
    reserved.add(symbol);
  }

  const seen = new Set<string>();
  const out: BaselineExclusionPayload[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const row = item as Record<string, unknown>;
    const symbol = normalizeSymbol(row.symbol);
    if (!symbol || symbol !== row.symbol) return null;
    if (seen.has(symbol) || reserved.has(symbol)) return null;
    seen.add(symbol);
    if (row.reason !== INSUFFICIENT_SESSIONS_REASON) return null;
    if (
      !isIntegerSessionCount(row.sessions_observed) ||
      row.sessions_observed < 1
    ) {
      return null;
    }
    if (row.min_sessions !== minSessions) return null;
    if (!(row.sessions_observed < minSessions)) return null;
    out.push({
      symbol,
      reason: INSUFFICIENT_SESSIONS_REASON,
      sessions_observed: row.sessions_observed,
      min_sessions: minSessions,
    });
  }
  return out;
}
