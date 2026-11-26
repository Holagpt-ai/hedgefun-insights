export type EarningsViewMode = "Daily" | "Weekly";

export type EarningsCalendarRow = {
  id: string;
  symbol: string;
  company_name: string;
  report_date: string;
  time_of_day: string | null;
  estimate_eps: number | null;
  actual_eps?: number | null;
};

export type EarningsTimeFilter = "All" | "Before Open" | "After Close";

export function applyEarningsFilters<T extends EarningsCalendarRow>(
  items: T[],
  opts: { timeFilter: EarningsTimeFilter; searchValue: string },
): T[] {
  let out = items;
  if (opts.timeFilter !== "All") {
    const dbVal = opts.timeFilter === "Before Open" ? "before_open" : "after_close";
    out = out.filter((e) => e.time_of_day === dbVal);
  }
  if (opts.searchValue.trim()) {
    const q = opts.searchValue.trim().toLowerCase();
    out = out.filter(
      (e) => e.symbol.toLowerCase().includes(q) || e.company_name.toLowerCase().includes(q),
    );
  }
  return out;
}

export function selectEarningsForView(
  weekRows: EarningsCalendarRow[],
  opts: {
    viewMode: EarningsViewMode;
    selectedDateIso: string;
    timeFilter: EarningsTimeFilter;
    searchValue: string;
  },
): EarningsCalendarRow[] {
  const filtered = applyEarningsFilters(weekRows, {
    timeFilter: opts.timeFilter,
    searchValue: opts.searchValue,
  });
  if (opts.viewMode === "Daily") {
    return filtered.filter((e) => e.report_date === opts.selectedDateIso);
  }
  return filtered;
}

export function earningsTimeLabel(timeOfDay: string | null | undefined): string {
  if (!timeOfDay) return "Unknown";
  if (timeOfDay === "before_open") return "Before Open";
  if (timeOfDay === "after_close") return "After Close";
  return "Unknown";
}