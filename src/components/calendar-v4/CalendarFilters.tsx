import {
  CALENDAR_V4_PRIMARY_FILTER_LABEL,
  CALENDAR_V4_PRIMARY_FILTERS,
  type CalendarV4PrimaryFilter,
} from "@/config/calendar-v4";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { primaryFilterCounts } from "@/lib/calendar-v4/filters";
import { useMemo } from "react";

interface Props {
  filter: CalendarV4PrimaryFilter;
  onFilter: (f: CalendarV4PrimaryFilter) => void;
  tickerSearch: string;
  onTickerSearch: (q: string) => void;
  monthEvents: CalendarV4Event[];
  watchlistSymbols: ReadonlySet<string> | null;
}

export function CalendarFilters({
  filter,
  onFilter,
  tickerSearch,
  onTickerSearch,
  monthEvents,
  watchlistSymbols,
}: Props) {
  const { user } = useAuth();
  const counts = useMemo(
    () => primaryFilterCounts(monthEvents, watchlistSymbols),
    [monthEvents, watchlistSymbols],
  );

  return (
    <div className="cal-v4-toolbar" data-testid="calendar-v4-filters">
      <div className="cal-v4-filters" role="group" aria-label="Event filters">
        {CALENDAR_V4_PRIMARY_FILTERS.map((id) => {
          if (id === "watchlist" && !user) return null;
          return (
            <button
              key={id}
              type="button"
              className="cal-v4-filter-btn"
              aria-pressed={filter === id}
              onClick={() => onFilter(id)}
            >
              {CALENDAR_V4_PRIMARY_FILTER_LABEL[id]}
              <span className="cal-filter-count">{counts[id]}</span>
            </button>
          );
        })}
      </div>
      <Input
        type="search"
        placeholder="Search ticker or headline"
        value={tickerSearch}
        onChange={(e) => onTickerSearch(e.target.value)}
        className="h-8 max-w-xs text-sm"
        aria-label="Ticker search"
      />
    </div>
  );
}