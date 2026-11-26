import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalystEvents } from "@/hooks/useCatalystEvents";
import {
  HOMEPAGE_V21_CALENDAR_TABS,
  type HomepageCalendarTab,
} from "@/config/homepage-v21";
import {
  buildCalendarDeepLink,
  filterCatalystEventsForDay,
} from "@/lib/homepage/calendar-events";
import { easternParts } from "@/lib/market-session";

function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function etTodayIso(): string {
  const p = easternParts(Date.now());
  if (!p) return new Date().toISOString().slice(0, 10);
  const y = p.year;
  const m = String(p.month).padStart(2, "0");
  const day = String(p.day).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function HomepageTradingCalendar() {
  const [tab, setTab] = useState<HomepageCalendarTab>("catalyst");
  const [selectedDate, setSelectedDate] = useState(etTodayIso);

  const eventsQuery = useCatalystEvents({
    recentDays: 3,
    upcomingDays: 21,
    limit: 500,
    eventDateOrder: "asc",
  });

  const rows = useMemo(
    () => filterCatalystEventsForDay(eventsQuery.data, selectedDate, tab),
    [eventsQuery.data, selectedDate, tab],
  );

  const fullCalendarHref = buildCalendarDeepLink(selectedDate, tab);

  return (
    <section aria-labelledby="hp-calendar-heading" className="hp-card">
      <div className="flex items-center gap-2 border-b border-[var(--hp-line)] px-4 pt-3 pb-2">
        <CalendarDays className="h-4 w-4 text-[var(--hp-blue)]" />
        <h2 id="hp-calendar-heading" className="text-base font-extrabold">
          Trading Calendar
        </h2>
      </div>
      <div className="flex gap-1 p-2" role="tablist">
        {HOMEPAGE_V21_CALENDAR_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold ${
              tab === t.id ? "bg-[var(--hp-blue)] text-white" : "bg-muted/30 text-[var(--hp-ink-2)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-y border-[var(--hp-line)] px-3 py-2">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => setSelectedDate((d) => shiftIsoDate(d, -1))}
          className="rounded-lg border border-[var(--hp-line)] p-1"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-extrabold text-[var(--hp-ink)]">
          {formatDayLabel(selectedDate)}
        </span>
        <button
          type="button"
          aria-label="Next day"
          onClick={() => setSelectedDate((d) => shiftIsoDate(d, 1))}
          className="rounded-lg border border-[var(--hp-line)] p-1"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto px-4 py-3">
        {tab === "economic" ? (
          <p className="text-sm text-[var(--hp-ink-2)]">
            Economic calendar data is not connected yet. Missing dependency: verified macro economic
            event feed (no production endpoint).
          </p>
        ) : eventsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : eventsQuery.isError ? (
          <p className="text-sm text-[var(--hp-ink-2)]">Calendar feed unavailable. Try again later.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--hp-ink-2)]">
            No {tab === "earnings" ? "earnings" : "catalyst"} events on this day.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 12).map((ev) => (
              <li key={ev.eventId} className="border-b border-[var(--hp-line)] pb-2 last:border-0">
                <p className="text-sm font-semibold leading-snug">{ev.title}</p>
                <p className="text-xs text-[var(--hp-ink-3)]">
                  {ev.symbols[0] ? `${ev.symbols[0]} · ` : ""}
                  {ev.eventTime ?? "Time TBD"} ET · {ev.source} · {ev.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link
        to={fullCalendarHref}
        className="flex items-center justify-center gap-1 border-t border-[var(--hp-line)] py-2 text-xs font-bold text-[var(--hp-blue)]"
      >
        View full calendar →
      </Link>
    </section>
  );
}