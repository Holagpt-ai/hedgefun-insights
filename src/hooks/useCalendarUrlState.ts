import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { HOMEPAGE_CALENDAR_QUERY, type HomepageCalendarTab } from "@/config/homepage-v21";
import {
  CALENDAR_V4_QUERY,
  CALENDAR_V4_PRIMARY_FILTERS,
  calendarTabToPrimaryFilter,
  type CalendarV4PrimaryFilter,
  type CalendarV4View,
} from "@/config/calendar-v4";
import { etTodayParts } from "@/lib/homepage/calendar-month";

function parseIsoDate(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function parseTab(raw: string | null): HomepageCalendarTab {
  if (raw === "earnings" || raw === "economic" || raw === "catalyst") return raw;
  return "catalyst";
}

function parseView(raw: string | null): CalendarV4View {
  return raw === "list" ? "list" : "month";
}

function parseFilter(raw: string | null, tab: HomepageCalendarTab): CalendarV4PrimaryFilter {
  if (raw && (CALENDAR_V4_PRIMARY_FILTERS as readonly string[]).includes(raw)) {
    return raw as CalendarV4PrimaryFilter;
  }
  return calendarTabToPrimaryFilter(tab);
}

export function useCalendarUrlState() {
  const [params, setParams] = useSearchParams();
  const today = etTodayParts();

  const selectedDate = parseIsoDate(params.get(HOMEPAGE_CALENDAR_QUERY.date)) ?? today.iso;
  const tab = parseTab(params.get(HOMEPAGE_CALENDAR_QUERY.tab));
  const view = parseView(params.get(CALENDAR_V4_QUERY.view));
  const primaryFilter = parseFilter(params.get(CALENDAR_V4_QUERY.filter), tab);
  const tickerSearch = params.get(CALENDAR_V4_QUERY.q) ?? "";
  const highlightedEventId = params.get(CALENDAR_V4_QUERY.event);

  const viewYear = Number(selectedDate.slice(0, 4));
  const viewMonth = Number(selectedDate.slice(5, 7));

  const patch = useCallback(
    (patchParams: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patchParams)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      setParams(next, { replace: false });
    },
    [params, setParams],
  );

  const setSelectedDate = useCallback(
    (iso: string) => patch({ [HOMEPAGE_CALENDAR_QUERY.date]: iso }),
    [patch],
  );

  const setView = useCallback(
    (next: CalendarV4View) => patch({ [CALENDAR_V4_QUERY.view]: next }),
    [patch],
  );

  const setPrimaryFilter = useCallback(
    (next: CalendarV4PrimaryFilter) => patch({ [CALENDAR_V4_QUERY.filter]: next }),
    [patch],
  );

  const setTickerSearch = useCallback(
    (q: string) => patch({ [CALENDAR_V4_QUERY.q]: q.trim() || null }),
    [patch],
  );

  return useMemo(
    () => ({
      selectedDate,
      tab,
      view,
      primaryFilter,
      tickerSearch,
      highlightedEventId,
      viewYear,
      viewMonth,
      setSelectedDate,
      setView,
      setPrimaryFilter,
      setTickerSearch,
      patch,
    }),
    [
      highlightedEventId,
      patch,
      primaryFilter,
      selectedDate,
      setPrimaryFilter,
      setSelectedDate,
      setTickerSearch,
      setView,
      tab,
      tickerSearch,
      view,
      viewMonth,
      viewYear,
    ],
  );
}