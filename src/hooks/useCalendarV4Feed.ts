import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEconomicCalendarMonth } from "@/hooks/useEconomicCalendarMonth";
import { etTodayParts } from "@/lib/homepage/calendar-month";
import { fetchPublicCatalystCalendarRange } from "@/lib/catalyst/public-catalyst-calendar";
import { calendarCatalystQueryRange } from "@/lib/calendar-v4/calendar-range";
import {
  catalystToCalendarV4Event,
  dedupeCalendarEvents,
  economicToCalendarV4Event,
} from "@/lib/calendar-v4/normalize";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";

export function useCalendarV4Feed(viewYear: number, viewMonth: number, selectedDate: string) {
  const etToday = etTodayParts().iso;
  const { from, to } = calendarCatalystQueryRange(viewYear, viewMonth, selectedDate);
  const catalystQuery = useQuery({
    queryKey: ["public-catalyst-calendar", from, to],
    queryFn: () => fetchPublicCatalystCalendarRange(from, to),
    staleTime: 60_000,
  });
  const economicQuery = useEconomicCalendarMonth(viewYear, viewMonth);

  const retrievedAt = catalystQuery.dataUpdatedAt
    ? new Date(catalystQuery.dataUpdatedAt).toISOString()
    : null;

  const events = useMemo((): CalendarV4Event[] => {
    const catalystRows = (catalystQuery.data?.events ?? []).map((e) =>
      catalystToCalendarV4Event(e, etToday, retrievedAt),
    );
    const economicRows = (economicQuery.data?.events ?? []).map((row) =>
      economicToCalendarV4Event(row, etToday),
    );
    return dedupeCalendarEvents([...catalystRows, ...economicRows]).sort((a, b) => {
      if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate);
      const ta = a.eventTime ?? "";
      const tb = b.eventTime ?? "";
      if (ta !== tb) return ta.localeCompare(tb);
      return a.title.localeCompare(b.title);
    });
  }, [catalystQuery.data?.events, economicQuery.data?.events, etToday, retrievedAt]);

  const isLoading = catalystQuery.isLoading;
  const isError = catalystQuery.isError;
  const economicStatus = economicQuery.isLoading
    ? "loading"
    : economicQuery.data?.status ?? "unavailable";

  return {
    events,
    isLoading,
    isError,
    error: catalystQuery.error,
    refetch: catalystQuery.refetch,
    economicStatus,
    economicMessage: economicQuery.data?.message,
    highImpactCount: events.filter((e) => e.hasImpactEvidence && e.impact === "high").length,
    catalystCoverageIncomplete: catalystQuery.data?.coverageIncomplete ?? false,
    catalystTotalCount: catalystQuery.data?.totalCount ?? 0,
  };
}