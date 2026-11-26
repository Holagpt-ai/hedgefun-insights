import { useMemo, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageSeo } from "@/hooks/usePageSeo";
import { CALENDAR_V4_META_DESCRIPTION, CALENDAR_V4_PAGE_TITLE, CALENDAR_V4_QUERY, type CalendarV4LegendCategory } from "@/config/calendar-v4";
import { canonicalUrl } from "@/config/seo";
import { useCalendarV4Feed } from "@/hooks/useCalendarV4Feed";
import { useCalendarUrlState } from "@/hooks/useCalendarUrlState";
import { useCalendarWatchlistSymbols } from "@/hooks/useCalendarWatchlistSymbols";
import {
  applyCalendarPrimaryFilter,
  applyLegendCategoryFilter,
  eventsForDay,
  filterCalendarByTickerSearch,
  countHighImpact,
} from "@/lib/calendar-v4/filters";
import { etTodayParts } from "@/lib/homepage/calendar-month";
import { CALENDAR_CATALYST_COVERAGE, CALENDAR_MACRO_COVERAGE } from "@/lib/calendar-v4/customer-copy";
import { CalendarMonthGrid } from "@/components/calendar-v4/CalendarMonthGrid";
import { CalendarListView } from "@/components/calendar-v4/CalendarListView";
import { CalendarFilters } from "@/components/calendar-v4/CalendarFilters";
import { CalendarLegend } from "@/components/calendar-v4/CalendarLegend";
import { CalendarDayAgenda } from "@/components/calendar-v4/CalendarDayAgenda";
import { CalendarAIDayBrief } from "@/components/calendar-v4/CalendarAIDayBrief";
import { CalendarWeekSnapshot } from "@/components/calendar-v4/CalendarWeekSnapshot";
import { CalendarTickerPreview } from "@/components/calendar-v4/CalendarTickerPreview";
import { CalendarFullChart } from "@/components/calendar-v4/CalendarFullChart";
import { CalendarPinnedIntelligence } from "@/components/calendar-v4/CalendarPinnedIntelligence";
import { CalendarPowerSection } from "@/components/calendar-v4/CalendarPowerSection";
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

  const [hiddenLegend, setHiddenLegend] = useState<Set<CalendarV4LegendCategory>>(new Set());
  const [pinnedSymbol, setPinnedSymbol] = useState<string | null>(null);
  const [pinnedEvent, setPinnedEvent] = useState<CalendarV4Event | null>(null);
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
    rows = applyLegendCategoryFilter(rows, hiddenLegend);
    return rows;
  }, [feed.events, url.primaryFilter, url.tickerSearch, watchlist, hiddenLegend]);

  const monthHighImpact = useMemo(() => countHighImpact(filteredEvents), [filteredEvents]);

  const dayEvents = useMemo(() => {
    const day = eventsForDay(filteredEvents, url.selectedDate);
    return [...day].sort((a, b) => {
      const ha = a.hasImpactEvidence && a.impact === "high" ? 1 : 0;
      const hb = b.hasImpactEvidence && b.impact === "high" ? 1 : 0;
      if (ha !== hb) return hb - ha;
      return (a.eventTime ?? "").localeCompare(b.eventTime ?? "");
    });
  }, [filteredEvents, url.selectedDate]);

  const pinFromDay = useCallback((events: CalendarV4Event[]) => {
    const first = events.find((e) => e.symbols[0]);
    if (first?.symbols[0]) {
      setPinnedSymbol(first.symbols[0]);
      setPinnedEvent(first);
    } else if (url.tickerSearch.trim()) {
      const q = url.tickerSearch.trim().toUpperCase();
      const match = events.find((e) => e.symbols.some((s) => s.toUpperCase() === q));
      if (match?.symbols[0]) {
        setPinnedSymbol(match.symbols[0]);
        setPinnedEvent(match);
      }
    }
  }, [url.tickerSearch]);

  useEffect(() => {
    pinFromDay(dayEvents);
  }, [dayEvents, pinFromDay]);

  const shiftMonth = (delta: number) => {
    const d = new Date(url.viewYear, url.viewMonth - 1 + delta, 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    url.setSelectedDate(iso);
  };

  const pinTicker = (symbol: string, event: CalendarV4Event) => {
    setPinnedSymbol(symbol.toUpperCase());
    setPinnedEvent(event);
    url.patch({ [CALENDAR_V4_QUERY.event]: event.eventId });
  };

  const openChart = (symbol: string, event: CalendarV4Event | null) => {
    setChartSymbol(symbol);
    setChartEvent(event);
    setChartOpen(true);
    setPreviewSymbol(null);
  };

  const toggleLegend = (id: CalendarV4LegendCategory) => {
    setHiddenLegend((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const macroStatusLine =
    feed.economicStatus === "loading"
      ? CALENDAR_MACRO_COVERAGE.loading
      : feed.economicStatus === "error"
        ? CALENDAR_MACRO_COVERAGE.error
        : feed.economicStatus === "unavailable"
          ? CALENDAR_MACRO_COVERAGE.unavailable
          : null;

  return (
    <div className="cal-v4-page cal-muse">
      <header className="cal-page-head">
        <div>
          <h1 className="cal-v4-title">{CALENDAR_V4_PAGE_TITLE}</h1>
          <p className="cal-page-sub">
            {monthTitle(url.viewYear, url.viewMonth)} ·{" "}
            <strong>{filteredEvents.length}</strong> catalysts · <strong>{monthHighImpact}</strong> high impact
            (evidence-backed)
          </p>
          {macroStatusLine ? <p className="text-xs text-muted-foreground mt-1">{macroStatusLine}</p> : null}
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

      <CalendarFilters
        filter={url.primaryFilter}
        onFilter={url.setPrimaryFilter}
        tickerSearch={url.tickerSearch}
        onTickerSearch={url.setTickerSearch}
      />

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

      <CalendarLegend hidden={hiddenLegend} onToggle={toggleLegend} />

      <CalendarAIDayBrief date={url.selectedDate} events={dayEvents} />

      <div className="cal-cal-card relative">
        {feed.isLoading ? (
          <Skeleton className="h-[320px] w-full" />
        ) : feed.isError ? (
          <p className="text-sm text-destructive p-4">{CALENDAR_CATALYST_COVERAGE.error}</p>
        ) : url.view === "month" ? (
          <CalendarMonthGrid
            year={url.viewYear}
            month={url.viewMonth}
            selectedDate={url.selectedDate}
            events={filteredEvents}
            onSelectDate={url.setSelectedDate}
            onChipSymbol={(sym, ev) => {
              pinTicker(sym, ev);
              if (mobile) setPreviewSymbol(sym);
              else setPreviewSymbol(sym);
              setPreviewEvent(ev);
            }}
          />
        ) : (
          <CalendarListView
            events={filteredEvents}
            highlightedEventId={url.highlightedEventId}
            onSelectEvent={(ev) => {
              url.setSelectedDate(ev.eventDate);
              pinTicker(ev.symbols[0] ?? "", ev);
              url.patch({ [CALENDAR_V4_QUERY.event]: ev.eventId });
            }}
            onHoverSymbol={(sym, ev) => {
              if (sym && ev) {
                setPreviewSymbol(sym);
                setPreviewEvent(ev);
              } else {
                setPreviewSymbol(null);
                setPreviewEvent(null);
              }
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

      <div className="cal-dayview">
        <CalendarDayAgenda
          date={url.selectedDate}
          events={dayEvents}
          onPin={pinTicker}
          onOpenChart={openChart}
          selectedEventId={url.highlightedEventId}
        />
        <CalendarPinnedIntelligence
          symbol={pinnedSymbol}
          event={pinnedEvent}
          onOpenChart={() => pinnedSymbol && openChart(pinnedSymbol, pinnedEvent)}
        />
      </div>

      <CalendarWeekSnapshot anchorDate={url.selectedDate} events={filteredEvents} onSelectDate={url.setSelectedDate} />

      <CalendarPowerSection />

      <CalendarFullChart open={chartOpen} onOpenChange={setChartOpen} symbol={chartSymbol} event={chartEvent} />
    </div>
  );
}