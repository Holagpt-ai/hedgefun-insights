// Batch-fetches a single display-worthy catalyst event per screener symbol.
// Picks nearest upcoming scheduled event; if none, newest recent (72h)
// reported event. Never affects Screener sort/rank.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalystEvent } from "@/types/catalyst";
import { eventMomentMs } from "@/lib/catalyst/parsers";

export interface CatalystEnrichmentEntry {
  event: CatalystEvent;
  kind: "upcoming" | "recent";
}

export function useCatalystEnrichmentForSymbols(symbols: string[]) {
  const key = [...new Set(symbols.map((s) => s.toUpperCase()))].sort();
  return useQuery<Map<string, CatalystEnrichmentEntry>>({
    queryKey: ["catalyst_enrichment", key],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const nowMs = Date.now();
      const recentFrom = new Date(nowMs - 72 * 60 * 60 * 1000).toISOString();
      const upcomingTo = new Date(nowMs + 30 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const upcomingFrom = new Date(nowMs).toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("catalyst_events")
        .select(
          "id, dedupe_key, symbol, company_name, event_type, verification_state, event_date, event_time, time_of_day, title, description, source_name, source_url, provider, related_symbols, facts, published_at",
        )
        .eq("verification_state", "provider_reported")
        .in("symbol", key)
        .or(
          `and(published_at.gte.${recentFrom}),and(event_date.gte.${upcomingFrom},event_date.lte.${upcomingTo})`,
        )
        .limit(1000);

      if (error) throw error;
      const bySym = new Map<string, CatalystEnrichmentEntry>();
      for (const raw of (data ?? []) as CatalystEvent[]) {
        const m = eventMomentMs(raw);
        if (m === null) continue;
        const kind: "upcoming" | "recent" = m >= nowMs ? "upcoming" : "recent";
        const prev = bySym.get(raw.symbol);
        if (!prev) {
          bySym.set(raw.symbol, { event: raw, kind });
          continue;
        }
        // Priority: upcoming (nearest first) beats recent (newest first).
        const prevM = eventMomentMs(prev.event)!;
        if (prev.kind === "upcoming" && kind === "upcoming") {
          if (m < prevM) bySym.set(raw.symbol, { event: raw, kind });
        } else if (prev.kind === "recent" && kind === "upcoming") {
          bySym.set(raw.symbol, { event: raw, kind });
        } else if (prev.kind === "recent" && kind === "recent") {
          if (m > prevM) bySym.set(raw.symbol, { event: raw, kind });
        }
        // If prev.kind === "upcoming" && kind === "recent": keep prev.
      }
      return bySym;
    },
  });
}
