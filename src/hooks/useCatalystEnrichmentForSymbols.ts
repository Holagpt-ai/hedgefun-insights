// Batch-fetches a single display-worthy catalyst event per screener symbol.
// Picks nearest upcoming scheduled event; if none, newest recent (72h)
// reported event. Never affects Screener sort/rank.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalystEvent } from "@/types/catalyst";
import {
  batchHitRowLimit,
  chunkSymbols,
  ENRICHMENT_BATCH_ROW_LIMIT,
  enrichmentFetchWindow,
  normalizeEnrichmentSymbols,
  selectEnrichmentEntries,
  symbolsMissingFromPayload,
  type CatalystEnrichmentEntry,
} from "@/lib/catalyst/enrichment";

export type { CatalystEnrichmentEntry };

const CATALYST_SELECT =
  "id, dedupe_key, symbol, company_name, event_type, verification_state, event_date, event_time, time_of_day, title, description, source_name, source_url, provider, related_symbols, facts, published_at";

async function fetchCatalystRowsForSymbols(
  symbols: string[],
  recentFrom: string,
  eventDateFrom: string,
  upcomingTo: string,
  limit: number,
): Promise<CatalystEvent[]> {
  if (symbols.length === 0) return [];
  const { data, error } = await supabase
    .from("catalyst_events")
    .select(CATALYST_SELECT)
    .eq("verification_state", "provider_reported")
    .in("symbol", symbols)
    .or(
      // Recent news by published_at, OR scheduled events whose event_date falls
      // in [now-72h … now+30d] so date-only earnings survive UTC midnight even
      // when announcement published_at is older than the recent window.
      `and(published_at.gte.${recentFrom}),and(event_date.gte.${eventDateFrom},event_date.lte.${upcomingTo})`,
    )
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CatalystEvent[];
}

/** Exported for focused tests — network boundary only. */
export async function fetchCatalystEventsForEnrichment(
  symbols: string[],
  nowMs: number = Date.now(),
): Promise<CatalystEvent[]> {
  const key = normalizeEnrichmentSymbols(symbols);
  if (key.length === 0) return [];

  const { recentFromIso, eventDateFrom, upcomingTo } =
    enrichmentFetchWindow(nowMs);

  const collected: CatalystEvent[] = [];
  const seenIds = new Set<string>();

  const pushAll = (rows: CatalystEvent[]) => {
    for (const row of rows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      collected.push(row);
    }
  };

  for (const batch of chunkSymbols(key)) {
    const rows = await fetchCatalystRowsForSymbols(
      batch,
      recentFromIso,
      eventDateFrom,
      upcomingTo,
      ENRICHMENT_BATCH_ROW_LIMIT,
    );
    pushAll(rows);

    // Truncation guard: a full batch may have excluded symbols that still
    // have qualifying events. Re-query absentees one symbol at a time.
    if (batchHitRowLimit(rows.length)) {
      for (const missing of symbolsMissingFromPayload(batch, rows)) {
        const solo = await fetchCatalystRowsForSymbols(
          [missing],
          recentFromIso,
          eventDateFrom,
          upcomingTo,
          ENRICHMENT_BATCH_ROW_LIMIT,
        );
        pushAll(solo);
      }
    }
  }

  return collected;
}

export function useCatalystEnrichmentForSymbols(symbols: string[]) {
  const key = normalizeEnrichmentSymbols(symbols);
  return useQuery<Map<string, CatalystEnrichmentEntry>>({
    queryKey: ["catalyst_enrichment", key],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const nowMs = Date.now();
      const rows = await fetchCatalystEventsForEnrichment(key, nowMs);
      return selectEnrichmentEntries(rows, key, nowMs);
    },
  });
}
