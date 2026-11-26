import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HOMEPAGE_V21_CALENDAR_TABS,
  type HomepageCalendarTab,
} from "@/config/homepage-v21";
import { buildHomepageCalendarOutbound, filterCatalystEventsForDay } from "@/lib/homepage/calendar-events";
import { buildMonthGrid, etTodayParts, eventCountForDay } from "@/lib/homepage/calendar-month";
import { useHomepageCalendarMonth } from "@/hooks/useHomepageCalendarMonth";
import { useLanguage } from "@/contexts/LanguageContext";
import { homepageV21Copy, type HomepageV21Lang } from "@/lib/homepage/homepage-v21-copy";
import { getEffectiveLanguage } from "@/config/locale-v1.policy";
import { cn } from "@/lib/utils";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function monthTitle(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export function HomepageTradingCalendar() {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  const lang = getEffectiveLanguage(language, pathname) as HomepageV21Lang;
  const copy = homepageV21Copy(lang);
  const today = etTodayParts();

  const [tab, setTab] = useState<HomepageCalendarTab>("catalyst");
  const [viewYear, setViewYear] = useState(today.year);
  const [viewMonth, setViewMonth] = useState(today.month);
  const [selectedDate, setSelectedDate] = useState(today.iso);

  const eventsQuery = useHomepageCalendarMonth(viewYear, viewMonth);
  const grid = useMemo(
    () => buildMonthGrid(viewYear, viewMonth, today.iso),
    [viewYear, viewMonth, today.iso],
  );

  const rows = useMemo(
    () => filterCatalystEventsForDay(eventsQuery.data, selectedDate, tab, today.iso),
    [eventsQuery.data, selectedDate, tab, today.iso],
  );

  const selectedCell = grid.find((c) => c.iso === selectedDate);
  const outbound = buildHomepageCalendarOutbound(tab, selectedDate);
  const fullLinkLabel =
    tab === "earnings" ? copy.calendarViewEarnings : tab === "catalyst" ? copy.calendarCatalystV4Soon : null;

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };

  return (
    <section aria-labelledby="hp-calendar-heading" className="hp-card band-calendar flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <CalendarDays className="h-4 w-4 text-[var(--hp-blue)]" />
        <h2 id="hp-calendar-heading" className="text-base font-extrabold">
          {copy.calendarTitle}
        </h2>
        <div className="flex-1" />
        {fullLinkLabel && outbound.kind === "link" ? (
          <Link to={outbound.href} className="text-xs font-bold text-[var(--hp-blue)]">
            {fullLinkLabel}
          </Link>
        ) : fullLinkLabel ? (
          <span
            className="text-xs font-semibold text-[var(--hp-ink-3)]"
            title={`${copy.calendarHandoffDate}: ${selectedDate}`}
          >
            {fullLinkLabel}
          </span>
        ) : null}
      </div>

      <div className="cal-tabs flex gap-1 px-2 pb-2" role="tablist">
        {HOMEPAGE_V21_CALENDAR_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-xs font-bold",
              tab === t.id ? "bg-[var(--hp-blue)] text-white" : "bg-muted/30 text-[var(--hp-ink-2)]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-y border-[var(--hp-line)] px-3 py-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
          className="rounded-lg border border-[var(--hp-line)] p-1"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-extrabold text-[var(--hp-ink)]">{monthTitle(viewYear, viewMonth)}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
          className="rounded-lg border border-[var(--hp-line)] p-1"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {tab !== "economic" ? (
        <>
          <div className="tcal-grid px-3 pt-2">
            {DOW.map((d) => (
              <span key={d} className="tcal-dow text-center text-[10px] font-bold text-[var(--hp-ink-3)]">
                {d}
              </span>
            ))}
            {grid.map((cell) => {
              const count = cell.inMonth ? eventCountForDay(eventsQuery.data, cell.iso, tab) : 0;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  className={cn(
                    "tcal-day relative min-h-9 rounded-md text-xs font-semibold",
                    !cell.inMonth && "opacity-40",
                    cell.isWeekend && "text-[var(--hp-ink-3)]",
                    cell.isToday && "ring-2 ring-[var(--hp-blue)]",
                    selectedDate === cell.iso && "bg-[var(--hp-blue)] text-white",
                    cell.holidayName && selectedDate !== cell.iso && "underline decoration-amber-500",
                  )}
                  onClick={() => cell.inMonth && setSelectedDate(cell.iso)}
                  disabled={!cell.inMonth}
                >
                  {cell.day}
                  {count > 0 && (
                    <span
                      className={cn(
                        "absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                        selectedDate === cell.iso ? "bg-white" : "bg-[var(--hp-blue)]",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="px-4 py-1 text-[10px] text-[var(--hp-ink-3)]">
            {selectedCell?.holidayName ? `${copy.calendarHoliday}: ${selectedCell.holidayName}` : null}
            {!selectedCell?.holidayName && selectedCell?.earlyClose ? copy.calendarEarlyClose : null}
          </div>
        </>
      ) : null}

      <div className="day-label mx-4 mt-1 rounded-md border border-[var(--hp-line)] bg-muted/20 px-2 py-1 text-xs font-extrabold">
        {selectedDate === today.iso ? `${copy.calendarToday} — ` : ""}
        {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {tab === "economic" ? (
          <p className="text-sm text-[var(--hp-ink-2)]">{copy.calendarEconomicUnavailable}</p>
        ) : eventsQuery.isLoading && !eventsQuery.isFetched ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : eventsQuery.isError ? (
          <p className="text-sm text-[var(--hp-ink-2)]">{copy.calendarFeedError}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--hp-ink-2)]">{copy.calendarNoEvents(tab)}</p>
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 12).map((ev) => (
              <li key={ev.eventId} className="border-b border-[var(--hp-line)] pb-2 last:border-0">
                <p className="text-sm font-semibold leading-snug">{ev.title}</p>
                <p className="text-xs text-[var(--hp-ink-3)]">
                  {ev.symbols[0] ? `${ev.symbols[0]} · ` : ""}
                  {ev.eventTime ? `${ev.eventTime} ET` : "Time TBD"}
                  {ev.impact !== "unknown" ? ` · ${ev.impact} impact` : ""}
                  {" · "}
                  {ev.source}
                  {" · "}
                  {ev.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}