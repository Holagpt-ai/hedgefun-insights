import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type CalendarCachedAnalysis = {
  ticker: string;
  summary: string;
  sentiment: string | null;
  confidence: number | null;
  analyzed_at: string;
};

const CALENDAR_AI_SELECT = "ticker,summary,sentiment,confidence,analyzed_at";

/** Read-only cached analysis for calendar — no alerts, no realtime, no generation. */
export function useCalendarCachedIntelligence(symbols: string[], selectedDate: string) {
  const { user } = useAuth();
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))].slice(0, 8);

  return useQuery<Record<string, CalendarCachedAnalysis>>({
    queryKey: ["calendar-cached-ai", user?.id ?? "guest", selectedDate, unique.join(",")],
    enabled: !!user && unique.length > 0,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlist_ai_analysis")
        .select(CALENDAR_AI_SELECT)
        .in("ticker", unique);
      if (error) throw new Error(error.message);
      const map: Record<string, CalendarCachedAnalysis> = {};
      for (const row of (data ?? []) as CalendarCachedAnalysis[]) {
        map[row.ticker.toUpperCase()] = {
          ...row,
          ticker: row.ticker.toUpperCase(),
        };
      }
      return map;
    },
  });
}