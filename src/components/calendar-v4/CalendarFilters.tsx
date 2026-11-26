import {
  CALENDAR_V4_PRIMARY_FILTER_LABEL,
  CALENDAR_V4_PRIMARY_FILTERS,
  type CalendarV4PrimaryFilter,
} from "@/config/calendar-v4";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  filter: CalendarV4PrimaryFilter;
  onFilter: (f: CalendarV4PrimaryFilter) => void;
  tickerSearch: string;
  onTickerSearch: (q: string) => void;
}

export function CalendarFilters({ filter, onFilter, tickerSearch, onTickerSearch }: Props) {
  const { user } = useAuth();

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