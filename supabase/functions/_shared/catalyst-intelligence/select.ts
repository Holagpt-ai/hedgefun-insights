// Bounded, deterministic catalyst_events selection. Read-only.

import type { IntelligenceSelection } from "./activation.ts";

export interface CatalystEventRow {
  id: string;
  dedupe_key: string;
  symbol: string;
  company_name: string | null;
  event_type: string;
  verification_state: string | null;
  event_date: string;
  event_time: string | null;
  time_of_day: string | null;
  title: string;
  description: string | null;
  source_name: string;
  source_url: string | null;
  provider: string;
  provider_article_id: string | null;
  related_symbols: string[] | null;
  facts: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string | null;
}

export function eventOccurredMs(row: CatalystEventRow): number {
  for (const iso of [row.published_at, row.event_time, row.created_at]) {
    if (typeof iso === "string") {
      const ms = Date.parse(iso);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return 0;
}

/** published_at / event_time / created_at desc, then id asc. */
export function compareCatalystEventRows(a: CatalystEventRow, b: CatalystEventRow): number {
  const delta = eventOccurredMs(b) - eventOccurredMs(a);
  if (delta !== 0) return delta;
  return a.id.localeCompare(b.id);
}

export function applySelection(
  rows: CatalystEventRow[],
  selection: IntelligenceSelection,
): CatalystEventRow[] {
  let filtered = rows;
  if (selection.catalyst_event_id) {
    filtered = filtered.filter((r) => r.id === selection.catalyst_event_id);
  }
  if (selection.symbols && selection.symbols.length > 0) {
    const wanted = new Set(selection.symbols);
    filtered = filtered.filter((r) => wanted.has(r.symbol.toUpperCase()));
  }
  if (selection.provider) {
    filtered = filtered.filter((r) => r.provider.toLowerCase() === selection.provider);
  }
  if (selection.since) {
    const sinceMs = Date.parse(selection.since);
    filtered = filtered.filter((r) => eventOccurredMs(r) >= sinceMs);
  }
  return [...filtered].sort(compareCatalystEventRows).slice(0, selection.limit);
}
