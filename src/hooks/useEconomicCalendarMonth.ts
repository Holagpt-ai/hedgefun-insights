import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EconomicCalendarRow, EconomicFeedResult } from "@/lib/calendar-v4/economic-types";
import { CALENDAR_MACRO_COVERAGE } from "@/lib/calendar-v4/customer-copy";

function monthBounds(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

const ECONOMIC_SELECT =
  "id,dedupe_key,event_name,country,event_date,event_time,importance,actual_value,consensus_estimate,previous_value,units,source,source_url,provider,description,actual_reported_at,fetched_at";

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
            limit: (n: number) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
          };
        };
      };

      const statusRes = await client
        .from("economic_sync_status")
        .select("last_success_at,last_window_from,last_window_to,provider")
        .limit(1);

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
            message: CALENDAR_MACRO_COVERAGE.unavailable,
          };
        }
        return { status: "error", events: [], message: CALENDAR_MACRO_COVERAGE.error };
      }

      const events = ((data ?? []) as unknown) as EconomicCalendarRow[];
      const syncRow = (statusRes.data as Record<string, unknown>[] | null)?.[0] as
        | {
            last_success_at?: string | null;
            last_window_from?: string | null;
            last_window_to?: string | null;
          }
        | undefined;

      const lastSyncAt = syncRow?.last_success_at ?? null;
      const coverageWindow =
        syncRow?.last_window_from && syncRow?.last_window_to
          ? { from: String(syncRow.last_window_from), to: String(syncRow.last_window_to) }
          : null;

      if (!lastSyncAt && events.length === 0) {
        return {
          status: "never_synced",
          events: [],
          message: CALENDAR_MACRO_COVERAGE.neverSynced,
          lastSyncAt,
          coverageWindow,
        };
      }

      if (events.length === 0) {
        return {
          status: "empty_in_range",
          events: [],
          message: CALENDAR_MACRO_COVERAGE.emptyInRange,
          lastSyncAt,
          coverageWindow,
        };
      }

      return {
        status: "ready",
        events,
        lastSyncAt,
        coverageWindow,
      };
    },
    staleTime: 120_000,
    retry: 0,
  });
}