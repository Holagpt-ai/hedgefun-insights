import { useMemo } from "react";
import { useHomepageCalendarMonth } from "@/hooks/useHomepageCalendarMonth";
import { useEconomicCalendarMonth } from "@/hooks/useEconomicCalendarMonth";
import { etTodayParts } from "@/lib/homepage/calendar-month";
import {
  catalystToCalendarV4Event,
  dedupeCalendarEvents,
  economicToCalendarV4Event,
} from "@/lib/calendar-v4/normalize";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";

export function useCalendarV4Feed(viewYear: number, viewMonth: number) {
  const etToday = etTodayParts().iso;
  const catalystQuery = useHomepageCalendarMonth(viewYear, viewMonth);
  const economicQuery = useEconomicCalendarMonth(viewYear, viewMonth);

  const retrievedAt = catalystQuery.dataUpdatedAt
    ? new Date(catalystQuery.dataUpdatedAt).toISOString()
    : null;

  const events = useMemo((): CalendarV4Event[] => {
    const catalystRows = (catalystQuery.data ?? []).map((e) =>
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
  }, [catalystQuery.data, economicQuery.data?.events, etToday, retrievedAt]);

  const isLoading = catalystQuery.isLoading;
  const isError = catalystQuery.isError;
  const economicStatus = economicQuery.data?.status ?? (economicQuery.isLoading ? "loading" : "unavailable");

  return {
    events,
    isLoading,
    isError,
    error: catalystQuery.error,
    refetch: catalystQuery.refetch,
    economicStatus,
    economicMessage: economicQuery.data?.message,
    highImpactCount: events.filter((e) => e.hasImpactEvidence && e.impact === "high").length,
  };
}