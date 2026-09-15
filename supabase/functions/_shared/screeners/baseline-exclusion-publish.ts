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

function baselineRowSymbols(rows: unknown): Set<string> | null {
  if (!Array.isArray(rows)) return null;
  const out = new Set<string>();
  for (const item of rows) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const symbol = normalizeSymbol((item as { symbol?: unknown }).symbol);
    if (symbol) out.add(symbol);
  }
  return out;
}

/**
 * Returns a sanitized exclusion list, or null when any field is malformed.
 * Rejects duplicate symbols, overlap with baseline rows, unrecognized reasons,
 * non-integer session counts, and min-session mismatch.
 */
export function parseValidatedBaselineExclusions(
  raw: unknown,
  minSessions: unknown,
  baselineRows: unknown,
): BaselineExclusionPayload[] | null {
  if (!isValidMinSessions(minSessions)) return null;
  if (!Array.isArray(raw) || !Array.isArray(baselineRows)) return null;
  if (raw.length > MAX_BASELINE_EXCLUSIONS) return null;

  const reserved = baselineRowSymbols(baselineRows);
  if (!reserved) return null;

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
      typeof row.sessions_observed !== "number" ||
      !Number.isInteger(row.sessions_observed) ||
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
