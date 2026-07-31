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
  /** Deterministic ordering key used during selection. */
  sortMs: number;
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

function publishedRecentSortMs(row: {
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

/**
 * PostgREST fetch bounds for screener enrichment.
 * `eventDateFrom` looks back through the recent window so date-only scheduled
 * events remain retrievable after UTC midnight even when `published_at` is an
 * older announcement timestamp.
 */
export function enrichmentFetchWindow(nowMs: number): {
  recentFromIso: string;
  eventDateFrom: string;
  upcomingTo: string;
} {
  return {
    recentFromIso: new Date(nowMs - ENRICHMENT_RECENT_MS).toISOString(),
    eventDateFrom: new Date(nowMs - ENRICHMENT_RECENT_MS).toISOString().slice(0, 10),
    upcomingTo: new Date(nowMs + ENRICHMENT_UPCOMING_MS).toISOString().slice(0, 10),
  };
}

/**
 * True when a provider event_date string falls inside the fetch window that
 * covers both recently completed scheduled events and the upcoming horizon.
 */
export function eventDateInFetchWindow(
  eventDate: string,
  nowMs: number,
): boolean {
  const { eventDateFrom, upcomingTo } = enrichmentFetchWindow(nowMs);
  return eventDate >= eventDateFrom && eventDate <= upcomingTo;
}

/**
 * Classify a provider-reported event for screener enrichment.
 * Scheduled eligibility uses event_time / event_date only — never
 * published_at — so an older announcement timestamp cannot demote or drop a
 * valid earnings row. Recently completed scheduled events stay eligible for
 * the approved 72h recent window.
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
  if (scheduled !== null) {
    if (scheduled >= nowMs && scheduled <= nowMs + ENRICHMENT_UPCOMING_MS) {
      return { kind: "upcoming", sortMs: scheduled };
    }
    if (scheduled < nowMs && scheduled >= nowMs - ENRICHMENT_RECENT_MS) {
      return { kind: "recent", sortMs: scheduled };
    }
  }

  const recent = publishedRecentSortMs(row);
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
  if (prev.kind === "upcoming" && nextKind === "upcoming") {
    if (nextSortMs !== prev.sortMs) return nextSortMs < prev.sortMs;
    return nextId < prev.event.id;
  }
  if (prev.kind === "recent" && nextKind === "upcoming") return true;
  if (prev.kind === "recent" && nextKind === "recent") {
    if (nextSortMs !== prev.sortMs) return nextSortMs > prev.sortMs;
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
      bySym.set(sym, {
        event: raw,
        kind: classified.kind,
        sortMs: classified.sortMs,
      });
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
