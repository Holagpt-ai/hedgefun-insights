import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CatalystEvent } from "@/types/catalyst";
import { CATALYST_EVENT_SELECT_FIELDS } from "@/lib/catalyst/catalyst-event-select-fields";
import { hydrateCatalystEvents } from "@/lib/catalyst/catalyst-event-verification";

function monthBounds(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

/** Fetches catalyst_events for the visible calendar month (event_date range). */
export function useHomepageCalendarMonth(year: number, month: number) {
  const { from, to } = monthBounds(year, month);
  return useQuery<CatalystEvent[]>({
    queryKey: ["homepage-calendar-month", year, month, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalyst_events")
        .select(CATALYST_EVENT_SELECT_FIELDS)
        .eq("verification_state", "provider_reported")
        .gte("event_date", from)
        .lte("event_date", to)
        .order("event_date", { ascending: true })
        .limit(1000);
      if (error) throw new Error(error.message);
      return hydrateCatalystEvents((data ?? []) as CatalystEvent[]);
    },
    staleTime: 60_000,
  });
}