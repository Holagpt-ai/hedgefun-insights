import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageSeo } from "@/hooks/usePageSeo";
import { CALENDAR_V4_META_DESCRIPTION, CALENDAR_V4_PAGE_TITLE, CALENDAR_V4_QUERY } from "@/config/calendar-v4";
import { canonicalUrl } from "@/config/seo";
import { useCalendarV4Feed } from "@/hooks/useCalendarV4Feed";
import { useCalendarUrlState } from "@/hooks/useCalendarUrlState";
import { useCalendarWatchlistSymbols } from "@/hooks/useCalendarWatchlistSymbols";
import {
  applyCalendarPrimaryFilter,
  eventsForDay,
  filterCalendarByTickerSearch,
} from "@/lib/calendar-v4/filters";
import { etTodayParts } from "@/lib/homepage/calendar-month";
import { CalendarMonthGrid } from "@/components/calendar-v4/CalendarMonthGrid";
import { CalendarListView } from "@/components/calendar-v4/CalendarListView";
import { CalendarFilters } from "@/components/calendar-v4/CalendarFilters";
import { CalendarLegend } from "@/components/calendar-v4/CalendarLegend";
import { CalendarDayAgenda } from "@/components/calendar-v4/CalendarDayAgenda";
import { CalendarAIDayBrief } from "@/components/calendar-v4/CalendarAIDayBrief";
import { CalendarWeekSnapshot } from "@/components/calendar-v4/CalendarWeekSnapshot";
import { CalendarTickerPreview } from "@/components/calendar-v4/CalendarTickerPreview";
import { CalendarFullChart } from "@/components/calendar-v4/CalendarFullChart";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import "@/components/calendar-v4/calendar-v4.css";

function monthTitle(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export default function CatalystCalendarPage() {
  const url = useCalendarUrlState();
  const today = etTodayParts();
  const watchlist = useCalendarWatchlistSymbols();
  const feed = useCalendarV4Feed(url.viewYear, url.viewMonth);

  const [previewSymbol, setPreviewSymbol] = useState<string | null>(null);
  const [previewEvent, setPreviewEvent] = useState<CalendarV4Event | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartSymbol, setChartSymbol] = useState("");
  const [chartEvent, setChartEvent] = useState<CalendarV4Event | null>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  usePageSeo({
    title: `${CALENDAR_V4_PAGE_TITLE} | Stocksist`,
    description: CALENDAR_V4_META_DESCRIPTION,
    canonical: canonicalUrl("/calendar"),
  });

  const filteredEvents = useMemo(() => {
    let rows = applyCalendarPrimaryFilter(feed.events, url.primaryFilter, watchlist);
    rows = filterCalendarByTickerSearch(rows, url.tickerSearch);
    return rows;
  }, [feed.events, url.primaryFilter, url.tickerSearch, watchlist]);

  const dayEvents = useMemo(
    () => eventsForDay(filteredEvents, url.selectedDate),
    [filteredEvents, url.selectedDate],
  );

  const shiftMonth = (delta: number) => {
    const d = new Date(url.viewYear, url.viewMonth - 1 + delta, 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    url.setSelectedDate(iso);
  };

  const openChart = (symbol: string, event: CalendarV4Event | null) => {
    setChartSymbol(symbol);
    setChartEvent(event);
    setChartOpen(true);
    setPreviewSymbol(null);
  };

  return (
    <div className="cal-v4-page">
      <header className="cal-v4-header">
        <div>
          <h1 className="cal-v4-title">{CALENDAR_V4_PAGE_TITLE}</h1>
          <div className="cal-v4-stats">
            <span className="cal-v4-stat">
              <strong>{filteredEvents.length}</strong> catalysts this month
            </span>
            <span className="cal-v4-stat">
              <strong>{feed.highImpactCount}</strong> high impact (evidence-backed)
            </span>
            {feed.economicStatus === "unavailable" ? (
              <span className="cal-v4-stat">Macro feed pending activation</span>
            ) : null}
          </div>
        </div>
        <div className="cal-v4-toggle" role="group" aria-label="Calendar view">
          <button type="button" aria-pressed={url.view === "month"} onClick={() => url.setView("month")}>
            Month
          </button>
          <button type="button" aria-pressed={url.view === "list"} onClick={() => url.setView("list")}>
            List
          </button>
        </div>
      </header>

      <div className="cal-v4-toolbar">
        <Button variant="outline" size="sm" className="h-8" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-extrabold min-w-[10rem] text-center">{monthTitle(url.viewYear, url.viewMonth)}</span>
        <Button variant="outline" size="sm" className="h-8" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" className="h-8" onClick={() => url.setSelectedDate(today.iso)}>
          Today
        </Button>
      </div>

      <CalendarFilters
        filter={url.primaryFilter}
        onFilter={url.setPrimaryFilter}
        tickerSearch={url.tickerSearch}
        onTickerSearch={url.setTickerSearch}
      />

      <CalendarLegend />

      <div className="cal-v4-layout mt-3">
        <div className="cal-v4-main-card relative">
          {feed.isLoading ? (
            <Skeleton className="h-[420px] w-full" />
          ) : feed.isError ? (
            <p className="text-sm text-destructive p-2">Calendar feed failed to load. Try refreshing.</p>
          ) : url.view === "month" ? (
            <CalendarMonthGrid
              year={url.viewYear}
              month={url.viewMonth}
              selectedDate={url.selectedDate}
              events={filteredEvents}
              onSelectDate={url.setSelectedDate}
            />
          ) : (
            <CalendarListView
              events={filteredEvents}
              highlightedEventId={url.highlightedEventId}
              onSelectEvent={(ev) => {
                url.setSelectedDate(ev.eventDate);
                url.patch({ [CALENDAR_V4_QUERY.event]: ev.eventId });
              }}
              onHoverSymbol={(sym, ev) => {
                setPreviewSymbol(sym);
                setPreviewEvent(ev);
              }}
            />
          )}

          {previewSymbol && !chartOpen ? (
            <div
              className={mobile ? "fixed inset-0 z-50 bg-black/40" : "absolute top-2 right-2"}
              onClick={() => !mobile && setPreviewSymbol(null)}
              role="presentation"
            >
              <div onClick={(e) => e.stopPropagation()} role="presentation">
                <CalendarTickerPreview
                  symbol={previewSymbol}
                  event={previewEvent}
                  mobileSheet={mobile}
                  onViewFullChart={() => openChart(previewSymbol, previewEvent)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <aside className="cal-v4-side-stack">
          <CalendarAIDayBrief date={url.selectedDate} events={dayEvents} />
          <CalendarDayAgenda date={url.selectedDate} events={dayEvents} onOpenChart={openChart} />
          <CalendarWeekSnapshot anchorDate={url.selectedDate} events={filteredEvents} onSelectDate={url.setSelectedDate} />
        </aside>
      </div>

      <p className="cal-v4-footer-note">
        Events come from verified catalyst ingestion (SEC EDGAR, earnings providers, and news wires). Macro economic
        releases use the `economic_events` store when the sync worker is activated in Lovable Cloud — never fabricated
        schedules or consensus figures. Quotes are delayed per provider entitlements.
      </p>
      {feed.economicMessage && url.primaryFilter === "macro" ? (
        <p className="text-xs text-muted-foreground mt-2">{feed.economicMessage}</p>
      ) : null}

      <CalendarFullChart
        open={chartOpen}
        onOpenChange={setChartOpen}
        symbol={chartSymbol}
        event={chartEvent}
      />
    </div>
  );
}