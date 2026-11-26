import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EconomicCalendarRow, EconomicFeedResult } from "@/lib/calendar-v4/economic-types";

function monthBounds(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

const ECONOMIC_SELECT =
  "id,dedupe_key,event_name,country,event_date,event_time,importance,actual_value,consensus_estimate,previous_value,units,source,source_url,provider,description,actual_reported_at,fetched_at";

/**
 * Reads `economic_events` when deployed; otherwise returns unavailable without failing the calendar.
 */
export function useEconomicCalendarMonth(year: number, month: number) {
  const { from, to } = monthBounds(year, month);
  return useQuery<EconomicFeedResult>({
    queryKey: ["economic-calendar-month", year, month, from, to],
    queryFn: async (): Promise<EconomicFeedResult> => {
      const client = supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => {
            gte: (col: string, val: string) => {
              lte: (col: string, val: string) => {
                order: (col: string, opts: { ascending: boolean }) => {
                  limit: (n: number) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
                };
              };
            };
          };
        };
      };
      const { data, error } = await client
        .from("economic_events")
        .select(ECONOMIC_SELECT)
        .gte("event_date", from)
        .lte("event_date", to)
        .order("event_date", { ascending: true })
        .limit(500);

      if (error) {
        const code = (error as { code?: string }).code ?? "";
        if (code === "42P01" || code === "PGRST205" || /economic_events/.test(error.message)) {
          return {
            status: "unavailable",
            events: [],
            message:
              "Macro calendar storage is not active in this environment. Economic releases will appear after the sync worker is authorized in Lovable Cloud.",
          };
        }
        return { status: "error", events: [], message: error.message };
      }

      const events = ((data ?? []) as unknown) as EconomicCalendarRow[];
      return {
        status: events.length ? "ready" : "empty",
        events,
        message: events.length ? undefined : "No macro releases in range for the selected month.",
      };
    },
    staleTime: 120_000,
    retry: 0,
  });
}