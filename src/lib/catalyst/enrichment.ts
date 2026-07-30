// Pure Screener→Catalyst enrichment helpers.
// Selection and symbol normalization only — no React, no network I/O.

import type { CatalystEvent } from "@/types/catalyst";
import {
  eventMomentMs,
  normalizeSymbol,
  scheduledMomentMs,
} from "@/lib/catalyst/parsers";

export interface CatalystEnrichmentEntry {
  event: CatalystEvent;
  kind: "upcoming" | "recent";
}

/** Max symbols per PostgREST `.in()` request (keeps URL size safe). */
export const ENRICHMENT_SYMBOL_BATCH_SIZE = 25;

/**
 * Per-batch row budget. When a response fills this budget, symbols absent
 * from the payload are re-fetched individually so truncation cannot silently
 * drop a requested ticker that has qualifying events.
 */
export const ENRICHMENT_BATCH_ROW_LIMIT = 500;

export const ENRICHMENT_RECENT_MS = 72 * 60 * 60 * 1000;
export const ENRICHMENT_UPCOMING_MS = 30 * 86_400_000;

/** Canonicalize and de-dupe screener symbols at the enrichment boundary. */
export function normalizeEnrichmentSymbols(symbols: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of symbols) {
    const s = normalizeSymbol(raw);
    if (s) out.add(s);
  }
  return [...out].sort();
}

export function chunkSymbols(
  symbols: readonly string[],
  batchSize: number = ENRICHMENT_SYMBOL_BATCH_SIZE,
): string[][] {
  if (batchSize <= 0) return [normalizeEnrichmentSymbols(symbols)];
  const key = normalizeEnrichmentSymbols(symbols);
  const chunks: string[][] = [];
  for (let i = 0; i < key.length; i += batchSize) {
    chunks.push(key.slice(i, i + batchSize));
  }
  return chunks;
}

export function catalystSymbolHref(symbol: string): string | null {
  const s = normalizeSymbol(symbol);
  if (!s) return null;
  return `/dashboard/catalyst?symbol=${encodeURIComponent(s)}`;
}

function recentSortMs(row: {
  published_at?: string | null;
  event_time?: string | null;
  event_date?: string | null;
}): number | null {
  if (row.published_at) {
    const t = Date.parse(row.published_at);
    if (Number.isFinite(t)) return t;
  }
  return eventMomentMs(row);
}

function entrySortMs(entry: CatalystEnrichmentEntry): number | null {
  return entry.kind === "upcoming"
    ? scheduledMomentMs(entry.event)
    : recentSortMs(entry.event);
}

/**
 * Classify a provider-reported event for screener enrichment.
 * Upcoming uses the scheduled moment (event_time / event_date) — never
 * published_at — so a future earnings row is not demoted by an older
 * announcement timestamp.
 */
export function classifyEnrichmentEvent(
  row: {
    published_at?: string | null;
    event_time?: string | null;
    event_date?: string | null;
  },
  nowMs: number,
): { kind: "upcoming" | "recent"; sortMs: number } | null {
  const scheduled = scheduledMomentMs(row);
  if (
    scheduled !== null &&
    scheduled >= nowMs &&
    scheduled <= nowMs + ENRICHMENT_UPCOMING_MS
  ) {
    return { kind: "upcoming", sortMs: scheduled };
  }

  const recent = recentSortMs(row);
  if (
    recent !== null &&
    recent <= nowMs &&
    recent >= nowMs - ENRICHMENT_RECENT_MS
  ) {
    return { kind: "recent", sortMs: recent };
  }
  return null;
}

function shouldReplace(
  prev: CatalystEnrichmentEntry,
  nextKind: "upcoming" | "recent",
  nextSortMs: number,
  nextId: string,
): boolean {
  const prevSort = entrySortMs(prev);
  if (prevSort === null) return true;

  if (prev.kind === "upcoming" && nextKind === "upcoming") {
    if (nextSortMs !== prevSort) return nextSortMs < prevSort;
    return nextId < prev.event.id;
  }
  if (prev.kind === "recent" && nextKind === "upcoming") return true;
  if (prev.kind === "recent" && nextKind === "recent") {
    if (nextSortMs !== prevSort) return nextSortMs > prevSort;
    return nextId < prev.event.id;
  }
  // prev upcoming + next recent → keep upcoming
  return false;
}

/**
 * Deterministically pick one display event per requested symbol:
 * nearest upcoming scheduled event, else newest recent (72h) event.
 * Map keys are always normalizeSymbol() results.
 */
export function selectEnrichmentEntries(
  events: readonly CatalystEvent[],
  requestedSymbols: readonly string[],
  nowMs: number,
): Map<string, CatalystEnrichmentEntry> {
  const wanted = new Set(normalizeEnrichmentSymbols(requestedSymbols));
  const bySym = new Map<string, CatalystEnrichmentEntry>();

  for (const raw of events) {
    const sym = normalizeSymbol(raw.symbol);
    if (!sym || !wanted.has(sym)) continue;

    const classified = classifyEnrichmentEvent(raw, nowMs);
    if (!classified) continue;

    const prev = bySym.get(sym);
    if (
      !prev ||
      shouldReplace(prev, classified.kind, classified.sortMs, raw.id)
    ) {
      bySym.set(sym, { event: raw, kind: classified.kind });
    }
  }
  return bySym;
}

/**
 * After a capped batch response, return requested symbols that did not appear
 * in the payload. Callers re-query these individually when the batch was full,
 * so a global row limit cannot silently exclude a valid ticker.
 */
export function symbolsMissingFromPayload(
  requestedBatch: readonly string[],
  events: readonly { symbol?: string | null }[],
): string[] {
  const seen = new Set<string>();
  for (const e of events) {
    const s = normalizeSymbol(e.symbol);
    if (s) seen.add(s);
  }
  return normalizeEnrichmentSymbols(requestedBatch).filter((s) => !seen.has(s));
}

export function batchHitRowLimit(
  rowCount: number,
  limit: number = ENRICHMENT_BATCH_ROW_LIMIT,
): boolean {
  return rowCount >= limit;
}
